import base64
import requests
import time
import os
import re
from functools import wraps

from grocery_organizer.src.core.models import FullProduct

def retry_api_call(max_retries=3, backoff_factor=1):
    """Decorator to retry API calls with exponential backoff"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (requests.exceptions.RequestException, KeyError, IndexError, ValueError) as e:
                    if attempt == max_retries - 1:
                        print(f"API call failed after {max_retries} attempts: {e}")
                        raise
                    
                    wait_time = backoff_factor * (2 ** attempt)
                    print(f"API call attempt {attempt + 1} failed: {e}. Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
            return None
        return wrapper
    return decorator

class KrogerAPI:

    AUTH_URL = 'https://api.kroger.com/v1/connect/oauth2/token'
    PRODUCT_URL = 'https://api.kroger.com/v1/products'
    LOCATIONS_URL = 'https://api.kroger.com/v1/locations'
    CLIENT_ID = 'aislefinder5000-bbcct110'

    #TODO need to take location as an option
    def __init__(self, store_id: str = "01400943"):
        self.store_id = store_id
        self.access_token = None
        self.token_expiration = 0

    @retry_api_call(max_retries=3, backoff_factor=1)
    def get_auth_token(self):
        if self.access_token is not None and time.time() < self.token_expiration:
            return self.access_token

        client_secret = os.getenv('KROGER_CLIENT_SECRET')
        if not client_secret:
            raise ValueError("KROGER_CLIENT_SECRET environment variable is required")
        
        auth_code = self.CLIENT_ID + ':' + client_secret

        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + base64.b64encode(auth_code.encode('utf-8')).decode('utf-8')
        }
        data = {'grant_type': 'client_credentials', 'scope': 'product.compact'}

        response = requests.post(self.AUTH_URL, headers = headers, data=data)
        response.raise_for_status()  # Raise an exception for bad status codes

        response_data = response.json()
        token = response_data['access_token']
        self.access_token = token
        self.token_expiration = time.time() + response_data['expires_in'] - 60 #refresh one minute before our token expires

        return token

    def _preprocess_search_term(self, product_name):
        """Clean up search term by removing numbers, quantities, and filler words"""
        # Convert to lowercase for processing
        cleaned = product_name.lower().strip()
        
        # Remove common quantity words and numbers
        quantity_patterns = [
            r'\b\d+\s*(lbs?|pounds?|oz|ounces?|grams?|kg|kilograms?)\b',  # weights
            r'\b\d+\s*(gallons?|quarts?|pints?|cups?|liters?|ml)\b',      # volumes
            r'\b\d+\s*(packs?|packages?|boxes?|bags?|containers?|jars?|cans?|bottles?)\b',  # containers
            r'\b\d+\s*(loaves?|cartons?|dozens?|bunches?|heads?)\b',      # specific units
            r'\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(lbs?|pounds?|gallons?|cartons?|loaves?|dozens?|bunches?|heads?)\b',  # written numbers with units
            r'\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+',  # written numbers
            r'\ba\s+dozen\b',  # "a dozen"
            r'\b\d+\s+',  # any remaining standalone numbers
        ]
        
        for pattern in quantity_patterns:
            cleaned = re.sub(pattern, ' ', cleaned)
        
        # Remove filler words that don't help with product matching
        filler_words = [
            'of', 'a', 'an', 'the', 'some', 'any', 'fresh', 'organic', 'natural',
            'large', 'small', 'medium', 'big', 'little', 'extra', 'super',
            'pack', 'package', 'container', 'bag', 'box', 'jar', 'can', 'bottle'
        ]
        
        # Split into words and filter
        words = cleaned.split()
        filtered_words = [word for word in words if word not in filler_words and len(word) > 1]
        
        # Rejoin and clean up extra spaces
        result = ' '.join(filtered_words).strip()
        
        # If we filtered everything out, use original term
        if not result:
            result = product_name.strip()
            
        return result

    @retry_api_call(max_retries=3, backoff_factor=1)
    def find_product(self, product_name):
        # Clean up the search term before calling API
        cleaned_search_term = self._preprocess_search_term(product_name)
        print(f"Searching for '{product_name}' -> cleaned: '{cleaned_search_term}'")
        
        #Prepare API Request
        token = self.get_auth_token()
        headers = {'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache'}
        payload = {'filter.term': cleaned_search_term, 'filter.locationId': self.store_id}
        response = requests.get(self.PRODUCT_URL, headers=headers, params=payload)
        response.raise_for_status()  # Raise an exception for bad status codes

        response_data = response.json()
        if not response_data.get('data') or len(response_data['data']) == 0:
            print(f"No product data found for: {product_name}, adding to Not Found")
            return FullProduct(
                product_name,
                f"{product_name} (not found in store)",
                "Not Found",
                -1  # Unknown aisle
            )

        product_data = response_data['data'][0]
        
        # Validate product relevance using both original and cleaned search terms
        if not self._is_product_relevant(product_name, product_data) and not self._is_product_relevant(cleaned_search_term, product_data):
            # Try to find a better match from other results
            for alt_product in response_data['data'][:3]:  # Check first 3 results
                if self._is_product_relevant(product_name, alt_product) or self._is_product_relevant(cleaned_search_term, alt_product):
                    product_data = alt_product
                    print(f"Found better match for '{product_name}': {alt_product['description']}")
                    break
            else:
                # No good match found, put in "Not Found" category
                print(f"Warning: No relevant product found for '{product_name}', adding to Not Found")
                return FullProduct(
                    product_name,
                    f"{product_name} (not found in store)",
                    "Not Found",
                    -1  # Unknown aisle
                )

        #extract response into object
        categories = product_data.get('categories', [])
        category = categories[0] if categories else 'Unknown'
        aisle_locations = product_data.get('aisleLocations', [])
        aisle_number = int(aisle_locations[0]['number']) if aisle_locations else -1

        found_product = FullProduct(
            product_name,
            product_data['description'],
            category,
            aisle_number
        )

        return found_product
    
    def _is_product_relevant(self, search_term, product_data):
        """Check if the returned product is relevant to the search term"""
        search_words = set(search_term.lower().split())
        description = product_data.get('description', '').lower()
        
        # Remove common words that don't help with matching
        common_words = {'the', 'and', 'or', 'with', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an'}
        search_words = search_words - common_words
        
        if not search_words:
            return True  # If only common words, accept the match
        
        # Check if any search word appears in the product description
        for word in search_words:
            if len(word) >= 3 and word in description:
                return True
        
        # Special cases for common mismatches
        irrelevant_indicators = [
            'gift card', 'digital', 'download', 'membership', 'subscription',
            'delivery fee', 'service charge', 'warranty', 'insurance'
        ]
        
        for indicator in irrelevant_indicators:
            if indicator in description:
                return False
        
        # If search term is very short, be more lenient
        if len(search_term.strip()) <= 3:
            return True
            
        return False

    @retry_api_call(max_retries=3, backoff_factor=1)
    def find_stores_by_zip(self, zip_code):
        """Find Kroger stores by zip code"""
        token = self.get_auth_token()
        headers = {'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache'}
        payload = {'filter.zipCode.near': zip_code, 'filter.radiusInMiles': 25, 'filter.limit': 10}
        
        response = requests.get(self.LOCATIONS_URL, headers=headers, params=payload)
        response.raise_for_status()  # Raise an exception for bad status codes
        
        response_data = response.json()
        locations_data = response_data.get('data', [])
        
        stores = []
        for location in locations_data:
            if not all(key in location for key in ['locationId', 'name', 'address']):
                continue  # Skip malformed location data
                
            addr = location['address']
            store = {
                'id': location['locationId'],
                'name': location['name'],
                'address': f"{addr.get('addressLine1', '')}, {addr.get('city', '')}, {addr.get('state', '')} {addr.get('zipCode', '')}",
                'distance': location.get('distance', 0)
            }
            stores.append(store)
            
        return stores
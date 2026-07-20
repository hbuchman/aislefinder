import base64
import requests
import time
import os
import threading
from functools import wraps

from grocery_organizer.src.core.models import FullProduct
from grocery_organizer.src.store_api.search_terms import preprocess_search_term

def retry_api_call(max_retries=3, backoff_factor=1):
    """Retry network failures with exponential backoff.

    Only requests.RequestException is retried — deterministic errors
    (bad config, malformed response parsing) would fail identically on
    every attempt, so they propagate immediately.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except requests.exceptions.RequestException as e:
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
    """Client for the Kroger Products and Locations APIs.

    find_product() returns a FullProduct; find_stores_by_zip() returns store
    dicts with id, name, address, and distance.
    """

    AUTH_URL = 'https://api.kroger.com/v1/connect/oauth2/token'
    PRODUCT_URL = 'https://api.kroger.com/v1/products'
    LOCATIONS_URL = 'https://api.kroger.com/v1/locations'

    def __init__(self, store_id: str = "01400943"):
        self.store_id = store_id
        self.access_token = None
        self.token_expiration = 0
        self._token_lock = threading.Lock()

    @retry_api_call(max_retries=3, backoff_factor=1)
    def get_auth_token(self):
        # Fast path: token is still valid (no lock needed for read)
        if self.access_token is not None and time.time() < self.token_expiration:
            return self.access_token

        with self._token_lock:
            # Re-check after acquiring lock (another thread may have refreshed)
            if self.access_token is not None and time.time() < self.token_expiration:
                return self.access_token

            # Kroger's API terms treat client IDs as developer credentials that
            # may not be embedded in open source projects, so both halves come
            # from the environment.
            client_id = os.getenv('KROGER_CLIENT_ID')
            client_secret = os.getenv('KROGER_CLIENT_SECRET')
            if not client_id or not client_secret:
                raise ValueError("KROGER_CLIENT_ID and KROGER_CLIENT_SECRET environment variables are required")

            auth_code = client_id + ':' + client_secret

            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + base64.b64encode(auth_code.encode('utf-8')).decode('utf-8')
            }
            data = {'grant_type': 'client_credentials', 'scope': 'product.compact'}

            response = requests.post(self.AUTH_URL, headers = headers, data=data)
            response.raise_for_status()

            response_data = response.json()
            token = response_data['access_token']
            self.access_token = token
            self.token_expiration = time.time() + response_data['expires_in'] - 60

            return token

    def _preprocess_search_term(self, product_name):
        """Clean up a search term (shared logic in search_terms.py)."""
        return preprocess_search_term(product_name)

    _spell_checker = None  # lazy class-level cache

    def _spell_correct(self, term: str) -> str:
        """Return spell-corrected term; returns original if correction unavailable."""
        try:
            from spellchecker import SpellChecker
            if KrogerAPI._spell_checker is None:
                KrogerAPI._spell_checker = SpellChecker()
            words = term.split()
            corrected = [KrogerAPI._spell_checker.correction(w) or w for w in words]
            return ' '.join(corrected)
        except ImportError:
            return term

    @retry_api_call(max_retries=3, backoff_factor=1)
    def _fetch_scored_candidates(self, product_name, search_term, limit):
        """Make one Products API call and return up to `limit` scored candidates."""
        token = self.get_auth_token()
        headers = {'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache'}
        payload = {'filter.term': search_term, 'filter.locationId': self.store_id}
        response = requests.get(self.PRODUCT_URL, headers=headers, params=payload)
        response.raise_for_status()

        candidates = response.json().get('data') or []
        if not candidates:
            return []

        scored = []
        for candidate in candidates[:10]:
            if self._is_product_relevant(product_name, candidate) or self._is_product_relevant(search_term, candidate):
                score = max(
                    self._score_product(product_name, candidate),
                    self._score_product(search_term, candidate)
                )
                scored.append((score, candidate))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for _, c in scored[:limit]]

    def _search_top_matches(self, product_name, limit=5):
        """Search the Products API and return up to `limit` scored candidates, best first.

        Falls back to a spell-corrected search term when the initial query returns
        no relevant results and the corrected term differs from the original.
        """
        cleaned_search_term = self._preprocess_search_term(product_name)
        print(f"Searching for '{product_name}' -> cleaned: '{cleaned_search_term}'")

        top = self._fetch_scored_candidates(product_name, cleaned_search_term, limit)

        if not top:
            corrected = self._spell_correct(cleaned_search_term)
            if corrected != cleaned_search_term:
                print(f"No results for '{cleaned_search_term}'; retrying with spell-corrected '{corrected}'")
                top = self._fetch_scored_candidates(product_name, corrected, limit)

        if not top:
            print(f"Warning: No relevant product found for '{product_name}'")
        return top

    def _search_best_match(self, product_name):
        """Return the single best-scoring candidate (used by find_product)."""
        top = self._search_top_matches(product_name, limit=1)
        return top[0] if top else None

    def find_product(self, product_name):
        product_data = self._search_best_match(product_name)
        if product_data is None:
            return FullProduct(
                product_name,
                f"{product_name} (not found in store)",
                "Not Found",
                -1  # Unknown aisle
            )

        # Extract response into object
        categories = product_data.get('categories', [])
        category = categories[0] if categories else 'Unknown'
        category = self._normalize_category(category)
        aisle_locations = product_data.get('aisleLocations', [])
        aisle_number = int(aisle_locations[0]['number']) if aisle_locations else -1

        return FullProduct(
            product_name,
            product_data['description'],
            category,
            aisle_number
        )

    def find_item_details(self, product_name, limit=5):
        """Full details for the shop screen's item help view.

        Returns a list of up to `limit` results ranked by relevance score,
        each with name, brand, size, category, image URL, and in-aisle location.
        Returns an empty list when no relevant products were found.
        """
        candidates = self._search_top_matches(product_name, limit=limit)
        results = []
        for product_data in candidates:
            categories = product_data.get('categories', [])
            items = product_data.get('items', [])
            aisle_locations = product_data.get('aisleLocations', [])
            location = None
            if aisle_locations:
                loc = aisle_locations[0]
                location = {
                    'aisle': loc.get('number'),
                    'side': loc.get('side'),  # 'L' or 'R'
                    'shelf': loc.get('shelfNumber'),
                    'bay': loc.get('bayNumber'),
                    'description': loc.get('description'),
                }
            results.append({
                'name': product_data.get('description'),
                'brand': product_data.get('brand'),
                'size': items[0].get('size') if items else None,
                'category': self._normalize_category(categories[0]) if categories else None,
                'image': self._front_image_url(product_data),
                'location': location,
            })
        return results

    @staticmethod
    def _front_image_url(product_data):
        """Medium front-perspective image URL, falling back to any image/size."""
        images = product_data.get('images', [])
        front = next((img for img in images if img.get('perspective') == 'front'), None)
        image = front or (images[0] if images else None)
        if not image:
            return None
        sizes = {s.get('size'): s.get('url') for s in image.get('sizes', [])}
        return sizes.get('medium') or sizes.get('large') or next(iter(sizes.values()), None)


    # Map Kroger categories to more intuitive shopper-friendly names
    CATEGORY_MAP = {
        'breakfast': 'Dairy',
        'eggs & egg substitutes': 'Dairy',
        'cold cereal': 'Breakfast & Cereal',
        'candy': 'Snacks',
        'cookies & crackers': 'Snacks',
    }

    @classmethod
    def _normalize_category(cls, category):
        """Map API categories to more intuitive names for shoppers."""
        return cls.CATEGORY_MAP.get(category.lower(), category)

    # Non-grocery categories that indicate a bad match
    NON_GROCERY_KEYWORDS = [
        'gift card', 'digital', 'download', 'membership', 'subscription',
        'delivery fee', 'service charge', 'warranty', 'insurance',
        'candle', 'air freshener', 'detergent', 'cleaner', 'cleaning',
        'soap', 'shampoo', 'lotion', 'fragrance', 'scented',
        'pet food', 'dog food', 'cat food', 'pet treat',
        'supplement', 'vitamin',
    ]

    @staticmethod
    def _normalize(text):
        """Remove hyphens and apostrophes for fuzzy comparison"""
        return text.replace('-', '').replace("'", '')

    def _fuzzy_word_match(self, search_word, description):
        """Check if a search word matches any word in the description.

        Uses word-level comparison to avoid false positives like "ice" matching "rice".
        Allows prefix/suffix overlap so "cheezit" matches "cheezits" and vice versa.
        Also allows suffix matching for compound words like "berries" in "strawberries".
        """
        word_norm = self._normalize(search_word.lower())
        desc_words = self._normalize(description.lower()).split()
        for dw in desc_words:
            # Exact word match
            if word_norm == dw:
                return True
            if len(word_norm) >= 3 and len(dw) >= 3:
                # Prefix: one word starts with the other (plurals, brand variants)
                if dw.startswith(word_norm) or word_norm.startswith(dw):
                    return True
                # Suffix: search word is a suffix of description word
                # e.g. "berries" matches "strawberries", "fish" matches "swordfish"
                if len(word_norm) >= 5 and dw.endswith(word_norm):
                    return True
        return False

    def _is_product_relevant(self, search_term, product_data):
        """Check if the returned product is relevant to the search term"""
        search_words = set(search_term.lower().split())
        description = product_data.get('description', '').lower()

        # Remove common words that don't help with matching
        common_words = {'the', 'and', 'or', 'with', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an'}
        search_words = search_words - common_words
        # Only consider words long enough to be meaningful
        matchable_words = [w for w in search_words if len(w) >= 3]

        if not matchable_words:
            return True  # If only common/short words, accept the match

        # Count how many search words appear in the product description
        matched_count = sum(1 for word in matchable_words
                           if self._fuzzy_word_match(word, description))

        # For multi-word searches, require at least half of words to match
        # For single-word searches, require that one word to match
        required = max(1, (len(matchable_words) + 1) // 2)
        if matched_count < required:
            # If search term is very short, be more lenient
            if len(search_term.strip()) <= 3:
                return True
            return False

        # Words matched, but check it's not a non-grocery product
        # e.g. "lemon" matches "lemon-scented candle" but that's not what we want
        # Only filter if the blocked keyword is NOT part of what the user searched for
        search_lower = search_term.lower()
        for keyword in self.NON_GROCERY_KEYWORDS:
            if keyword in description and keyword not in search_lower:
                return False

        return True

    def _score_product(self, search_term, product_data):
        """Score a product result for relevance. Higher is better."""
        description = product_data.get('description', '').lower()
        description_norm = self._normalize(description)
        search_lower = search_term.lower().strip()
        search_lower_norm = self._normalize(search_lower)
        search_words = set(search_lower.split())
        score = 0

        # Full description matches the search term (best possible match)
        desc_words = set(description.split())
        search_word_set = set(search_lower.split())
        if desc_words == search_word_set or set(description_norm.split()) == set(search_lower_norm.split()):
            score += 15

        # Exact phrase match in description
        if search_lower in description or search_lower_norm in description_norm:
            score += 10

        # Count how many search words appear in description
        for word in search_words:
            if len(word) >= 3 and self._fuzzy_word_match(word, description):
                score += 3

        # Penalize non-grocery products, but not if the user searched for that keyword
        for keyword in self.NON_GROCERY_KEYWORDS:
            if keyword in description and keyword not in search_lower:
                score -= 20

        # Prefer products with aisle locations (actual in-store items)
        if product_data.get('aisleLocations'):
            score += 5

        # Prefer fresh categories over frozen when user didn't ask for frozen
        categories = product_data.get('categories', [])
        cat_lower = categories[0].lower() if categories else ''
        if 'frozen' not in search_lower:
            if cat_lower in ['produce', 'fresh fruits & vegetables', 'fresh vegetables',
                             'fresh fruits', 'bakery', 'deli', 'meat & seafood']:
                score += 5
            elif 'frozen' in cat_lower:
                score -= 5

        # Prefer shorter descriptions (closer to base product)
        desc_len = len(description)
        if desc_len < 20:
            score += 4
        elif desc_len < 40:
            score += 2

        return score

    @retry_api_call(max_retries=3, backoff_factor=1)
    def find_stores_by_zip(self, zip_code):
        """Find Kroger stores by zip code"""
        token = self.get_auth_token()
        headers = {'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache'}
        payload = {'filter.zipCode.near': zip_code, 'filter.radiusInMiles': 25, 'filter.limit': 10}

        response = requests.get(self.LOCATIONS_URL, headers=headers, params=payload)
        response.raise_for_status()  # Raise an exception for bad status codes

        return self._parse_locations(response.json().get('data', []))

    @staticmethod
    def _parse_locations(locations_data):
        """Convert raw Kroger locations into store dicts for the store picker.

        Skips fuel kiosks (they match zip searches but carry junk aisle data)
        and leaves distance as None when the API omits it, so the frontend
        shows nothing rather than a misleading "0.0 mi".
        """
        stores = []
        for location in locations_data:
            if not all(key in location for key in ['locationId', 'name', 'address']):
                continue  # Skip malformed location data
            if 'fuel' in location['name'].lower():
                continue

            addr = location['address']
            stores.append({
                'id': location['locationId'],
                'name': location['name'],
                'address': f"{addr.get('addressLine1', '')}, {addr.get('city', '')}, {addr.get('state', '')} {addr.get('zipCode', '')}",
                'distance': location.get('distance'),
            })
        return stores
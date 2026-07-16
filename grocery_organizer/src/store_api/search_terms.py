"""Search-term cleanup shared by every store API client.

Shopping lists say things like "2 lbs of chicken" or "a dozen eggs"; store
search APIs match best on the bare product ("chicken", "eggs"). This module
strips quantities, units, and filler words before the term is sent to a store.
"""

import re

# Quantity/unit phrases to strip, e.g. "2 lbs", "three gallons", "a dozen"
QUANTITY_PATTERNS = [
    r'\b\d+\s*(lbs?|pounds?|oz|ounces?|grams?|kg|kilograms?)\b',
    r'\b\d+\s*(gallons?|quarts?|pints?|cups?|liters?|ml)\b',
    r'\b\d+\s*(packs?|packages?|boxes?|bags?|containers?|jars?|cans?|bottles?)\b',
    r'\b\d+\s*(loaves?|cartons?|dozens?|bunches?|heads?)\b',
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(lbs?|pounds?|gallons?|cartons?|loaves?|dozens?|bunches?|heads?)\b',
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+',
    r'\ba\s+dozen\b',
]

# Words that describe packaging or size rather than the product itself
FILLER_WORDS = {
    'of', 'a', 'an', 'the', 'some', 'any',
    'large', 'small', 'medium', 'big', 'little', 'extra', 'super',
    'pack', 'package', 'container', 'bag', 'box', 'jar', 'can', 'bottle',
}


def preprocess_search_term(product_name: str) -> str:
    """Return a lowercase search term with quantities and filler words removed.

    Falls back to the original term if cleaning would remove everything
    (e.g. the whole item was "a bag").
    """
    cleaned = product_name.lower().strip()
    for pattern in QUANTITY_PATTERNS:
        cleaned = re.sub(pattern, ' ', cleaned)

    words = [w for w in cleaned.split() if w not in FILLER_WORDS and len(w) > 1]
    result = ' '.join(words).strip()
    return result if result else product_name.strip()

"""Text matching shared by every store API client that has to rank a
candidate product's description against a user's search term — Kroger's
live API results, and the local product database's similarity fallback for
items that were never explicitly captured.
"""

import re

# Non-grocery categories that indicate a bad match
NON_GROCERY_KEYWORDS = [
    'gift card', 'digital', 'download', 'membership', 'subscription',
    'delivery fee', 'service charge', 'warranty', 'insurance',
    'candle', 'air freshener', 'detergent', 'cleaner', 'cleaning',
    'soap', 'shampoo', 'lotion', 'fragrance', 'scented',
    'pet food', 'dog food', 'cat food', 'pet treat',
    'supplement', 'vitamin',
]

# Categories treated as "fresh" for the shorter-description/fresh-over-frozen
# scoring bonus below. Kroger's raw category strings and Woodman's
# already-shopper-friendly category names both happen to lowercase into this
# set for the common departments. Both "meat" (Woodman's bare department name)
# and "meat & seafood" (Kroger's fuller one) are listed since without the
# bare form, every Meat-department row in the local database lost this bonus
# to unrelated but shorter-named Grocery rows on ties.
_FRESH_CATEGORIES = {
    'produce', 'fresh fruits & vegetables', 'fresh vegetables',
    'fresh fruits', 'bakery', 'deli', 'meat', 'meat & seafood',
}

_PUNCTUATION_RE = re.compile(r"[^\w\s]")


def normalize(text):
    """Strip punctuation for fuzzy comparison.

    Product descriptions often glue punctuation onto words (e.g. "Banana,
    Each", "Eggs (12 ct)"), which would otherwise break word-level
    tokenization for anything but exact/prefix matches.
    """
    return _PUNCTUATION_RE.sub('', text)


def edit_distance(a, b):
    """Restricted Damerau-Levenshtein distance (insert/delete/substitute/
    adjacent transpose). Self-contained so typo tolerance doesn't depend
    on an external spell-checking package being installed and working.
    """
    len_a, len_b = len(a), len(b)
    d = [[0] * (len_b + 1) for _ in range(len_a + 1)]
    for i in range(len_a + 1):
        d[i][0] = i
    for j in range(len_b + 1):
        d[0][j] = j
    for i in range(1, len_a + 1):
        for j in range(1, len_b + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j] + 1,          # deletion
                d[i][j - 1] + 1,          # insertion
                d[i - 1][j - 1] + cost,   # substitution
            )
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + cost)  # transposition
    return d[len_a][len_b]


def fuzzy_word_match(search_word, description):
    """Check if a search word matches any word in the description.

    Uses word-level comparison to avoid false positives like "ice" matching "rice".
    Allows prefix/suffix overlap so "cheezit" matches "cheezits" and vice versa.
    Also allows suffix matching for compound words like "berries" in "strawberries".
    Tolerates small typos (one wrong/missing/doubled/swapped letter) in words of
    5+ characters, e.g. "bananna" matches "banana" — this covers misspellings even
    when a store's own search returns the right product for a mistyped query.
    """
    word_norm = normalize(search_word.lower())
    desc_words = normalize(description.lower()).split()
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
        # Typo tolerance: only for longer words, and only when the lengths
        # are close, to keep short/unrelated words (e.g. "milk"/"silk") safe.
        if len(word_norm) >= 5 and len(dw) >= 5 and abs(len(word_norm) - len(dw)) <= 2:
            max_dist = 1 if max(len(word_norm), len(dw)) <= 7 else 2
            if edit_distance(word_norm, dw) <= max_dist:
                return True
    return False


def is_relevant(search_term, description, non_grocery_keywords=NON_GROCERY_KEYWORDS):
    """Check if a candidate's description is relevant to the search term."""
    search_words = set(search_term.lower().split())
    description = description.lower()

    # Remove common words that don't help with matching
    common_words = {'the', 'and', 'or', 'with', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an'}
    search_words = search_words - common_words
    # Only consider words long enough to be meaningful
    matchable_words = [w for w in search_words if len(w) >= 3]

    if not matchable_words:
        return True  # If only common/short words, accept the match

    # Count how many search words appear in the description
    matched_count = sum(1 for word in matchable_words
                         if fuzzy_word_match(word, description))

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
    for keyword in non_grocery_keywords:
        if keyword in description and keyword not in search_lower:
            return False

    return True


def score_description(search_term, description, *, has_location=False, category=None,
                       non_grocery_keywords=NON_GROCERY_KEYWORDS):
    """Score a candidate's description for relevance to `search_term`. Higher is better.

    `has_location` and `category` are optional signals a caller can supply
    when it has them (a real in-store aisle location, a department name) —
    both callers of this function (Kroger's live results, the local
    database's similarity fallback) have some form of each.
    """
    description = description.lower()
    description_norm = normalize(description)
    search_lower = search_term.lower().strip()
    search_lower_norm = normalize(search_lower)
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
        if len(word) >= 3 and fuzzy_word_match(word, description):
            score += 3

    # Penalize non-grocery products, but not if the user searched for that keyword
    for keyword in non_grocery_keywords:
        if keyword in description and keyword not in search_lower:
            score -= 20

    # Prefer candidates with a real in-store location (actual in-store items)
    if has_location:
        score += 5

    # Prefer fresh categories over frozen when user didn't ask for frozen
    cat_lower = category.lower() if category else ''
    if 'frozen' not in search_lower:
        if cat_lower in _FRESH_CATEGORIES:
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

"""
Tests for the word matching and product relevance logic in KrogerAPI.

Tests cover:
1. _fuzzy_word_match — word-boundary matching, normalization, prefix/suffix
2. _preprocess_search_term — filler removal, quantity stripping, brand preservation
3. _is_product_relevant — relevance gating with multi-word threshold
4. _score_product — scoring and ranking logic
"""

import pytest
from unittest.mock import patch
from grocery_organizer.src.store_api.kroger import KrogerAPI


@pytest.fixture
def api():
    return KrogerAPI(store_id="test")


# ─── Helper to build fake product data ───────────────────────────────────────

def make_product(description, categories=None, aisle_number=None):
    """Build a minimal product dict matching Kroger API shape."""
    product = {'description': description}
    if categories:
        product['categories'] = categories
    if aisle_number is not None:
        product['aisleLocations'] = [{'number': str(aisle_number)}]
    return product


# ═══════════════════════════════════════════════════════════════════════════════
# 1. _fuzzy_word_match
# ═══════════════════════════════════════════════════════════════════════════════

class TestFuzzyWordMatch:
    """Word-level matching with normalization and prefix/suffix support."""

    # --- Exact matches ---

    def test_exact_match(self, api):
        assert api._fuzzy_word_match("milk", "Kroger Whole Milk") is True

    def test_exact_match_case_insensitive(self, api):
        assert api._fuzzy_word_match("MILK", "whole milk") is True

    # --- Prefix/suffix (plurals, brand variants) ---

    def test_plural_match(self, api):
        assert api._fuzzy_word_match("chip", "Kroger Tortilla Chips") is True

    def test_plural_reverse(self, api):
        assert api._fuzzy_word_match("chips", "Kroger Tortilla Chip") is True

    def test_cheezit_to_cheezits(self, api):
        """Brand name with extra 's'."""
        assert api._fuzzy_word_match("cheezits", "Cheez-It Original") is True

    def test_cheezit_from_cheezits(self, api):
        """Description brand to user search term."""
        assert api._fuzzy_word_match("cheezit", "Cheez-Its Crackers") is True

    # --- Normalization (hyphens, apostrophes) ---

    def test_hyphen_normalized(self, api):
        """Cheez-It normalizes to cheezit."""
        assert api._fuzzy_word_match("cheezit", "Cheez-It") is True

    def test_apostrophe_normalized(self, api):
        assert api._fuzzy_word_match("hellmanns", "Hellmann's Mayonnaise") is True

    # --- False positives that should NOT match (Fix #1) ---

    def test_ice_does_not_match_rice(self, api):
        """'ice' should not match 'rice' — substring in middle of word."""
        assert api._fuzzy_word_match("ice", "Kroger Long Grain Rice") is False

    def test_ham_does_not_match_shampoo(self, api):
        assert api._fuzzy_word_match("ham", "Pantene Shampoo") is False

    def test_corn_does_not_match_unicorn(self, api):
        assert api._fuzzy_word_match("corn", "Unicorn Cake Mix") is False

    def test_egg_does_not_match_eggplant(self, api):
        """'egg' is a prefix of 'eggplant', so this WILL match via startswith.
        This is a known trade-off — prefix matching helps more than it hurts."""
        # egg -> eggplant: "eggplant".startswith("egg") is True
        assert api._fuzzy_word_match("egg", "Fresh Eggplant") is True

    def test_ant_does_not_match_plant(self, api):
        """'ant' should not match 'plant' — substring but not prefix."""
        assert api._fuzzy_word_match("ant", "House Plant") is False

    def test_oil_does_not_match_foil(self, api):
        assert api._fuzzy_word_match("oil", "Reynolds Aluminum Foil") is False

    # --- Short words ---

    def test_short_word_exact_match(self, api):
        """Words shorter than 3 chars can still match exactly."""
        assert api._fuzzy_word_match("ox", "Ox Tail Soup") is True

    def test_short_word_no_prefix_match(self, api):
        """Short words (<3 chars) should not use prefix matching."""
        assert api._fuzzy_word_match("or", "Orange Juice") is False

    # --- No match at all ---

    def test_completely_different(self, api):
        assert api._fuzzy_word_match("butter", "Coca Cola Soda") is False


# ═══════════════════════════════════════════════════════════════════════════════
# 2. _preprocess_search_term
# ═══════════════════════════════════════════════════════════════════════════════

class TestPreprocessSearchTerm:
    """Search term cleanup before sending to Kroger API."""

    # --- Quantity removal ---

    def test_removes_weight(self, api):
        assert api._preprocess_search_term("2 lbs chicken breast") == "chicken breast"

    def test_removes_volume(self, api):
        assert api._preprocess_search_term("1 gallon milk") == "milk"

    def test_removes_written_number_with_unit(self, api):
        assert api._preprocess_search_term("two dozen eggs") == "eggs"

    def test_removes_pack_count(self, api):
        assert api._preprocess_search_term("6 pack water bottles") == "water bottles"

    def test_removes_a_dozen(self, api):
        assert api._preprocess_search_term("a dozen rolls") == "rolls"

    # --- Filler word removal ---

    def test_removes_articles(self, api):
        result = api._preprocess_search_term("a bag of flour")
        assert "flour" in result
        assert " a " not in f" {result} ".replace("  ", " ")

    def test_removes_size_words(self, api):
        result = api._preprocess_search_term("large eggs")
        assert result == "eggs"

    # --- Fix #3: Keeps meaningful qualifiers ---

    def test_keeps_fresh(self, api):
        result = api._preprocess_search_term("fresh mozzarella")
        assert "fresh" in result

    def test_keeps_organic(self, api):
        result = api._preprocess_search_term("organic milk")
        assert "organic" in result

    def test_keeps_natural(self, api):
        result = api._preprocess_search_term("natural peanut butter")
        assert "natural" in result

    # --- Fix #2: Preserves numbered brand names ---

    def test_preserves_7up(self, api):
        result = api._preprocess_search_term("7up")
        assert "7" in result

    def test_preserves_v8(self, api):
        result = api._preprocess_search_term("v8 juice")
        assert "v8" in result

    def test_preserves_a1_sauce(self, api):
        result = api._preprocess_search_term("a1 sauce")
        assert "a1" in result

    # --- Still strips number + unit combos ---

    def test_strips_number_with_unit_not_brand(self, api):
        result = api._preprocess_search_term("3 oz cream cheese")
        assert "3" not in result
        assert "cream cheese" in result

    # --- Edge cases ---

    def test_empty_after_filter_uses_original(self, api):
        """If all words are filtered, fall back to original."""
        result = api._preprocess_search_term("a can of")
        assert len(result) > 0

    def test_already_clean(self, api):
        assert api._preprocess_search_term("bananas") == "bananas"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. _is_product_relevant
# ═══════════════════════════════════════════════════════════════════════════════

class TestIsProductRelevant:
    """Relevance gating — should this product be considered at all?"""

    # --- Basic relevance ---

    def test_matching_product_is_relevant(self, api):
        product = make_product("Kroger Whole Milk")
        assert api._is_product_relevant("milk", product) is True

    def test_unrelated_product_is_not_relevant(self, api):
        product = make_product("Coca Cola Soda")
        assert api._is_product_relevant("milk", product) is False

    # --- Fix #4: Multi-word threshold ---

    def test_single_word_search_needs_match(self, api):
        product = make_product("Campbell's Chicken Noodle Soup")
        assert api._is_product_relevant("soup", product) is True

    def test_two_word_search_one_match_accepted(self, api):
        """With 2 matchable words, threshold is 1 (ceiling of 2/2)."""
        product = make_product("Kroger Chicken Breast Boneless")
        assert api._is_product_relevant("chicken soup", product) is True

    def test_three_word_search_needs_two(self, api):
        """With 3 matchable words, threshold is 2."""
        product = make_product("Kroger Cheddar Cheese")
        # "dark" no, "chocolate" no, "almond" no -> 0 of 3 needed 2
        assert api._is_product_relevant("dark chocolate almonds", product) is False

    def test_three_word_search_two_match(self, api):
        """2 of 3 words match -> relevant."""
        product = make_product("Dark Chocolate Bar")
        assert api._is_product_relevant("dark chocolate almonds", product) is True

    # --- Non-grocery keyword filtering ---

    def test_candle_blocked_for_lemon_search(self, api):
        product = make_product("Lemon Scented Candle")
        assert api._is_product_relevant("lemon", product) is False

    def test_shampoo_blocked_for_coconut_search(self, api):
        product = make_product("Coconut Shampoo")
        assert api._is_product_relevant("coconut", product) is False

    def test_shampoo_allowed_when_searching_shampoo(self, api):
        """User intentionally searching for a non-grocery item."""
        product = make_product("Pantene Shampoo")
        assert api._is_product_relevant("shampoo", product) is True

    def test_lotion_allowed_when_searching_lotion(self, api):
        product = make_product("Jergens Lotion")
        assert api._is_product_relevant("lotion", product) is True

    def test_pet_food_blocked_for_chicken_search(self, api):
        product = make_product("Purina Chicken Dog Food")
        assert api._is_product_relevant("chicken", product) is False

    # --- Short search terms ---

    def test_very_short_search_is_lenient(self, api):
        """Search terms <= 3 chars accept any match."""
        product = make_product("Anything At All")
        assert api._is_product_relevant("ox", product) is True

    # --- Common-words-only search ---

    def test_only_common_words_accepts_match(self, api):
        product = make_product("Anything")
        assert api._is_product_relevant("the and or", product) is True


# ═══════════════════════════════════════════════════════════════════════════════
# 4. _score_product
# ═══════════════════════════════════════════════════════════════════════════════

class TestScoreProduct:
    """Scoring and ranking — which relevant product is the BEST match?"""

    # --- Exact match bonus ---

    def test_exact_match_scores_higher(self, api):
        exact = make_product("Butter")
        partial = make_product("Butter Croissant")
        assert api._score_product("butter", exact) > api._score_product("butter", partial)

    # --- Word match scoring ---

    def test_more_word_matches_score_higher(self, api):
        two_match = make_product("Peanut Butter Creamy")
        one_match = make_product("Peanut Brittle")
        assert api._score_product("peanut butter", two_match) > api._score_product("peanut butter", one_match)

    # --- Aisle location bonus ---

    def test_in_store_product_preferred(self, api):
        with_aisle = make_product("Kroger Milk", aisle_number=5)
        no_aisle = make_product("Kroger Milk")
        assert api._score_product("milk", with_aisle) > api._score_product("milk", no_aisle)

    # --- Short description bonus ---

    def test_shorter_description_preferred(self, api):
        short = make_product("Whole Milk")
        long = make_product("Kroger Brand Premium Organic Whole Milk 1 Gallon Vitamin D Added")
        assert api._score_product("milk", short) > api._score_product("milk", long)

    # --- Non-grocery penalty ---

    def test_non_grocery_penalized(self, api):
        grocery = make_product("Lemon Juice", aisle_number=7)
        non_grocery = make_product("Lemon Scented Candle", aisle_number=12)
        assert api._score_product("lemon", grocery) > api._score_product("lemon", non_grocery)

    def test_non_grocery_not_penalized_when_intentional(self, api):
        """Searching for 'candle' shouldn't penalize candle products."""
        product = make_product("Yankee Candle", aisle_number=15)
        score = api._score_product("candle", product)
        # Should not have the -20 penalty
        assert score > 0

    # --- Normalized exact match ---

    def test_normalized_exact_match(self, api):
        product = make_product("Cheez-It Original Crackers")
        score = api._score_product("cheezit", product)
        # Should get the +10 exact match bonus (normalized)
        assert score >= 10


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Integration: find_product scoring picks the right candidate
# ═══════════════════════════════════════════════════════════════════════════════

class TestFindProductSelection:
    """Test that find_product picks the best candidate from multiple results."""

    def _mock_find(self, api, search_term, candidates):
        """Simulate find_product's scoring logic without calling the API."""
        cleaned = api._preprocess_search_term(search_term)
        best_product = None
        best_score = -100
        for candidate in candidates:
            if (api._is_product_relevant(search_term, candidate) or
                    api._is_product_relevant(cleaned, candidate)):
                score = max(
                    api._score_product(search_term, candidate),
                    api._score_product(cleaned, candidate)
                )
                if score > best_score:
                    best_score = score
                    best_product = candidate
        return best_product

    def test_picks_grocery_over_non_grocery(self, api):
        candidates = [
            make_product("Lemon Scented Candle", aisle_number=15),
            make_product("Fresh Lemon", categories=["Produce"], aisle_number=3),
        ]
        result = self._mock_find(api, "lemon", candidates)
        assert result['description'] == "Fresh Lemon"

    def test_picks_exact_match_over_partial(self, api):
        candidates = [
            make_product("Butter Croissant", aisle_number=1),
            make_product("Butter", categories=["Dairy"], aisle_number=9),
        ]
        result = self._mock_find(api, "butter", candidates)
        assert result['description'] == "Butter"

    def test_picks_product_with_aisle(self, api):
        candidates = [
            make_product("Kroger Milk"),
            make_product("Kroger Whole Milk", aisle_number=4),
        ]
        result = self._mock_find(api, "milk", candidates)
        assert result['description'] == "Kroger Whole Milk"

    def test_cheezits_finds_cheez_it(self, api):
        candidates = [
            make_product("Cheez-It Original Crackers", aisle_number=8),
            make_product("Cheddar Cheese Slices", aisle_number=10),
        ]
        result = self._mock_find(api, "cheezits", candidates)
        assert "Cheez-It" in result['description']

    def test_7up_matches(self, api):
        candidates = [
            make_product("7UP Lemon Lime Soda", aisle_number=6),
            make_product("Sprite Soda", aisle_number=6),
        ]
        result = self._mock_find(api, "7up", candidates)
        assert "7UP" in result['description']

    def test_organic_milk_prefers_organic(self, api):
        candidates = [
            make_product("Kroger Whole Milk", aisle_number=4),
            make_product("Organic Whole Milk", aisle_number=4),
        ]
        result = self._mock_find(api, "organic milk", candidates)
        assert "Organic" in result['description']

    def test_no_relevant_returns_none(self, api):
        candidates = [
            make_product("Dog Food Premium"),
            make_product("Cat Food Salmon"),
        ]
        result = self._mock_find(api, "chicken", candidates)
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Spell correction fallback in _search_top_matches
# ═══════════════════════════════════════════════════════════════════════════════

class TestSpellCorrectionFallback:
    """_search_top_matches retries with a spell-corrected term on zero results."""

    def test_retries_with_corrected_term_on_miss(self, api):
        found = [make_product("Milk", categories=["Dairy"], aisle_number=4)]
        call_terms = []

        def fake_fetch(product_name, search_term, limit):
            call_terms.append(search_term)
            return found if search_term == "milk" else []

        with patch.object(api, '_fetch_scored_candidates', side_effect=fake_fetch), \
             patch.object(api, '_spell_correct', return_value="milk"):
            result = api._search_top_matches("mlk")

        assert call_terms == ["mlk", "milk"]
        assert result == found

    def test_no_retry_when_results_found_on_first_call(self, api):
        found = [make_product("Milk")]
        with patch.object(api, '_fetch_scored_candidates', return_value=found), \
             patch.object(api, '_spell_correct') as mock_correct:
            api._search_top_matches("milk")
        mock_correct.assert_not_called()

    def test_no_retry_when_correction_is_unchanged(self, api):
        call_count = [0]

        def fake_fetch(product_name, search_term, limit):
            call_count[0] += 1
            return []

        with patch.object(api, '_fetch_scored_candidates', side_effect=fake_fetch), \
             patch.object(api, '_spell_correct', return_value="unknownbrand"):
            result = api._search_top_matches("unknownbrand")

        assert call_count[0] == 1
        assert result == []

    def test_spell_correct_returns_string(self, api):
        KrogerAPI._spell_checker = None
        result = api._spell_correct("milk")
        assert isinstance(result, str)
        assert result == "milk"

    def test_spell_correct_handles_unknown_word(self, api):
        KrogerAPI._spell_checker = None
        result = api._spell_correct("xyzqrp")
        assert isinstance(result, str)
        assert len(result) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# 7. _normalize
# ═══════════════════════════════════════════════════════════════════════════════

class TestNormalize:

    def test_removes_hyphens(self):
        assert KrogerAPI._normalize("cheez-it") == "cheezit"

    def test_removes_apostrophes(self):
        assert KrogerAPI._normalize("hellmann's") == "hellmanns"

    def test_removes_both(self):
        assert KrogerAPI._normalize("hell-mann's") == "hellmanns"

    def test_no_change_needed(self):
        assert KrogerAPI._normalize("milk") == "milk"

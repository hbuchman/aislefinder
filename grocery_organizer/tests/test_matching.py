"""Tests for the standalone matching.py module.

kroger.py's word-matching/scoring behavior is exhaustively covered via
KrogerAPI in test_word_matching.py (which now just delegates to these same
functions) — this file checks the module works standalone, since
store_database.py's similarity fallback calls it directly without a
KrogerAPI instance.
"""

from grocery_organizer.src.store_api import matching


def test_normalize_strips_punctuation():
    assert matching.normalize("banana, each") == "banana each"


def test_edit_distance_one_substitution():
    assert matching.edit_distance("banana", "bananb") == 1


def test_fuzzy_word_match_exact():
    assert matching.fuzzy_word_match("milk", "Prairie Farms 2% Milk") is True


def test_fuzzy_word_match_typo_tolerance():
    assert matching.fuzzy_word_match("bananna", "Banana, Each") is True


def test_fuzzy_word_match_rejects_unrelated_short_words():
    assert matching.fuzzy_word_match("ice", "Kroger Long Grain Rice") is False


def test_is_relevant_true_for_matching_description():
    assert matching.is_relevant("milk", "prairie farms 2% milk") is True


def test_is_relevant_false_for_unrelated_description():
    assert matching.is_relevant("milk", "pantene silk conditioner") is False


def test_is_relevant_blocks_non_grocery_keyword():
    assert matching.is_relevant("candle", "vanilla scented candle") is False


def test_score_description_prefers_exact_phrase_match():
    exact = matching.score_description("milk", "milk")
    partial = matching.score_description("milk", "chocolate milk drink mix")
    assert exact > partial


def test_score_description_rewards_location_presence():
    with_location = matching.score_description("milk", "whole milk", has_location=True)
    without_location = matching.score_description("milk", "whole milk", has_location=False)
    assert with_location > without_location


def test_score_description_prefers_fresh_category_when_not_searching_frozen():
    fresh = matching.score_description("berries", "mixed berries", category="Produce")
    frozen = matching.score_description("berries", "mixed berries", category="Frozen Fruit")
    assert fresh > frozen

"""Tests for the shared search-term preprocessing."""

import pytest

from grocery_organizer.src.store_api.search_terms import preprocess_search_term


@pytest.mark.parametrize("raw,expected", [
    ("2 lbs chicken", "chicken"),
    ("3 gallons of milk", "milk"),
    ("a dozen eggs", "eggs"),
    ("two loaves of bread", "bread"),
    ("1 bag of rice", "rice"),
    ("large eggs", "eggs"),
    ("peanut butter", "peanut butter"),
    ("Cheez-Its", "cheez-its"),
])
def test_quantities_and_fillers_removed(raw, expected):
    assert preprocess_search_term(raw) == expected


def test_falls_back_to_original_when_everything_filtered():
    # "a bag" is all filler; better to search the raw term than nothing
    assert preprocess_search_term("a bag") == "a bag"


def test_result_is_lowercased_and_trimmed():
    assert preprocess_search_term("  MILK  ") == "milk"

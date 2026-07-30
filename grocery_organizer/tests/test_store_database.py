"""Tests for StoreDatabaseAPI. _rows_for is patched so no real CSV files are
touched — this exercises the exact-match / similarity-fallback / miss logic
in isolation.
"""

import pytest
from unittest.mock import patch

from grocery_organizer.src.store_api import store_database
from grocery_organizer.src.store_api.store_database import StoreDatabaseAPI

ROWS = [
    {'item': 'milk', 'found_product': 'Prairie Farms 2% Milk', 'category': 'Dairy',
     'aisle_number': -1, 'raw_location': 'Dairy'},
    {'item': 'bananas', 'found_product': 'Banana Bag', 'category': 'Produce',
     'aisle_number': -1, 'raw_location': 'Produce'},
    {'item': 'bread', 'found_product': 'White Bread Loaf', 'category': 'Bakery',
     'aisle_number': 3, 'raw_location': 'Aisle 3'},
]


@pytest.fixture(autouse=True)
def clear_cache():
    store_database._cache.clear()
    yield
    store_database._cache.clear()


@pytest.fixture
def api():
    return StoreDatabaseAPI('woodmans', '407077')


def test_exact_match(api):
    with patch.object(store_database, '_rows_for', return_value=ROWS):
        result = api.find_product('milk')
    assert result.found_product == 'Prairie Farms 2% Milk'
    assert result.category == 'Dairy'
    assert result.aisle_number == -1


def test_exact_match_preserves_input_name(api):
    with patch.object(store_database, '_rows_for', return_value=ROWS):
        result = api.find_product('milk')
    assert result.input_name == 'milk'


def test_similarity_fallback_for_close_variant(api):
    with patch.object(store_database, '_rows_for', return_value=ROWS):
        result = api.find_product('2% milk')
    assert result.found_product == 'Prairie Farms 2% Milk'
    assert result.category == 'Dairy'


def test_unrelated_item_is_not_found(api):
    with patch.object(store_database, '_rows_for', return_value=ROWS):
        result = api.find_product('shampoo')
    assert result.category == 'Not Found'
    assert result.aisle_number == -1


def test_empty_store_is_always_not_found(api):
    with patch.object(store_database, '_rows_for', return_value=[]):
        result = api.find_product('milk')
    assert result.category == 'Not Found'


def test_find_item_details_ranks_best_match_first(api):
    with patch.object(store_database, '_rows_for', return_value=ROWS):
        results = api.find_item_details('bread', limit=5)
    assert results
    assert results[0]['name'] == 'White Bread Loaf'
    assert results[0]['location']['aisle'] == 3


def test_find_item_details_empty_for_no_match(api):
    with patch.object(store_database, '_rows_for', return_value=ROWS):
        results = api.find_item_details('shampoo')
    assert results == []


REGISTRY = [
    {'chain': 'woodmans', 'store_id': '407077', 'name': "Woodman's Markets",
     'address': 'Waukesha, WI 53186', 'zip': '53186'},
]


def test_find_stores_by_zip_matches_registry(api):
    with patch.object(store_database, '_registry_rows', return_value=REGISTRY):
        stores = api.find_stores_by_zip('53186')
    assert stores == [{'id': '407077', 'name': "Woodman's Markets",
                        'address': 'Waukesha, WI 53186', 'distance': None}]


def test_find_stores_by_zip_no_match_is_empty(api):
    with patch.object(store_database, '_registry_rows', return_value=REGISTRY):
        assert api.find_stores_by_zip('99999') == []


def test_find_stores_by_zip_scoped_to_chain():
    other_chain_api = StoreDatabaseAPI('some-other-chain', 'x')
    with patch.object(store_database, '_registry_rows', return_value=REGISTRY):
        assert other_chain_api.find_stores_by_zip('53186') == []


def test_get_auth_token_is_a_noop(api):
    assert api.get_auth_token() is None

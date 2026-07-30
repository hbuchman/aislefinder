"""Tests for GroceryListProcessor's store-chain dispatch.

Both KrogerAPI and StoreDatabaseAPI are stubbed so no network/disk lookups
happen.
"""

from unittest.mock import patch

from grocery_organizer.src.core import processor
from grocery_organizer.src.core.models import FullProduct
from grocery_organizer.src.core.processor import GroceryListProcessor


class StubClient:
    """Deterministic stand-in for either store client; records how it was constructed."""

    last_args = None

    def __init__(self, *args):
        StubClient.last_args = args

    def get_auth_token(self):
        pass

    def find_product(self, product_name):
        return FullProduct(product_name, product_name, "Grocery", 3)


def test_unknown_store_chain_raises():
    try:
        GroceryListProcessor(text="milk", store_chain="costco")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "costco" in str(e)


def test_default_store_chain_is_kroger():
    processor_instance = GroceryListProcessor(text="milk")
    assert processor_instance.store_chain == "kroger"


def test_kroger_chain_uses_kroger_client():
    with patch.object(processor, "KrogerAPI", StubClient):
        result = GroceryListProcessor(text="milk", store_chain="kroger").process_list()
    assert result == "## Aisle 3\n- milk"


def test_woodmans_chain_uses_store_database_client():
    with patch.object(processor, "StoreDatabaseAPI", StubClient):
        result = GroceryListProcessor(text="milk", store_chain="woodmans").process_list()
    assert result == "## Aisle 3\n- milk"


def test_store_id_passed_through_to_client():
    with patch.object(processor, "StoreDatabaseAPI", StubClient):
        GroceryListProcessor(text="milk", store_chain="woodmans", store_id="407077").process_list()
    assert StubClient.last_args == ("woodmans", "407077")


def test_missing_store_id_uses_client_default():
    with patch.object(processor, "KrogerAPI", StubClient):
        GroceryListProcessor(text="milk", store_chain="kroger").process_list()
    assert StubClient.last_args == ()

"""Tests for the shared grocery_routes blueprint (registered by both servers).

The Kroger client is stubbed so no network calls happen.
"""

import io
from unittest.mock import patch

import pytest
from flask import Flask

import grocery_routes
from grocery_organizer.src.core import processor
from grocery_organizer.src.core.models import FullProduct
from grocery_routes import grocery_bp


class StubKrogerAPI:
    """Deterministic stand-in for KrogerAPI."""

    def __init__(self, store_id=''):
        self.store_id = store_id

    def get_auth_token(self):
        return 'stub-token'

    def find_product(self, product_name):
        aisles = {'milk': -1, 'rice': 5}
        if product_name == 'milk':
            return FullProduct('milk', 'Whole Milk', 'Dairy', -1)
        if product_name in aisles:
            return FullProduct(product_name, product_name, 'Grocery', aisles[product_name])
        return FullProduct(product_name, f'{product_name} (not found in store)', 'Not Found', -1)

    def find_stores_by_zip(self, zip_code):
        return [{'id': '1', 'name': 'Stub Store', 'address': '1 Main St', 'distance': 2.5}]

    def find_item_details(self, product_name):
        if product_name == 'rice':
            return [
                {
                    'name': 'Long Grain Rice',
                    'brand': 'Kroger',
                    'size': '2 lb',
                    'category': 'Grocery',
                    'image': 'https://example.com/rice.jpg',
                    'location': {'aisle': '5', 'side': 'L', 'shelf': 3, 'bay': 12, 'description': 'Aisle 5'},
                },
            ]
        return []


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(grocery_bp)
    # Both the routes and the processor import KrogerAPI by name
    with patch.object(grocery_routes, 'KrogerAPI', StubKrogerAPI), \
         patch.object(processor, 'KrogerAPI', StubKrogerAPI):
        with app.test_client() as test_client:
            yield test_client


class TestProcessGroceryList:
    def test_returns_organized_markdown(self, client):
        response = client.post('/api/process-grocery-list', data={
            'file': (io.BytesIO(b'milk\nrice'), 'list.txt'),
            'output_format': 'aisle',
        })
        assert response.status_code == 200
        body = response.get_data(as_text=True)
        assert '## Dairy\n- milk' in body
        assert '## Aisle 5\n- rice' in body

    def test_missing_file_is_400(self, client):
        response = client.post('/api/process-grocery-list', data={})
        assert response.status_code == 400
        assert 'error' in response.get_json()


class TestFindStores:
    def test_returns_stores_for_zip(self, client):
        response = client.post('/api/find-stores', json={'zipCode': '84102'})
        assert response.status_code == 200
        stores = response.get_json()['stores']
        assert len(stores) == 1
        assert stores[0]['name'] == 'Stub Store'

    def test_missing_zip_is_400(self, client):
        response = client.post('/api/find-stores', json={})
        assert response.status_code == 400


class TestFindItemAisle:
    def test_aisle_number_formatted(self, client):
        response = client.post('/api/find-item-aisle', json={'item': 'rice'})
        assert response.status_code == 200
        assert response.get_json()['aisle'] == 'Aisle 5'

    def test_category_fallback(self, client):
        response = client.post('/api/find-item-aisle', json={'item': 'milk'})
        assert response.get_json()['aisle'] == 'Dairy'

    def test_not_found_message(self, client):
        response = client.post('/api/find-item-aisle', json={'item': 'unobtainium'})
        assert response.get_json()['aisle'] == 'Not found in store'

    def test_blank_item_is_400(self, client):
        response = client.post('/api/find-item-aisle', json={'item': '   '})
        assert response.status_code == 400


class TestItemDetails:
    def test_returns_details(self, client):
        response = client.post('/api/item-details', json={'item': 'rice'})
        assert response.status_code == 200
        data = response.get_json()
        assert 'results' in data
        first = data['results'][0]
        assert first['name'] == 'Long Grain Rice'
        assert first['image'] == 'https://example.com/rice.jpg'
        assert first['location']['aisle'] == '5'

    def test_not_found_is_404(self, client):
        response = client.post('/api/item-details', json={'item': 'unobtainium'})
        assert response.status_code == 404

    def test_blank_item_is_400(self, client):
        response = client.post('/api/item-details', json={'item': '   '})
        assert response.status_code == 400


def test_health(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.get_json() == {'status': 'healthy'}

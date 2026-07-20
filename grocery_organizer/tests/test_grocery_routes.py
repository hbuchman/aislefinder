"""Tests for the shared grocery_routes blueprint (registered by both servers).

The Kroger client is stubbed so no network calls happen.
"""

import io
from unittest.mock import patch

import pytest
from flask import Flask

import grocery_routes
import rate_limit
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
    # Rate-limit state is module-global; isolate it per test
    rate_limit._rate_hits.clear()
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

    def test_too_many_items_is_400(self, client):
        items = '\n'.join(f'item {i}' for i in range(grocery_routes.MAX_ITEMS_PER_REQUEST + 1))
        response = client.post('/api/process-grocery-list', data={
            'file': (io.BytesIO(items.encode()), 'list.txt'),
        })
        assert response.status_code == 400
        assert 'limited' in response.get_json()['error']

    def test_oversized_file_is_413(self, client):
        blob = b'x' * (grocery_routes.MAX_UPLOAD_BYTES + 1)
        response = client.post('/api/process-grocery-list', data={
            'file': (io.BytesIO(blob), 'list.txt'),
        })
        assert response.status_code == 413

    def test_non_utf8_file_is_400(self, client):
        response = client.post('/api/process-grocery-list', data={
            'file': (io.BytesIO(b'\xff\xfe milk'), 'list.txt'),
        })
        assert response.status_code == 400
        assert 'UTF-8' in response.get_json()['error']


class TestRateLimit:
    def test_over_limit_is_429(self, client):
        with patch.object(rate_limit, 'RATE_LIMIT_MAX_REQUESTS', 3):
            for _ in range(3):
                assert client.post('/api/find-item-aisle', json={'item': 'rice'}).status_code == 200
            response = client.post('/api/find-item-aisle', json={'item': 'rice'})
        assert response.status_code == 429
        assert 'error' in response.get_json()

    def test_limit_spans_kroger_endpoints(self, client):
        # One shared per-IP window covers all Kroger-backed routes
        with patch.object(rate_limit, 'RATE_LIMIT_MAX_REQUESTS', 2):
            assert client.post('/api/find-item-aisle', json={'item': 'rice'}).status_code == 200
            assert client.post('/api/find-stores', json={'zipCode': '84102'}).status_code == 200
            response = client.post('/api/item-details', json={'item': 'rice'})
        assert response.status_code == 429

    def test_spoofed_forwarded_for_shares_bucket(self, client):
        # Only the proxy-appended (last) X-Forwarded-For entry counts, so
        # forging earlier entries can't rotate rate-limit buckets
        with patch.object(rate_limit, 'RATE_LIMIT_MAX_REQUESTS', 1):
            first = client.post('/api/find-item-aisle', json={'item': 'rice'},
                                headers={'X-Forwarded-For': '1.1.1.1, 9.9.9.9'})
            second = client.post('/api/find-item-aisle', json={'item': 'rice'},
                                 headers={'X-Forwarded-For': '2.2.2.2, 9.9.9.9'})
        assert first.status_code == 200
        assert second.status_code == 429

    def test_blank_forwarded_for_falls_back_to_remote_addr(self, client):
        # A header whose last entry is blank must not get its own bucket
        with patch.object(rate_limit, 'RATE_LIMIT_MAX_REQUESTS', 1):
            first = client.post('/api/find-item-aisle', json={'item': 'rice'},
                                headers={'X-Forwarded-For': ' , '})
            second = client.post('/api/find-item-aisle', json={'item': 'rice'})
        assert first.status_code == 200
        assert second.status_code == 429

    def test_idle_ip_buckets_are_swept(self, client):
        # Rotating client addresses must not grow the table without bound
        with patch.object(rate_limit, '_SWEEP_THRESHOLD', 5):
            for i in range(10):
                client.post('/api/find-item-aisle', json={'item': 'rice'},
                            headers={'X-Forwarded-For': f'10.0.0.{i}'})
            with patch.object(rate_limit, 'RATE_LIMIT_WINDOW_SECONDS', -1):
                client.post('/api/find-item-aisle', json={'item': 'rice'})
        assert len(rate_limit._rate_hits) <= 2


def test_server_error_hides_exception_details():
    app = Flask(__name__)
    with app.test_request_context():
        response, status = grocery_routes._server_error(
            'finding stores', ValueError('/internal/path leaked')
        )
    assert status == 500
    assert 'leaked' not in response.get_json()['error']


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

    def test_malformed_json_is_400(self, client):
        response = client.post('/api/find-stores', data='{not json',
                               content_type='application/json')
        assert response.status_code == 400

    def test_wrong_content_type_is_400(self, client):
        response = client.post('/api/find-stores', data='zipCode=84102',
                               content_type='text/plain')
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

    def test_non_string_item_is_400(self, client):
        response = client.post('/api/find-item-aisle', json={'item': 123})
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

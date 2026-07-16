"""Grocery lookup endpoints shared by both server entry points.

Registered by api_server.py (local Flask) and api/index.py (Vercel), like
lists_backend.py — route logic lives here once so the two apps can't drift.
"""

import traceback

from flask import Blueprint, jsonify, request

from grocery_organizer.src.core.processor import GroceryListProcessor
from grocery_organizer.src.store_api.kroger import KrogerAPI

grocery_bp = Blueprint('grocery', __name__)

DEFAULT_STORE_ID = '01400943'
DEFAULT_STORE_NAME = '4500S Smiths'


def _server_error(context, exc):
    print(f"Error {context}: {exc}")
    traceback.print_exc()
    return jsonify({'error': f'Server error: {exc}'}), 500


@grocery_bp.route('/api/process-grocery-list', methods=['POST'])
def process_grocery_list():
    """Organize an uploaded grocery list file by aisle or category."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        output_format = request.form.get('output_format', 'aisle')
        store_id = request.form.get('store_id', DEFAULT_STORE_ID)
        store = request.form.get('store', DEFAULT_STORE_NAME)
        print(f"Processing {file.filename}: format={output_format}, store={store} ({store_id})")

        processor = GroceryListProcessor(
            text=file.read().decode('utf-8'),
            store=store,
            output_format=output_format,
            store_id=store_id,
        )
        result = processor.process_list()
        return result, 200, {'Content-Type': 'text/plain'}

    except Exception as e:
        return _server_error('processing grocery list', e)


@grocery_bp.route('/api/find-stores', methods=['POST'])
def find_stores():
    """Search for Kroger-family stores near a zip code."""
    try:
        data = request.get_json()
        if not data or 'zipCode' not in data:
            return jsonify({'error': 'Zip code is required'}), 400

        zip_code = data['zipCode']
        print(f"Searching for stores near zip code: {zip_code}")

        stores = KrogerAPI().find_stores_by_zip(zip_code)
        stores.sort(key=lambda s: s.get('distance') or 999)
        return jsonify({'stores': stores}), 200

    except Exception as e:
        return _server_error('finding stores', e)


@grocery_bp.route('/api/find-item-aisle', methods=['POST'])
def find_item_aisle():
    """Look up a single item's aisle (used by shop mode's quick lookup)."""
    try:
        data = request.get_json()
        if not data or 'item' not in data:
            return jsonify({'error': 'Item name is required'}), 400

        item = data['item'].strip()
        if not item:
            return jsonify({'error': 'Item name cannot be empty'}), 400

        store_id = data.get('store_id', DEFAULT_STORE_ID)
        product = KrogerAPI(store_id).find_product(item)

        result = {
            'item': item,
            'found_product': product.found_product,
            'category': product.category,
            'aisle_number': product.aisle_number,
        }
        if product.aisle_number > 0:
            result['aisle'] = f'Aisle {product.aisle_number}'
        elif product.category != 'Not Found':
            result['aisle'] = product.category
        else:
            result['aisle'] = 'Not found in store'

        return jsonify(result), 200

    except Exception as e:
        return _server_error('finding item aisle', e)


@grocery_bp.route('/api/item-details', methods=['POST'])
def item_details():
    """Full product details (image, description, in-aisle location) for one item."""
    try:
        data = request.get_json()
        if not data or 'item' not in data:
            return jsonify({'error': 'Item name is required'}), 400

        item = data['item'].strip()
        if not item:
            return jsonify({'error': 'Item name cannot be empty'}), 400

        store_id = data.get('store_id', DEFAULT_STORE_ID)
        details = KrogerAPI(store_id).find_item_details(item)
        if details is None:
            return jsonify({'error': 'Item not found in store'}), 404

        return jsonify(details), 200

    except Exception as e:
        return _server_error('fetching item details', e)


@grocery_bp.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200

from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import os
import sys
from pathlib import Path

# Add the project root to Python path so grocery_organizer is importable
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from grocery_organizer.src.core.processor import GroceryListProcessor
from grocery_organizer.src.store_api.api import KrogerAPI

app = Flask(__name__)
CORS(app)

@app.route('/api/process-grocery-list', methods=['POST'])
def process_grocery_list():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        output_format = request.form.get('output_format', 'aisle')
        store_id = request.form.get('store_id', '01400943')
        store = request.form.get('store', '4500S Smiths')

        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as temp_file:
            content = file.read().decode('utf-8')
            temp_file.write(content)
            temp_file_path = temp_file.name

        try:
            processor = GroceryListProcessor(
                file=temp_file_path,
                store=store,
                output_format=output_format,
                store_id=store_id
            )
            result = processor.process_list()
            return result, 200, {'Content-Type': 'text/plain'}
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/find-stores', methods=['POST'])
def find_stores():
    try:
        data = request.get_json()
        if not data or 'zipCode' not in data:
            return jsonify({'error': 'Zip code is required'}), 400

        zip_code = data['zipCode']
        api_client = KrogerAPI()
        stores = api_client.find_stores_by_zip(zip_code)

        return jsonify({'stores': stores}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200

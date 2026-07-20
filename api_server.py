"""Local development Flask server (production runs api/index.py on Vercel).

Route logic lives in shared blueprints (grocery_routes.py, lists_backend.py)
so this file and the Vercel mirror (api/index.py) can't drift apart. Only
local-only debug tooling is defined here.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Load environment variables from .env file for local development
load_dotenv()

# Add the project to Python path
project_root = Path(__file__).parent
sys.path.append(str(project_root))

from cors_config import ALLOWED_ORIGINS
from grocery_routes import grocery_bp
from grocery_organizer.src.store_api.kroger import KrogerAPI
from lists_backend import lists_bp

app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGINS)
# Backstop for every route; per-route checks return friendlier errors first
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024
app.register_blueprint(grocery_bp)
app.register_blueprint(lists_bp)

# The debug routes are unauthenticated and drive real Kroger API calls, so
# they only exist when FLASK_ENV=development — insurance against this file
# ever being deployed somewhere public.
if os.environ.get('FLASK_ENV') == 'development':

    @app.route('/api/debug-kroger', methods=['POST'])
    def debug_kroger():
        """Local-only: dump raw Kroger search results for a term."""
        try:
            data = request.get_json(silent=True) or {}
            term = (data.get('term') or '').strip()
            store_id = data.get('store_id', '01400943')
            if not term:
                return jsonify({'error': 'term is required'}), 400

            token = KrogerAPI(store_id).get_auth_token()

            import requests as req
            headers = {'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache'}
            params = {'filter.term': term, 'filter.locationId': store_id, 'filter.limit': 5}
            resp = req.get('https://api.kroger.com/v1/products', headers=headers, params=params)
            resp.raise_for_status()
            raw = resp.json()

            # Trim aliasProductIds to just a count to keep payload small
            for product in raw.get('data', []):
                alias = product.get('aliasProductIds', [])
                product['aliasProductIds'] = len(alias)

            return jsonify({
                'total': raw.get('meta', {}).get('pagination', {}).get('total', 0),
                'store_id': store_id,
                'data': raw.get('data', []),
            }), 200

        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/debug')
    def debug_viewer():
        return send_from_directory(str(Path(__file__).parent), 'api-response-viewer.html')


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    debug_mode = os.environ.get('FLASK_ENV') == 'development'
    app.run(debug=debug_mode, host='0.0.0.0', port=port)

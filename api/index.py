"""Vercel serverless entry point.

All route logic lives in the shared blueprints (grocery_routes.py and
lists_backend.py at the repo root), so this file only wires up the app.
The local server (api_server.py) registers the same blueprints.
"""

import sys
from pathlib import Path

from flask import Flask
from flask_cors import CORS

# Add the project root to Python path so shared modules are importable
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from cors_config import ALLOWED_ORIGINS
from grocery_routes import grocery_bp
from lists_backend import lists_bp

app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGINS)
# Backstop for every route; per-route checks return friendlier errors first
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024
app.register_blueprint(grocery_bp)
app.register_blueprint(lists_bp)

"""Grocery lookup endpoints shared by both server entry points.

Registered by api_server.py (local Flask) and api/index.py (Vercel), like
lists_backend.py — route logic lives here once so the two apps can't drift.
"""

import base64
import json
import os
import traceback

from flask import Blueprint, jsonify, request

from grocery_organizer.src.core.processor import GroceryListProcessor
from grocery_organizer.src.input_parsing.input_parser import InputParser
from grocery_organizer.src.store_api.kroger import KrogerAPI
from rate_limit import rate_limited

grocery_bp = Blueprint('grocery', __name__)

DEFAULT_STORE_ID = '01400943'
DEFAULT_STORE_NAME = '4500S Smiths'

# Every list item costs 1-2 Kroger Products calls against a shared 10,000/day
# quota, so uploads are bounded before any lookups happen.
MAX_ITEMS_PER_REQUEST = 100
MAX_UPLOAD_BYTES = 64 * 1024

# Photo capture: the Claude API caps images at 5MB, and only these formats
# are accepted (the frontend re-encodes to JPEG before uploading anyway)
PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
PHOTO_MEDIA_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}

# Multipart framing (boundary markers, per-part headers) on top of the raw
# photo bytes. Both entry points set MAX_CONTENT_LENGTH to this same total so
# Werkzeug's app-wide cap lines up with the check below instead of rejecting
# in-budget photos first with an unhandled RequestEntityTooLarge.
PHOTO_UPLOAD_OVERHEAD_BYTES = 64 * 1024


def _server_error(context, exc):
    # Exception details stay in the server log; clients get a generic message
    print(f"Error {context}: {exc}")
    traceback.print_exc()
    return jsonify({'error': f'Server error while {context}'}), 500


def _json_body():
    """The request's JSON body as a dict; {} when missing, malformed, or not
    an object (get_json() would otherwise raise, turning bad input into 500s)."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _clean_item(data):
    """The 'item' field as a stripped string, or None if absent/not a string."""
    item = data.get('item')
    return item.strip() if isinstance(item, str) else None


@grocery_bp.route('/api/process-grocery-list', methods=['POST'])
@rate_limited
def process_grocery_list():
    """Organize an uploaded grocery list file by aisle or category."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        raw = file.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            return jsonify({'error': 'List file is too large'}), 413

        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            return jsonify({'error': 'List file must be plain UTF-8 text'}), 400
        item_count = len(InputParser.parse_text(text))
        if item_count > MAX_ITEMS_PER_REQUEST:
            return jsonify({'error': f'Lists are limited to {MAX_ITEMS_PER_REQUEST} items (got {item_count})'}), 400

        output_format = request.form.get('output_format', 'aisle')
        store_id = request.form.get('store_id', DEFAULT_STORE_ID)
        store = request.form.get('store', DEFAULT_STORE_NAME)
        print(f"Processing {file.filename}: format={output_format}, store={store} ({store_id})")

        processor = GroceryListProcessor(
            text=text,
            store=store,
            output_format=output_format,
            store_id=store_id,
        )
        result = processor.process_list()
        return result, 200, {'Content-Type': 'text/plain'}

    except Exception as e:
        return _server_error('processing grocery list', e)


# Store search burns Locations API quota (1,600/day — 16% of Products'), and
# picking a store is a once-per-trip action, so it gets a much smaller budget
@grocery_bp.route('/api/find-stores', methods=['POST'])
@rate_limited(max_requests=10, bucket='locations')
def find_stores():
    """Search for Kroger-family stores near a zip code."""
    try:
        data = _json_body()
        if 'zipCode' not in data:
            return jsonify({'error': 'Zip code is required'}), 400

        zip_code = data['zipCode']
        print(f"Searching for stores near zip code: {zip_code}")

        stores = KrogerAPI().find_stores_by_zip(zip_code)
        stores.sort(key=lambda s: s.get('distance') or 999)
        return jsonify({'stores': stores}), 200

    except Exception as e:
        return _server_error('finding stores', e)


@grocery_bp.route('/api/find-item-aisle', methods=['POST'])
@rate_limited
def find_item_aisle():
    """Look up a single item's aisle (used by shop mode's quick lookup)."""
    try:
        data = _json_body()
        item = _clean_item(data)
        if item is None:
            return jsonify({'error': 'Item name is required'}), 400
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
@rate_limited
def item_details():
    """Full product details (image, description, in-aisle location) for one item."""
    try:
        data = _json_body()
        item = _clean_item(data)
        if item is None:
            return jsonify({'error': 'Item name is required'}), 400
        if not item:
            return jsonify({'error': 'Item name cannot be empty'}), 400

        store_id = data.get('store_id', DEFAULT_STORE_ID)
        results = KrogerAPI(store_id).find_item_details(item)
        if not results:
            return jsonify({'error': 'Item not found in store'}), 404

        return jsonify({'results': results}), 200

    except Exception as e:
        return _server_error('fetching item details', e)


@grocery_bp.route('/api/categories', methods=['GET'])
def categories():
    """The sound category vocabulary for the aisle-correction picker.

    Every entry is a normalized, shopper-facing category name (so it matches
    the `## <category>` headers the organizer emits) with a food-safe `rank`
    the client uses to place a newly created category group. No network call —
    served from the seed catalog plus categories harvested from live lookups.
    """
    try:
        return jsonify({'categories': KrogerAPI.category_catalog()}), 200
    except Exception as e:
        return _server_error('loading categories', e)


class _PhotoCaptureUnavailable(Exception):
    """Raised when Claude can't be reached for a reason the caller can't fix
    (out of API credits, bad/revoked key) — a clean 503, not a 500."""


@grocery_bp.route('/api/photo-to-list', methods=['POST'])
@rate_limited
def photo_to_list():
    """Extract grocery items from a photo of a written list (Claude vision).

    Returns 503 when ANTHROPIC_API_KEY is unset so the frontend can hide the
    failure gracefully, mirroring lists_backend's unconfigured behavior.
    """
    try:
        if not os.environ.get('ANTHROPIC_API_KEY'):
            return jsonify({'error': 'Photo capture is not configured on the server'}), 503

        # Checked via the Content-Length header, before request.files touches
        # the body: reading an oversized multipart body raises Werkzeug's own
        # RequestEntityTooLarge, which the blanket except below would turn
        # into an opaque 500 instead of this friendly message.
        if request.content_length and request.content_length > PHOTO_MAX_UPLOAD_BYTES + PHOTO_UPLOAD_OVERHEAD_BYTES:
            return jsonify({'error': 'Photo is too large (5MB max)'}), 413

        if 'photo' not in request.files:
            return jsonify({'error': 'No photo provided'}), 400

        photo = request.files['photo']
        if photo.mimetype not in PHOTO_MEDIA_TYPES:
            return jsonify({'error': 'Photo must be a JPEG, PNG, WebP, or GIF image'}), 400

        raw = photo.read()
        if not raw:
            return jsonify({'error': 'Photo is empty'}), 400
        if len(raw) > PHOTO_MAX_UPLOAD_BYTES:
            return jsonify({'error': 'Photo is too large (5MB max)'}), 413

        items = _extract_items_from_photo(raw, photo.mimetype)
        return jsonify({'items': items[:MAX_ITEMS_PER_REQUEST]}), 200

    except _PhotoCaptureUnavailable:
        # Same message/status as the unset-key case above: the frontend
        # already treats 503 as "try again later" without inspecting the body.
        return jsonify({'error': 'Photo capture is not configured on the server'}), 503

    except Exception as e:
        return _server_error('reading grocery list photo', e)


def _extract_items_from_photo(image_bytes, media_type):
    """The grocery items Claude can read in the photo, in written order."""
    # Deferred import: servers that never set ANTHROPIC_API_KEY (and the test
    # suite) don't need the anthropic package installed
    import anthropic

    try:
        response = anthropic.Anthropic().messages.create(
            model='claude-opus-4-8',
            max_tokens=16000,
            # Reading a list is simple extraction — low effort keeps the round
            # trip fast and cheap without hurting accuracy
            output_config={
                'effort': 'low',
                'format': {
                    'type': 'json_schema',
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'items': {'type': 'array', 'items': {'type': 'string'}},
                        },
                        'required': ['items'],
                        'additionalProperties': False,
                    },
                },
            },
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': media_type,
                            'data': base64.standard_b64encode(image_bytes).decode('ascii'),
                        },
                    },
                    {
                        'type': 'text',
                        'text': (
                            'This photo shows a grocery/shopping list. Extract every item '
                            'on it, one entry per item, in the order written. Keep any '
                            'quantity the writer included ("2 lb chicken"), skip items '
                            'that are crossed out, and ignore headings or anything that '
                            'is not a list item. If the photo does not contain a list, '
                            'return an empty items array.'
                        ),
                    },
                ],
            }],
        )
    except anthropic.APIStatusError as e:
        # Credit exhaustion, a revoked/invalid key, etc: nothing the caller
        # can retry their way out of, so surface it as "unavailable" rather
        # than a generic 500.
        if e.type in ('billing_error', 'authentication_error', 'permission_error'):
            raise _PhotoCaptureUnavailable(str(e)) from e
        raise

    if response.stop_reason == 'refusal':
        return []
    text = next(block.text for block in response.content if block.type == 'text')
    parsed = json.loads(text)
    return [item.strip() for item in parsed['items'] if isinstance(item, str) and item.strip()]


CHAT_MAX_MESSAGE_CHARS = 2000
CHAT_MAX_CONTEXT_CHARS = 6000
CHAT_MAX_HISTORY_TURNS = 20
CHAT_MAX_TURN_CHARS = 2000


class _ChatUnavailable(Exception):
    """Raised when Claude can't be reached for a reason the caller can't fix
    (out of API credits, bad/revoked key) — a clean 503, not a 500."""


@grocery_bp.route('/api/chat', methods=['POST'])
@rate_limited(max_requests=20, bucket='chat')
def chat():
    """Answer a free-form shopping question.

    List and purchase-history data live on-device (see lists_backend.py's
    docstring — the backend only stores opaque list JSON, no per-item
    index), so the client builds a plain-text `context` summary and sends
    it along; this route never queries list data itself.
    """
    try:
        if not os.environ.get('ANTHROPIC_API_KEY'):
            return jsonify({'error': 'Chat is not configured on the server'}), 503

        data = _json_body()
        message = data.get('message')
        message = message.strip() if isinstance(message, str) else ''
        if not message:
            return jsonify({'error': 'Message is required'}), 400
        message = message[:CHAT_MAX_MESSAGE_CHARS]

        context = data.get('context')
        context = context.strip()[:CHAT_MAX_CONTEXT_CHARS] if isinstance(context, str) else ''

        history = data.get('history')
        turns = []
        if isinstance(history, list):
            for turn in history[-CHAT_MAX_HISTORY_TURNS:]:
                if not isinstance(turn, dict):
                    continue
                role = turn.get('role')
                content = turn.get('content')
                if role not in ('user', 'assistant') or not isinstance(content, str) or not content.strip():
                    continue
                turns.append({'role': role, 'content': content.strip()[:CHAT_MAX_TURN_CHARS]})

        reply = _ask_chat_assistant(message, turns, context)
        return jsonify({'reply': reply}), 200

    except _ChatUnavailable:
        return jsonify({'error': 'Chat is not configured on the server'}), 503

    except Exception as e:
        return _server_error('answering chat message', e)


def _ask_chat_assistant(message, history, context):
    """Claude's reply to one chat turn, grounded in an optional list/history summary."""
    # Deferred import: servers that never set ANTHROPIC_API_KEY (and the test
    # suite) don't need the anthropic package installed
    import anthropic
    from datetime import date

    system = (
        "You are the shopping assistant built into AisleFinder, a grocery list app. "
        "Answer directly and conversationally - your reply renders in a small chat "
        "bubble, so keep it to a few sentences unless the question genuinely needs "
        "more. You may be given the shopper's current list and recent purchase "
        "history below; use it when relevant (e.g. whether something is already on "
        "the list, or when it was last bought and at which store), but don't force "
        "it into answers about general shopping, cooking, or produce-picking advice. "
        "If the history doesn't mention something, say you don't have a record of it "
        "rather than guessing.\n\n"
        f"Today's date: {date.today().isoformat()}"
        + (f"\n\n{context}" if context else "")
    )

    try:
        response = anthropic.Anthropic().messages.create(
            model='claude-opus-4-8',
            max_tokens=1024,
            output_config={'effort': 'medium'},
            system=system,
            messages=history + [{'role': 'user', 'content': message}],
        )
    except anthropic.APIStatusError as e:
        # Credit exhaustion, a revoked/invalid key, etc: nothing the caller
        # can retry their way out of, so surface it as "unavailable" rather
        # than a generic 500.
        if e.type in ('billing_error', 'authentication_error', 'permission_error'):
            raise _ChatUnavailable(str(e)) from e
        raise

    if response.stop_reason == 'refusal':
        return "I can't help with that one — try asking something else about your list or shopping."
    return ''.join(block.text for block in response.content if block.type == 'text').strip()


@grocery_bp.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200

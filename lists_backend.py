"""List sync and sharing endpoints, backed by DynamoDB with Cognito auth.

Registered by both api_server.py (local Flask) and api/index.py (Vercel).
When AISLEFINDER_TABLE is not configured, every endpoint returns 503 and the
frontend silently stays in local-only mode, so this is safe to ship before
running infra/setup-aws.sh.

Storage layout (single DynamoDB table, on-demand billing):
  - List record:  pk=LIST#<id>, sk=META
      data (S, full list JSON), owner_sub, members (M: sub -> display name),
      share_code (S, optional), updated_at
  - Membership:   pk=USER#<sub>, sk=LIST#<id>
  - GSI byShareCode on share_code for join-by-code lookups.

Vercel note: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are reserved env names
on Vercel, so credentials may also be provided as AF_AWS_ACCESS_KEY_ID /
AF_AWS_SECRET_ACCESS_KEY.
"""

import json
import os
import random
import string
import time
from functools import wraps

from flask import Blueprint, request, jsonify

from rate_limit import rate_limited

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:  # boto3 not installed — sync stays disabled
    boto3 = None
    ClientError = Exception

lists_bp = Blueprint('lists', __name__)

TABLE_NAME = os.environ.get('AISLEFINDER_TABLE')
REGION = os.environ.get('COGNITO_REGION') or os.environ.get('AF_AWS_REGION') or os.environ.get('AWS_REGION', 'us-east-1')

_dynamodb = None
_cognito = None
# access-token -> (sub, email, expiry); avoids a Cognito round-trip per request
_token_cache = {}
_TOKEN_CACHE_TTL = 300

# Share codes avoid ambiguous characters (0/O, 1/I/L)
_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

# DynamoDB items cap at 400 KB; leave headroom for the server-owned fields
MAX_LIST_BYTES = 256 * 1024


def sync_enabled():
    return boto3 is not None and TABLE_NAME


def _aws_kwargs():
    kwargs = {'region_name': REGION}
    access_key = os.environ.get('AF_AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AF_AWS_SECRET_ACCESS_KEY')
    if access_key and secret_key:
        kwargs['aws_access_key_id'] = access_key
        kwargs['aws_secret_access_key'] = secret_key
    return kwargs


def _table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource('dynamodb', **_aws_kwargs())
    return _dynamodb.Table(TABLE_NAME)


def _cognito_client():
    global _cognito
    if _cognito is None:
        _cognito = boto3.client('cognito-idp', **_aws_kwargs())
    return _cognito


def _user_from_token(token):
    cached = _token_cache.get(token)
    if cached and cached[2] > time.time():
        return cached[0], cached[1]
    response = _cognito_client().get_user(AccessToken=token)
    attrs = {a['Name']: a['Value'] for a in response.get('UserAttributes', [])}
    sub = attrs.get('sub')
    email = attrs.get('email', '')
    # Drop expired entries so the cache can't grow without bound
    now = time.time()
    for key in [k for k, v in _token_cache.items() if v[2] <= now]:
        del _token_cache[key]
    _token_cache[token] = (sub, email, now + _TOKEN_CACHE_TTL)
    return sub, email


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not sync_enabled():
            return jsonify({'error': 'List sync is not configured'}), 503
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing access token'}), 401
        token = auth_header[len('Bearer '):].strip()
        try:
            sub, email = _user_from_token(token)
        except ClientError:
            return jsonify({'error': 'Invalid or expired token'}), 401
        if not sub:
            return jsonify({'error': 'Invalid token'}), 401
        request.user_sub = sub
        request.user_email = email
        request.user_name = email.split('@')[0] if email else 'someone'
        return f(*args, **kwargs)
    return wrapper


def _get_list_record(list_id):
    response = _table().get_item(Key={'pk': f'LIST#{list_id}', 'sk': 'META'})
    return response.get('Item')


def _record_to_list(record):
    """Merge the stored list JSON with server-owned share metadata."""
    data = json.loads(record['data'])
    members = record.get('members') or {}
    data['members'] = [{'sub': sub, 'name': name} for sub, name in members.items()]
    data['shareCode'] = record.get('share_code')
    return data


@lists_bp.route('/api/lists', methods=['GET'])
@require_auth
def get_lists():
    try:
        table = _table()
        response = table.query(
            KeyConditionExpression='pk = :pk AND begins_with(sk, :sk)',
            ExpressionAttributeValues={':pk': f'USER#{request.user_sub}', ':sk': 'LIST#'},
        )
        lists = []
        for membership in response.get('Items', []):
            list_id = membership['sk'][len('LIST#'):]
            record = _get_list_record(list_id)
            if record:
                lists.append(_record_to_list(record))
        return jsonify({'lists': lists}), 200
    except Exception as e:
        print(f"Error fetching lists: {e}")
        return jsonify({'error': 'Failed to fetch lists'}), 500


@lists_bp.route('/api/lists/<list_id>', methods=['PUT'])
@require_auth
def put_list(list_id):
    try:
        if len(request.get_data() or b'') > MAX_LIST_BYTES:
            return jsonify({'error': 'List is too large to sync'}), 413
        body = request.get_json(silent=True)
        incoming = body.get('list') if isinstance(body, dict) else None
        if not isinstance(incoming, dict):
            return jsonify({'error': 'List body is required'}), 400
        if incoming.get('id') != list_id:
            return jsonify({'error': 'List id mismatch'}), 400

        table = _table()
        record = _get_list_record(list_id)

        if record:
            members = record.get('members') or {}
            if request.user_sub not in members:
                return jsonify({'error': 'Not a member of this list'}), 403
            share_code = record.get('share_code')
            owner_sub = record.get('owner_sub')
        else:
            members = {}
            share_code = None
            owner_sub = request.user_sub
        members.setdefault(request.user_sub, request.user_name)

        # members/shareCode are server-owned; strip whatever the client sent
        stored = dict(incoming)
        stored.pop('members', None)
        stored.pop('shareCode', None)

        item = {
            'pk': f'LIST#{list_id}',
            'sk': 'META',
            'data': json.dumps(stored),
            'owner_sub': owner_sub,
            'members': members,
            'updated_at': stored.get('updatedAt', ''),
        }
        if share_code:
            item['share_code'] = share_code
        table.put_item(Item=item)
        table.put_item(Item={'pk': f'USER#{request.user_sub}', 'sk': f'LIST#{list_id}'})

        return jsonify({'list': _record_to_list(item)}), 200
    except Exception as e:
        print(f"Error saving list: {e}")
        return jsonify({'error': 'Failed to save list'}), 500


@lists_bp.route('/api/lists/<list_id>', methods=['DELETE'])
@require_auth
def delete_list(list_id):
    try:
        table = _table()
        record = _get_list_record(list_id)
        if not record:
            return jsonify({'deleted': True}), 200

        members = record.get('members') or {}
        if request.user_sub not in members:
            return jsonify({'error': 'Not a member of this list'}), 403

        if record.get('owner_sub') == request.user_sub:
            # Owner deletes the list for everyone
            for sub in members:
                table.delete_item(Key={'pk': f'USER#{sub}', 'sk': f'LIST#{list_id}'})
            table.delete_item(Key={'pk': f'LIST#{list_id}', 'sk': 'META'})
        else:
            # Non-owners just leave the list
            members.pop(request.user_sub, None)
            table.delete_item(Key={'pk': f'USER#{request.user_sub}', 'sk': f'LIST#{list_id}'})
            table.update_item(
                Key={'pk': f'LIST#{list_id}', 'sk': 'META'},
                UpdateExpression='SET members = :m',
                ExpressionAttributeValues={':m': members},
            )
        return jsonify({'deleted': True}), 200
    except Exception as e:
        print(f"Error deleting list: {e}")
        return jsonify({'error': 'Failed to delete list'}), 500


@lists_bp.route('/api/lists/<list_id>/share', methods=['POST'])
@require_auth
def share_list(list_id):
    try:
        table = _table()
        record = _get_list_record(list_id)
        if not record:
            return jsonify({'error': 'List not found — save it first'}), 404
        members = record.get('members') or {}
        if request.user_sub not in members:
            return jsonify({'error': 'Not a member of this list'}), 403

        code = record.get('share_code')
        if not code:
            code = ''.join(random.SystemRandom().choices(_CODE_ALPHABET, k=6))
            table.update_item(
                Key={'pk': f'LIST#{list_id}', 'sk': 'META'},
                UpdateExpression='SET share_code = :c',
                ExpressionAttributeValues={':c': code},
            )
        return jsonify({'code': code}), 200
    except Exception as e:
        print(f"Error sharing list: {e}")
        return jsonify({'error': 'Failed to create share code'}), 500


# Rate-limited (before auth) so share codes can't be brute-forced
@lists_bp.route('/api/lists/join', methods=['POST'])
@rate_limited
@require_auth
def join_list():
    try:
        body = request.get_json(silent=True)
        code = body.get('code') if isinstance(body, dict) else None
        if not isinstance(code, str) or not code.strip():
            return jsonify({'error': 'Share code is required'}), 400
        code = code.strip().upper()

        table = _table()
        response = table.query(
            IndexName='byShareCode',
            KeyConditionExpression='share_code = :c',
            ExpressionAttributeValues={':c': code},
        )
        items = response.get('Items', [])
        if not items:
            return jsonify({'error': 'No list found for that code'}), 404
        record = items[0]
        list_id = record['pk'][len('LIST#'):]

        members = record.get('members') or {}
        if request.user_sub not in members:
            members[request.user_sub] = request.user_name
            table.update_item(
                Key={'pk': f'LIST#{list_id}', 'sk': 'META'},
                UpdateExpression='SET members = :m',
                ExpressionAttributeValues={':m': members},
            )
            table.put_item(Item={'pk': f'USER#{request.user_sub}', 'sk': f'LIST#{list_id}'})
            record['members'] = members

        return jsonify({'list': _record_to_list(record)}), 200
    except Exception as e:
        print(f"Error joining list: {e}")
        return jsonify({'error': 'Failed to join list'}), 500

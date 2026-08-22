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

# Aisle-override sync (see the aisle-overrides endpoints below):
#   Vote:      pk=AISLE#<storeId>#<itemKey>, sk=USER#<sub>
#                { kind, value, store_aisle, item, updated_at }
#   Consensus: pk=AISLE#<storeId>#<itemKey>, sk=CONSENSUS  (derived, recomputed
#                inline on every vote — no Streams/Lambda)
#                { kind, value, agree, voters, updated_at }
MAX_OVERRIDE_ITEMS = 200        # items a single resolve request may ask about
CONSENSUS_MIN_AGREE = 3         # distinct users who must agree to promote a placement


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


def _item_key(name):
    return (name or '').strip().lower()


def _vote_pk(store_id, item_key):
    return f'AISLE#{store_id}#{item_key}'


def _validate_placement(placement):
    """Normalize a client placement, or None if it's malformed.

    { kind: 'aisle', value: <int>=1> } | { kind: 'category', value: <str> } |
    { kind: 'none' } (marked not sold here — a real opinion, kept as a vote).
    """
    if not isinstance(placement, dict):
        return None
    kind = placement.get('kind')
    if kind == 'aisle':
        value = placement.get('value')
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            return None
        return {'kind': 'aisle', 'value': value}
    if kind == 'category':
        value = placement.get('value')
        if not isinstance(value, str) or not value.strip():
            return None
        return {'kind': 'category', 'value': value.strip()}
    if kind == 'none':
        return {'kind': 'none', 'value': None}
    return None


def _placement_signature(item):
    """A hashable key identifying a placement, for tallying agreement."""
    return (item.get('kind'), _coerce_value(item.get('kind'), item.get('value')))


def _coerce_value(kind, value):
    """DynamoDB returns numbers as Decimal; aisle values must serialize as int
    (and compare/tally as int). Category values stay strings, 'none' stays None."""
    if kind == 'aisle' and value is not None:
        return int(value)
    return value


def _override_out(item, source, extra=None):
    out = {'kind': item['kind'], 'value': _coerce_value(item.get('kind'), item.get('value')), 'source': source}
    if extra:
        out.update(extra)
    return out


def _recompute_consensus(table, pk):
    """Re-tally all votes for one (store, item) and write or retire its derived
    CONSENSUS row. Called inline after every vote — one small partition read."""
    response = table.query(
        KeyConditionExpression='pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues={':pk': pk, ':sk': 'USER#'},
    )
    votes = response.get('Items', [])
    counts = {}
    for vote in votes:
        sig = _placement_signature(vote)
        counts[sig] = counts.get(sig, 0) + 1

    consensus_key = {'pk': pk, 'sk': 'CONSENSUS'}
    if counts:
        # Most-agreed placement; ties break deterministically by the signature
        (kind, value), agree = max(counts.items(), key=lambda kv: (kv[1], repr(kv[0])))
    else:
        agree = 0
    if agree >= CONSENSUS_MIN_AGREE:
        table.put_item(Item={
            **consensus_key,
            'kind': kind,
            'value': value,
            'agree': agree,
            'voters': len(votes),
            'updated_at': _now_iso(),
        })
    else:
        table.delete_item(Key=consensus_key)


def _now_iso():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


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


@lists_bp.route('/api/account', methods=['DELETE'])
@require_auth
def delete_account():
    """Self-serve account deletion: removes every trace of the user, then the
    Cognito user itself (via their own access token, so no admin API needed)."""
    try:
        table = _table()
        sub = request.user_sub
        response = table.query(
            KeyConditionExpression='pk = :pk AND begins_with(sk, :sk)',
            ExpressionAttributeValues={':pk': f'USER#{sub}', ':sk': 'LIST#'},
        )
        for membership in response.get('Items', []):
            list_id = membership['sk'][len('LIST#'):]
            table.delete_item(Key={'pk': f'USER#{sub}', 'sk': f'LIST#{list_id}'})
            record = _get_list_record(list_id)
            if not record:
                continue
            if record.get('owner_sub') == sub:
                # Owned lists disappear for every member
                for member_sub in record.get('members') or {}:
                    table.delete_item(Key={'pk': f'USER#{member_sub}', 'sk': f'LIST#{list_id}'})
                table.delete_item(Key={'pk': f'LIST#{list_id}', 'sk': 'META'})
            else:
                # Someone else's shared list: just leave it
                members = record.get('members') or {}
                members.pop(sub, None)
                table.update_item(
                    Key={'pk': f'LIST#{list_id}', 'sk': 'META'},
                    UpdateExpression='SET members = :m',
                    ExpressionAttributeValues={':m': members},
                )

        # Data is gone; now delete the Cognito user itself
        token = request.headers['Authorization'][len('Bearer '):].strip()
        _cognito_client().delete_user(AccessToken=token)
        _token_cache.pop(token, None)
        return jsonify({'deleted': True}), 200
    except Exception as e:
        print(f"Error deleting account: {e}")
        return jsonify({'error': 'Failed to delete account'}), 500


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


# ---- Aisle overrides: a shopper's per-(store, item) corrections ----
# One vote per user; corrections sync across a signed-in user's devices, are
# shared with the members of a shared list, and — once enough shoppers agree —
# promote to a community CONSENSUS served to everyone at that store.

@lists_bp.route('/api/aisle-overrides', methods=['PUT'])
@rate_limited
@require_auth
def put_aisle_override():
    """Record (or clear) the caller's aisle/category correction for one item at
    a store, then recompute that item's consensus. Send placement=null to
    clear (reset to the store's aisle)."""
    try:
        body = request.get_json(silent=True) or {}
        store_id = body.get('storeId')
        item = body.get('item')
        if not isinstance(store_id, str) or not store_id.strip():
            return jsonify({'error': 'storeId is required'}), 400
        key = _item_key(item)
        if not key:
            return jsonify({'error': 'item is required'}), 400

        table = _table()
        pk = _vote_pk(store_id.strip(), key)
        sk = f'USER#{request.user_sub}'

        raw = body.get('placement', None)
        if raw is None:
            table.delete_item(Key={'pk': pk, 'sk': sk})
        else:
            placement = _validate_placement(raw)
            if placement is None:
                return jsonify({'error': 'Invalid placement'}), 400
            store_aisle = body.get('storeAisle')
            table.put_item(Item={
                'pk': pk,
                'sk': sk,
                'kind': placement['kind'],
                'value': placement['value'],
                'store_aisle': store_aisle if isinstance(store_aisle, int) else None,
                'item': (item or '').strip(),
                'updated_at': _now_iso(),
            })

        _recompute_consensus(table, pk)
        return jsonify({'ok': True}), 200
    except Exception as e:
        print(f"Error saving aisle override: {e}")
        return jsonify({'error': 'Failed to save aisle override'}), 500


@lists_bp.route('/api/aisle-overrides/resolve', methods=['POST'])
@require_auth
def resolve_aisle_overrides():
    """Resolve the effective placement for each item on a shopping trip, by
    precedence: the caller's own correction, then a shared-list member's, then
    the community consensus. Items with none of these are simply omitted (the
    client keeps the store's aisle / Not Found). Returns
    { overrides: { itemKey: { kind, value, source } } }."""
    try:
        body = request.get_json(silent=True) or {}
        store_id = body.get('storeId')
        items = body.get('items')
        if not isinstance(store_id, str) or not store_id.strip():
            return jsonify({'error': 'storeId is required'}), 400
        if not isinstance(items, list):
            return jsonify({'error': 'items must be a list'}), 400
        store_id = store_id.strip()

        table = _table()

        # Household = the members of the list the caller names (if any). The
        # caller must belong to it, so members can't be probed by outsiders.
        member_subs = []
        list_id = body.get('listId')
        if isinstance(list_id, str) and list_id:
            record = _get_list_record(list_id)
            members = (record or {}).get('members') or {}
            if request.user_sub not in members:
                return jsonify({'error': 'Not a member of this list'}), 403
            member_subs = [s for s in members if s != request.user_sub]

        my_sk = f'USER#{request.user_sub}'
        overrides = {}
        seen = set()
        for name in items[:MAX_OVERRIDE_ITEMS]:
            key = _item_key(name)
            if not key or key in seen:
                continue
            seen.add(key)
            pk = _vote_pk(store_id, key)

            # Every row this item needs — my vote, each household member's
            # vote, and the derived consensus — lives under this one partition
            # key, so one query resolves all three precedence levels instead
            # of a get_item per candidate.
            response = table.query(KeyConditionExpression='pk = :pk', ExpressionAttributeValues={':pk': pk})
            rows = {row['sk']: row for row in response.get('Items', [])}

            mine = rows.get(my_sk)
            if mine:
                overrides[key] = _override_out(mine, 'me')
                continue

            household = next((rows[f'USER#{sub}'] for sub in member_subs if f'USER#{sub}' in rows), None)
            if household:
                overrides[key] = _override_out(household, 'household')
                continue

            consensus = rows.get('CONSENSUS')
            if consensus:
                overrides[key] = _override_out(consensus, 'community', {'agree': int(consensus.get('agree', 0))})

        return jsonify({'overrides': overrides}), 200
    except Exception as e:
        print(f"Error resolving aisle overrides: {e}")
        return jsonify({'error': 'Failed to resolve aisle overrides'}), 500

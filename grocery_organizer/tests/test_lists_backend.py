"""Tests for the account-deletion endpoint in the lists_backend blueprint.

DynamoDB and Cognito are stubbed so no AWS calls happen.
"""

import json
from unittest.mock import patch

import pytest
from flask import Flask

import lists_backend
import rate_limit
from lists_backend import lists_bp


class FakeTable:
    """In-memory stand-in for the DynamoDB table, keyed by (pk, sk)."""

    def __init__(self):
        self.items = {}

    def get_item(self, Key):
        item = self.items.get((Key['pk'], Key['sk']))
        return {'Item': item} if item else {}

    def put_item(self, Item):
        self.items[(Item['pk'], Item['sk'])] = Item

    def delete_item(self, Key):
        self.items.pop((Key['pk'], Key['sk']), None)

    def query(self, **kwargs):
        # Supports 'pk = :pk' alone, or with 'AND begins_with(sk, :sk)'
        values = kwargs['ExpressionAttributeValues']
        pk = values[':pk']
        prefix = values.get(':sk')
        return {'Items': [
            item for (ipk, isk), item in list(self.items.items())
            if ipk == pk and (prefix is None or isk.startswith(prefix))
        ]}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues):
        # Supports single-field 'SET <field> = :v' expressions
        field = UpdateExpression[len('SET '):].split(' =')[0]
        value = next(iter(ExpressionAttributeValues.values()))
        self.items[(Key['pk'], Key['sk'])][field] = value


class FakeCognito:
    def __init__(self):
        self.deleted_tokens = []

    def delete_user(self, AccessToken):
        self.deleted_tokens.append(AccessToken)


def seed_list(table, list_id, owner, members):
    table.put_item(Item={
        'pk': f'LIST#{list_id}',
        'sk': 'META',
        'data': json.dumps({'id': list_id}),
        'owner_sub': owner,
        'members': {sub: sub for sub in members},
    })
    for sub in members:
        table.put_item(Item={'pk': f'USER#{sub}', 'sk': f'LIST#{list_id}'})


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(lists_bp)
    lists_backend._token_cache.clear()
    rate_limit._rate_hits.clear()
    with app.test_client() as test_client:
        yield test_client


def test_delete_account_removes_owned_lists_and_leaves_shared_ones(client):
    table = FakeTable()
    cognito = FakeCognito()
    seed_list(table, 'mine', owner='alice', members=['alice', 'bob'])
    seed_list(table, 'theirs', owner='bob', members=['alice', 'bob'])

    with patch.object(lists_backend, 'sync_enabled', return_value=True), \
         patch.object(lists_backend, '_table', return_value=table), \
         patch.object(lists_backend, '_user_from_token',
                      return_value=('alice', 'alice@example.com')), \
         patch.object(lists_backend, '_cognito_client', return_value=cognito):
        response = client.delete('/api/account',
                                 headers={'Authorization': 'Bearer tok-alice'})

    assert response.status_code == 200
    assert response.get_json() == {'deleted': True}
    # Alice's owned list is gone for every member
    assert ('LIST#mine', 'META') not in table.items
    assert ('USER#bob', 'LIST#mine') not in table.items
    # Bob's list survives, minus alice
    record = table.items[('LIST#theirs', 'META')]
    assert 'alice' not in record['members']
    assert 'bob' in record['members']
    assert ('USER#bob', 'LIST#theirs') in table.items
    # No trace of alice remains, and her Cognito user was deleted
    assert not [key for key in table.items if key[0] == 'USER#alice']
    assert cognito.deleted_tokens == ['tok-alice']


def test_delete_account_requires_auth(client):
    with patch.object(lists_backend, 'sync_enabled', return_value=True):
        response = client.delete('/api/account')
    assert response.status_code == 401


def test_delete_account_returns_503_when_sync_unconfigured(client):
    with patch.object(lists_backend, 'sync_enabled', return_value=False):
        response = client.delete('/api/account',
                                 headers={'Authorization': 'Bearer tok'})
    assert response.status_code == 503


# ---- Aisle override sync ----

AUTH = {'Authorization': 'Bearer t'}


def _as(sub):
    """Patch the authenticated user for a request."""
    return patch.object(lists_backend, '_user_from_token',
                        return_value=(sub, f'{sub}@example.com'))


def _configured(table):
    return patch.object(lists_backend, 'sync_enabled', return_value=True), \
           patch.object(lists_backend, '_table', return_value=table)


def test_put_and_resolve_personal_override(client):
    table = FakeTable()
    sync, tbl = _configured(table)
    with sync, tbl:
        with _as('alice'):
            r = client.put('/api/aisle-overrides', headers=AUTH,
                           json={'storeId': 'S1', 'item': 'Saffron',
                                 'placement': {'kind': 'aisle', 'value': 14}})
            assert r.status_code == 200
        with _as('alice'):
            r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                            json={'storeId': 'S1', 'items': ['saffron', 'milk']})
    assert r.status_code == 200
    assert r.get_json()['overrides'] == {
        'saffron': {'kind': 'aisle', 'value': 14, 'source': 'me'}
    }


def test_resolve_includes_household_member(client):
    table = FakeTable()
    seed_list(table, 'trip', owner='alice', members=['alice', 'bob'])
    sync, tbl = _configured(table)
    with sync, tbl:
        with _as('bob'):
            client.put('/api/aisle-overrides', headers=AUTH,
                       json={'storeId': 'S1', 'item': 'tahini',
                             'placement': {'kind': 'category', 'value': 'Condiments'}})
        with _as('alice'):
            r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                            json={'listId': 'trip', 'storeId': 'S1', 'items': ['tahini']})
    assert r.get_json()['overrides']['tahini'] == {
        'kind': 'category', 'value': 'Condiments', 'source': 'household'
    }


def test_personal_override_beats_household(client):
    table = FakeTable()
    seed_list(table, 'trip', owner='alice', members=['alice', 'bob'])
    sync, tbl = _configured(table)
    with sync, tbl:
        with _as('bob'):
            client.put('/api/aisle-overrides', headers=AUTH,
                       json={'storeId': 'S1', 'item': 'tahini', 'placement': {'kind': 'aisle', 'value': 2}})
        with _as('alice'):
            client.put('/api/aisle-overrides', headers=AUTH,
                       json={'storeId': 'S1', 'item': 'tahini', 'placement': {'kind': 'aisle', 'value': 12}})
            r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                            json={'listId': 'trip', 'storeId': 'S1', 'items': ['tahini']})
    assert r.get_json()['overrides']['tahini'] == {'kind': 'aisle', 'value': 12, 'source': 'me'}


def test_consensus_promotes_after_threshold(client):
    table = FakeTable()
    sync, tbl = _configured(table)
    with sync, tbl:
        for sub in ['u1', 'u2', 'u3']:
            with _as(sub):
                client.put('/api/aisle-overrides', headers=AUTH,
                           json={'storeId': 'S1', 'item': 'miso', 'placement': {'kind': 'aisle', 'value': 9}})
        with _as('stranger'):
            r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                            json={'storeId': 'S1', 'items': ['miso']})
    ov = r.get_json()['overrides']['miso']
    assert ov == {'kind': 'aisle', 'value': 9, 'source': 'community', 'agree': 3}


def test_two_voters_do_not_reach_consensus(client):
    table = FakeTable()
    sync, tbl = _configured(table)
    with sync, tbl:
        for sub in ['u1', 'u2']:
            with _as(sub):
                client.put('/api/aisle-overrides', headers=AUTH,
                           json={'storeId': 'S1', 'item': 'natto', 'placement': {'kind': 'aisle', 'value': 9}})
        with _as('stranger'):
            r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                            json={'storeId': 'S1', 'items': ['natto']})
    assert r.get_json()['overrides'] == {}


def test_clearing_removes_override(client):
    table = FakeTable()
    sync, tbl = _configured(table)
    with sync, tbl:
        with _as('alice'):
            client.put('/api/aisle-overrides', headers=AUTH,
                       json={'storeId': 'S1', 'item': 'kombu', 'placement': {'kind': 'aisle', 'value': 3}})
            client.put('/api/aisle-overrides', headers=AUTH,
                       json={'storeId': 'S1', 'item': 'kombu', 'placement': None})
            r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                            json={'storeId': 'S1', 'items': ['kombu']})
    assert r.get_json()['overrides'] == {}


def test_put_rejects_invalid_placement(client):
    table = FakeTable()
    sync, tbl = _configured(table)
    with sync, tbl, _as('alice'):
        r = client.put('/api/aisle-overrides', headers=AUTH,
                       json={'storeId': 'S1', 'item': 'x', 'placement': {'kind': 'aisle', 'value': 0}})
    assert r.status_code == 400


def test_resolve_non_member_cannot_probe_list(client):
    table = FakeTable()
    seed_list(table, 'trip', owner='alice', members=['alice'])
    sync, tbl = _configured(table)
    with sync, tbl, _as('mallory'):
        r = client.post('/api/aisle-overrides/resolve', headers=AUTH,
                        json={'listId': 'trip', 'storeId': 'S1', 'items': ['x']})
    assert r.status_code == 403


def test_aisle_override_503_when_unconfigured(client):
    with patch.object(lists_backend, 'sync_enabled', return_value=False):
        r = client.put('/api/aisle-overrides', headers=AUTH, json={})
    assert r.status_code == 503

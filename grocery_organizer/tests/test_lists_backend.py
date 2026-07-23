"""Tests for the account-deletion endpoint in the lists_backend blueprint.

DynamoDB and Cognito are stubbed so no AWS calls happen.
"""

import json
from unittest.mock import patch

import pytest
from flask import Flask

import lists_backend
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
        # Supports the membership query: pk = :pk AND begins_with(sk, :sk)
        values = kwargs['ExpressionAttributeValues']
        pk, prefix = values[':pk'], values[':sk']
        return {'Items': [
            item for (ipk, isk), item in list(self.items.items())
            if ipk == pk and isk.startswith(prefix)
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

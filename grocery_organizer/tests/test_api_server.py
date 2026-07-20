"""The unauthenticated debug routes must not exist outside development.

api_server.py registers routes at import time based on FLASK_ENV, so these
tests reload the module under different environments.
"""

import importlib


def _routes_with_env(monkeypatch, flask_env):
    monkeypatch.setenv('FLASK_ENV', flask_env)
    import api_server
    api_server = importlib.reload(api_server)
    return {rule.rule for rule in api_server.app.url_map.iter_rules()}


def test_debug_routes_absent_in_production(monkeypatch):
    routes = _routes_with_env(monkeypatch, 'production')
    assert '/api/debug-kroger' not in routes
    assert '/debug' not in routes


def test_debug_routes_present_in_development(monkeypatch):
    routes = _routes_with_env(monkeypatch, 'development')
    assert '/api/debug-kroger' in routes
    assert '/debug' in routes

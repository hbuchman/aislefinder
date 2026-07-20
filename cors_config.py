"""CORS origin allowlist shared by both server entry points.

localhost:3000 is the CRA dev server; the capacitor/localhost origins are
what the iOS and Android wrappers present when calling the production API.
"""

ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://aislefinder3000.com',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
]

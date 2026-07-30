"""Product lookups for grocery chains with no public API, backed by a local
data file instead of a live store API call.

Each chain/store gets a CSV at grocery_organizer/data/stores/<chain>-<store_id>.csv
with columns `item,found_product,category,aisle_number,raw_location`. `item`
is the normalized search key (see search_terms.preprocess_search_term);
`aisle_number` is -1 when unknown, matching FullProduct's convention.

Those files can come from anywhere: a developer might add rows by hand after
a real shopping trip, or take information from a user. Either way, this module
never makes a network call — a lookup either matches a row exactly, matches
one closely enough via the same fuzzy scoring Kroger's live search uses (see
matching.py), or comes back "Not Found" and gets logged so someone can add it
to the data file later.
"""

import csv
import os
import threading

from grocery_organizer.src.core.models import FullProduct
from grocery_organizer.src.store_api import matching
from grocery_organizer.src.store_api.search_terms import preprocess_search_term

_PACKAGE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(_PACKAGE_ROOT, 'data', 'stores')
REGISTRY_PATH = os.path.join(DATA_DIR, 'registry.csv')

_cache = {}
_cache_lock = threading.Lock()
_registry_cache = None
_registry_cache_lock = threading.Lock()


def _csv_path(chain, store_id):
    return os.path.join(DATA_DIR, f"{chain}-{store_id}.csv")


def _registry_rows():
    """Known (chain, store_id) -> name/address/zip, for find_stores_by_zip.

    A store only needs a data file to be *looked up*; it needs a row here too
    to be *found by ZIP* in the store picker. Loaded once and cached.
    """
    global _registry_cache
    with _registry_cache_lock:
        if _registry_cache is not None:
            return _registry_cache

    rows = []
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH, newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))

    with _registry_cache_lock:
        _registry_cache = rows
    return rows


def _rows_for(chain, store_id):
    """Parsed rows for (chain, store_id), loaded once and cached in memory.

    A store with no data file yet just returns an empty list (every lookup
    becomes "Not Found") rather than raising, so a chain can be wired up in
    code before any data has been collected for it.
    """
    key = (chain, store_id)
    with _cache_lock:
        cached = _cache.get(key)
        if cached is not None:
            return cached

    path = _csv_path(chain, store_id)
    rows = []
    if os.path.exists(path):
        with open(path, newline='', encoding='utf-8') as f:
            for raw_row in csv.DictReader(f):
                rows.append({
                    'item': raw_row['item'],
                    'found_product': raw_row['found_product'],
                    'category': raw_row['category'],
                    'aisle_number': int(raw_row['aisle_number']),
                    'raw_location': raw_row.get('raw_location') or '',
                })

    with _cache_lock:
        _cache[key] = rows
    return rows


class StoreDatabaseAPI:
    """Duck-typed store client (same shape as KrogerAPI) backed entirely by
    a local data file — no network calls, no credentials.
    """

    def __init__(self, chain, store_id=None):
        self.chain = chain
        self.store_id = store_id

    def get_auth_token(self):
        pass  # no live auth; reading local data needs none

    def _scored_candidates(self, key):
        """Rows relevant to `key`, scored and sorted best-first."""
        scored = []
        for row in _rows_for(self.chain, self.store_id):
            if not matching.is_relevant(key, row['found_product']):
                continue
            score = matching.score_description(
                key, row['found_product'],
                has_location=row['aisle_number'] > 0,
                category=row['category'],
            )
            scored.append((score, row))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return scored

    def find_product(self, product_name) -> FullProduct:
        key = preprocess_search_term(product_name)

        exact = next(
            (row for row in _rows_for(self.chain, self.store_id) if row['item'] == key),
            None,
        )
        if exact:
            return FullProduct(product_name, exact['found_product'], exact['category'], exact['aisle_number'])

        scored = self._scored_candidates(key)
        if not scored:
            print(f"Miss: no local data match for '{product_name}' ({self.chain}/{self.store_id})")
            return FullProduct(product_name, f"{product_name} (not found in store)", "Not Found", -1)

        _, row = scored[0]
        return FullProduct(product_name, row['found_product'], row['category'], row['aisle_number'])

    def find_item_details(self, product_name, limit=5) -> list:
        key = preprocess_search_term(product_name)
        scored = self._scored_candidates(key)

        results = []
        for _, row in scored[:limit]:
            location = None
            if row['aisle_number'] > 0 or row['raw_location']:
                location = {
                    'aisle': row['aisle_number'] if row['aisle_number'] > 0 else None,
                    'side': None,
                    'shelf': None,
                    'bay': None,
                    'description': row['raw_location'] or None,
                }
            results.append({
                'name': row['found_product'],
                'brand': None,
                'size': None,
                'category': row['category'],
                'image': None,
                'location': location,
            })
        return results

    def find_stores_by_zip(self, zip_code):
        """Known stores for this chain in `zip_code`, from registry.csv.

        Exact ZIP match only — there's no geocoding here, unlike Kroger's
        radius search, so distance is always None.
        """
        return [
            {'id': row['store_id'], 'name': row['name'], 'address': row['address'], 'distance': None}
            for row in _registry_rows()
            if row['chain'] == self.chain and row['zip'] == zip_code
        ]

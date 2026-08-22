"""Woodman's Markets product search, via GrocerKey's white-labeled Instacart platform.

Woodman's has no public API; its app (com.grocerkey.frontendapp.woodmans) is a
reskinned Instacart Connect storefront, reverse-engineered from captured app
traffic (mitmproxy + Frida on a rooted emulator). Requests go straight to
Instacart's `pbis.instacart.com` GraphQL endpoint using Instacart's own
persisted-query hashes and Woodman's `x-whitelabel-domain`.

Auth is a session bundle (bearer token + ahoy visit/visitor IDs + device
identifiers) captured from the app rather than obtained via any documented
flow — GraphQL schema introspection (via apktool-decompiled response-adapter
classes) shows the token is delivered as an HTTP-cookie-shaped object, and a
`regenerate: true` call against a still-valid token returned no new one, so
lifetime appears to be long-lived rather than short/rotating. Treat the
session bundle as a manually-refreshed credential — when calls start failing,
re-capture a fresh session via mitmproxy and update the environment variables
below.

Because this rides on Instacart's production API rather than a small
regional chain's, keep call volume low (see capture_store.py's rate
limiting) and don't treat it as a stable, supported integration. This module
is intentionally NOT part of the shipped app — see store-capture/README (or
CLAUDE.md) for why it lives in this git-ignored folder instead of
grocery_organizer/src/store_api/.
"""

import json
import os
import re
import threading
import uuid

import requests

GRAPHQL_URL = "https://pbis.instacart.com/graphql"
WHITELABEL_DOMAIN = "shopwoodmans.com"

SEARCH_QUERY_HASH = "32b549bb790fcae128c04efa109bad0405a9f074d7aa9c990faeb76b7c117d5f"

# The only store location captured so far. Woodman's store search hasn't been
# reverse-engineered (no captured traffic for it yet), so store_id is looked
# up here rather than resolved from a zip code.
STORE_CONFIG = {
    "407077": {"postal_code": "53186", "zone_id": "334"},
}
DEFAULT_STORE_ID = "407077"

AISLE_NUMBER_RE = re.compile(r"^Aisle\s+(\d+)\b", re.IGNORECASE)
SHELF_RE = re.compile(r"Shelf\s+(\S+)", re.IGNORECASE)

_session = requests.Session()


def preprocess_search_term(product_name):
    """Minimal local copy of the app's search-term cleanup — avoids this
    git-ignored folder importing from the committed grocery_organizer package."""
    return product_name.strip()


class WoodmansAPI:
    """Client for Woodman's storefront search.

    store_id here is Instacart's internal "shopId" for a physical Woodman's
    location (captured from app traffic), not a Woodman's-native store number.
    """

    def __init__(self, store_id: str = DEFAULT_STORE_ID):
        if store_id not in STORE_CONFIG:
            raise ValueError(
                f"Unknown Woodman's store_id '{store_id}'; only {list(STORE_CONFIG)} "
                "have been captured so far. Capture a new store's shopId/postalCode/"
                "zoneId via mitmproxy and add it to STORE_CONFIG."
            )
        self.store_id = store_id
        self.postal_code = STORE_CONFIG[store_id]["postal_code"]
        self.zone_id = STORE_CONFIG[store_id]["zone_id"]

        self.auth_token = None
        self.ahoy_visit = None
        self.ahoy_visitor = None
        self.device_uuid = None
        self.client_user_id = None
        self._auth_lock = threading.Lock()

    def get_auth_token(self):
        """Load the captured session bundle from the environment.

        Unlike Kroger's OAuth client-credentials flow, there's no known way
        to mint this session bundle from scratch (see module docstring) —
        it's read verbatim from env vars captured via mitmproxy.
        """
        with self._auth_lock:
            if self.auth_token:
                return self.auth_token

            required = {
                "WOODMANS_AUTH_TOKEN": "auth_token",
                "WOODMANS_AHOY_VISIT": "ahoy_visit",
                "WOODMANS_AHOY_VISITOR": "ahoy_visitor",
                "WOODMANS_DEVICE_UUID": "device_uuid",
                "WOODMANS_CLIENT_USER_ID": "client_user_id",
            }
            missing = [env for env in required if not os.environ.get(env)]
            if missing:
                raise ValueError(
                    "Missing Woodman's session env vars: "
                    f"{', '.join(missing)}. Capture a fresh session via mitmproxy "
                    "(see docs) and set them before calling WoodmansAPI."
                )

            for env, attr in required.items():
                setattr(self, attr, os.environ[env])

            return self.auth_token

    def _headers(self, operation_name):
        return {
            "apollo-require-preflight": "true",
            "x-apollo-operation-name": operation_name,
            "x-ic-client-span-uuid": str(uuid.uuid4()),
            "x-client-identifier": "Android",
            "user-agent": "Android-12 9.26.0-v2 sdk_gphone64_arm64",
            "x-client-os": "android",
            "x-client-version": "9.26.0",
            "content-type": "application/json",
            "accept": "application/json",
            "x-device-class": "phone",
            "x-android-api-version": "31",
            "x-device-uuid": self.device_uuid,
            "x-client-user-id": self.client_user_id,
            "x-whitelabel-domain": WHITELABEL_DOMAIN,
            "authorization": f"Bearer {self.auth_token}",
            "accept-language": "en-US;q=1.0",
            "ahoy-visitor": self.ahoy_visitor,
            "ahoy-visit": self.ahoy_visit,
            "cookie": f"ahoy_visit={self.ahoy_visit}",
        }

    def _search_raw(self, search_term, page_size=40):
        self.get_auth_token()

        variables = {
            "query": search_term,
            "orderBy": "bestMatch",
            "filters": [],
            "pageViewId": str(uuid.uuid4()),
            "contentManagementSearchParams": {"itemGridColumnCount": 2},
            "searchSource": "storefront",
            "disableReformulation": False,
            "action": {
                "refinementType": "filters",
                "filters": [],
                "clusterId": "",
                "clusteringStrategy": "",
                "query": "",
                "attributes": [],
            },
            "shopId": self.store_id,
            "postalCode": self.postal_code,
            "coordinates": {"latitude": 0.0, "longitude": 0.0},
            "hydrateItemPrice": False,
            "itemShopId": self.store_id,
            "itemZoneId": self.zone_id,
            "itemPostalCode": self.postal_code,
        }
        extensions = {
            "persistedQuery": {"version": 1, "sha256Hash": SEARCH_QUERY_HASH},
            "clientLibrary": {"name": "apollo-kotlin", "version": "5.0.1"},
        }
        params = {
            "operationName": "SearchResultsPlacements",
            "variables": json.dumps(variables, separators=(",", ":")),
            "extensions": json.dumps(extensions, separators=(",", ":")),
        }

        resp = _session.get(
            GRAPHQL_URL,
            params=params,
            headers=self._headers("SearchResultsPlacements"),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise RuntimeError(f"Woodman's search errors: {data['errors']}")

        placements = (
            data.get("data", {}).get("searchResultsPlacements", {}).get("placements", [])
            or []
        )

        exact_items, related_items = [], []
        for placement in placements:
            content = placement.get("content", {})
            if content.get("__typename") != "SearchContentManagementSearchItemGrid":
                continue
            section_type = (
                content.get("viewSection", {})
                .get("trackingProperties", {})
                .get("section_details", {})
                .get("section_type")
            )
            bucket = exact_items if section_type == "exact_results" else related_items
            bucket.extend(content.get("items") or [])

        return (exact_items[:page_size] or related_items[:page_size])

    @staticmethod
    def _parse_location(location_string, fallback_category):
        """Return (aisle_number, category) from Woodman's free-text location.

        Locations look like "Bakery" (department only, no aisle) or
        "Aisle 22 - Shelf A07" (numeric) or "Aisle P - Shelf B05" (lettered
        aisle, which an int aisle_number can't represent). When a numeric
        aisle can't be extracted, the raw location string is used as the
        category instead of the product's own category, since it's a more
        useful physical grouping for shopping than a generic product category.
        """
        if not location_string:
            return -1, fallback_category

        match = AISLE_NUMBER_RE.match(location_string)
        if match:
            return int(match.group(1)), fallback_category

        return -1, location_string

    def find_product(self, product_name: str):
        search_term = preprocess_search_term(product_name)
        items = self._search_raw(search_term, page_size=1)
        if not items:
            return {
                "input_name": product_name,
                "found_product": f"{product_name} (not found in store)",
                "category": "Not Found",
                "aisle_number": -1,
                "raw_location": "",
            }

        item = items[0]
        location_string = (
            item.get("inStoreItemLocation", {}).get("viewSection", {}).get("locationString")
        )
        category = item.get("productCategoryName") or "Not Found"
        aisle_number, category = self._parse_location(location_string, category)

        return {
            "input_name": product_name,
            "found_product": item.get("name", product_name),
            "category": category,
            "aisle_number": aisle_number,
            "raw_location": location_string or "",
        }

    def find_item_details(self, product_name: str, limit: int = 5) -> list:
        search_term = preprocess_search_term(product_name)
        items = self._search_raw(search_term, page_size=limit)

        results = []
        for item in items[:limit]:
            location_string = (
                item.get("inStoreItemLocation", {})
                .get("viewSection", {})
                .get("locationString")
            )
            location = None
            if location_string:
                aisle_match = AISLE_NUMBER_RE.match(location_string)
                shelf_match = SHELF_RE.search(location_string)
                location = {
                    "aisle": int(aisle_match.group(1)) if aisle_match else None,
                    "side": None,
                    "shelf": shelf_match.group(1) if shelf_match else None,
                    "bay": None,
                    "description": location_string,
                }

            results.append(
                {
                    "name": item.get("name"),
                    "brand": item.get("brandName"),
                    "size": item.get("size"),
                    "category": item.get("productCategoryName"),
                    "image": item.get("viewSection", {}).get("itemImage", {}).get("url"),
                    "location": location,
                }
            )

        return results

    def find_stores_by_zip(self, zip_code: str) -> list:
        raise NotImplementedError(
            "Woodman's store search hasn't been reverse-engineered yet — only "
            f"the store(s) in STORE_CONFIG ({list(STORE_CONFIG)}) are usable."
        )

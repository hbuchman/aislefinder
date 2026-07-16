"""Tests for KrogerAPI._parse_locations — store picker result cleanup."""

from grocery_organizer.src.store_api.kroger import KrogerAPI


def location(name, location_id='001', distance=None):
    loc = {
        'locationId': location_id,
        'name': name,
        'address': {'addressLine1': '1 Main St', 'city': 'SLC', 'state': 'UT', 'zipCode': '84102'},
    }
    if distance is not None:
        loc['distance'] = distance
    return loc


def test_parses_basic_store():
    stores = KrogerAPI._parse_locations([location("Smith's Marketplace", distance=1.2)])
    assert stores == [{
        'id': '001',
        'name': "Smith's Marketplace",
        'address': '1 Main St, SLC, UT 84102',
        'distance': 1.2,
    }]


def test_fuel_kiosks_filtered_out():
    stores = KrogerAPI._parse_locations([
        location("Smith's Express - South Temple Fuel"),
        location("Smith's Fuel Center"),
        location("Smith's - 876 E 800 SO"),
    ])
    assert [s['name'] for s in stores] == ["Smith's - 876 E 800 SO"]


def test_missing_distance_stays_none():
    # None (not 0) so the frontend hides the distance instead of showing "0.0 mi"
    stores = KrogerAPI._parse_locations([location("Smith's")])
    assert stores[0]['distance'] is None


def test_malformed_location_skipped():
    stores = KrogerAPI._parse_locations([{'name': 'No id or address'}])
    assert stores == []

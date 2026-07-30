# Store data files

One CSV per `<chain>-<store_id>`, e.g. `woodmans-407077.csv`, used by
`StoreDatabaseAPI` (`grocery_organizer/src/store_api/store_database.py`) to
answer lookups for chains that don't have a public API. The app only ever
reads these files — it never queries the chain's own site/app at request
time.

## Format

```
item,found_product,category,aisle_number,raw_location
milk,Prairie Farms 2% Reduced Fat Milk,Dairy,-1,Dairy Cooler
bananas,Bananas,Produce,1,Aisle 1
```

- `item` — the normalized search key. Lowercase, no filler words/quantities
  (matches what `search_terms.preprocess_search_term()` produces — when in
  doubt, use the plain product name: "milk", not "2 gallons of milk").
- `found_product` — the actual product name/description a shopper would
  recognize on the shelf.
- `category` — a shopper-facing department name ("Dairy", "Produce", "Bakery").
- `aisle_number` — the walkable aisle number, or `-1` if unknown/department-only.
- `raw_location` — optional freeform detail (e.g. "Aisle 22 - Shelf A07"),
  used for the shop screen's item-detail view. Leave blank if unknown.

## Adding items by hand

No tooling required — after a real shopping trip, just append a row (or open
the CSV in a spreadsheet). If an item isn't in the file, or is only a close
variant of something that is, `StoreDatabaseAPI` will try to place it near
the closest match it already has, so the file doesn't need to cover every
possible product verbatim — but exact rows are always more reliable than the
similarity fallback.

Cache misses (lookups with no good match) print a log line on the server, so
grepping server logs is a good way to find what to add next.

## Making a store findable by ZIP: `registry.csv`

Having a `<chain>-<store_id>.csv` data file makes a store *look up-able*, but
the store picker's ZIP search needs a separate, tiny manifest to make it
*find-able*:

```
chain,store_id,name,address,zip
woodmans,407077,Woodman's Markets,"Waukesha, WI 53186",53186
```

Add a row here for every store you add a data file for. Matching is exact
ZIP only (no geocoding/radius, unlike Kroger's Locations API), so a shopper
has to enter the store's own ZIP to find it.

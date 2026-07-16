# Chapter 2: The Kroger API

The heart of the backend: turning "2 lbs of chicken" into "Aisle 14". This
chapter walks the Kroger client in
`grocery_organizer/src/store_api/kroger.py` — OAuth, search cleanup, and the
match-scoring logic that picks the right product.

## 2.1 Where it sits

`KrogerAPI` is a plain Python class constructed with a store ID and used
directly by both callers:

```python
# grocery_routes.py — single-item lookup
product = KrogerAPI(store_id).find_product(item)

# core/processor.py — whole-list processing
api_client = KrogerAPI(self.store_id)
api_client.get_auth_token()   # pre-fetch token before parallel calls
```

It exposes two public operations: `find_product(name)` → a `FullProduct`
(input name, matched description, category, aisle number), and
`find_stores_by_zip(zip)` → nearby stores for the store picker.

(Historical note: the codebase once had a second store client behind a
registry/interface abstraction. It was removed in July 2026 — one chain
didn't justify the indirection. The git history has the pattern if a second
chain ever comes back.)

## 2.2 Credentials and OAuth

Kroger's API uses **OAuth 2.0 client credentials** — the flow for
server-to-server access where no human logs in. You register an app at
https://developer.kroger.com and get a **client ID** (public, hardcoded in
`kroger.py` as `aislefinder5000-bbcct110`) and a **client secret** (private,
from `KROGER_CLIENT_SECRET` in `.env`).

To get an access token, you POST both — joined and base64-encoded as an
HTTP Basic auth header — to the token endpoint:

```python
auth_code = self.CLIENT_ID + ':' + client_secret
headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + base64.b64encode(auth_code.encode('utf-8')).decode('utf-8')
}
data = {'grant_type': 'client_credentials', 'scope': 'product.compact'}
response = requests.post(self.AUTH_URL, headers=headers, data=data)
```

Tokens expire, so `get_auth_token()` caches one and refreshes 60 seconds
early (`self.token_expiration = time.time() + expires_in - 60`). And because
item lookups run in parallel threads (chapter 1), the refresh is guarded by
a `threading.Lock` with a double-check — first thread in refreshes, the
rest reuse its token instead of stampeding the auth endpoint. (That's also
why the processor pre-fetches the token once before fanning out.)

## 2.3 Cleaning the search term: `search_terms.py`

Shopping lists say "2 lbs of chicken"; search APIs match best on "chicken".
`preprocess_search_term()` strips quantities, units, and filler words with
regex patterns before anything is sent to Kroger:

```python
cleaned = product_name.lower().strip()
for pattern in QUANTITY_PATTERNS:          # "2 lbs", "three gallons", "a dozen"...
    cleaned = re.sub(pattern, ' ', cleaned)

words = [w for w in cleaned.split() if w not in FILLER_WORDS and len(w) > 1]
result = ' '.join(words).strip()
return result if result else product_name.strip()   # never return nothing
```

Note the last line: if cleaning would delete the whole term (the item was
literally "a bag"), fall back to the raw input — a worse search beats an
empty one. Defensive fallbacks like this are a theme in this layer.

## 2.4 Picking the right match: relevance + scoring

Kroger's search often puts the wrong product first ("ice" returns rice;
"lemon" returns lemon-scented candles). `find_product()` takes the top 5
candidates and runs each through two functions:

**`_is_product_relevant()`** is a yes/no gate: at least half of the
meaningful search words must appear in the product description, using
word-level fuzzy matching (`_fuzzy_word_match`) that allows prefixes
("cheezit" ↔ "cheezits") and suffixes ("berries" in "strawberries") but
rejects substring traps like "ice" inside "rice". It also rejects
non-grocery products — a `NON_GROCERY_KEYWORDS` list (candles, detergent,
pet food, gift cards…) blocks a match *unless the user actually searched
for that keyword*.

**`_score_product()`** ranks the survivors. Reading the bonuses tells you
what "the right product" means here:

```python
score += 15  # description words == search words exactly
score += 10  # exact phrase appears in description
score += 3   # per matched search word
score += 5   # has aisleLocations (a real shelf item, not online-only)
score += 5   # fresh category (produce/bakery/deli/meat) when user didn't say "frozen"
score -= 5   # frozen category when user didn't ask for frozen
score -= 20  # non-grocery keyword in description
score += 4   # short description (< 20 chars ≈ the base product, not a variant)
```

The winner becomes a `FullProduct`; the aisle number comes from the
product's `aisleLocations` for the specific `store_id`, and `-1` means
unknown. If nothing passes the gate, the item becomes a "Not Found" entry
rather than an error — one unmatched item never breaks the list.

This is the file to tune when matching misbehaves: add a category alias to
`CATEGORY_MAP`, a blocked keyword to `NON_GROCERY_KEYWORDS`, or adjust a
bonus. The 64 scoring tests in chapter 3 make that safe to do.

## 2.5 Resilience: retries with exponential backoff

Every network-touching method wears the `@retry_api_call` decorator:

```python
@retry_api_call(max_retries=3, backoff_factor=1)
def find_product(self, product_name):
    ...
```

It retries **only** `requests.RequestException` (network flakiness), waiting
1s → 2s → 4s between attempts. Deterministic errors — bad config, malformed
responses — propagate immediately, since they'd fail identically every time.
That distinction (retry the transient, fail fast on the permanent) is worth
stealing for any API client you write.

## 2.6 Debug tooling

When a lookup returns something weird, you want to see Kroger's *raw*
response. The local server (never Vercel) has two tools for this:

```bash
# Run this — raw top-5 results for a term at a store
curl -X POST http://localhost:8000/api/debug-kroger \
  -H "Content-Type: application/json" \
  -d '{"term": "cheez its", "store_id": "01400943"}'
```

Or open **http://localhost:8000/debug** — a small HTML viewer
(`api-response-viewer.html`) around the same endpoint.

## TODOs to get this working

- [ ] **Create a Kroger developer account** at https://developer.kroger.com
- [ ] **Register an application** with access to the *Products* and
      *Locations* APIs (instant approval for these public APIs)
- [ ] **Update `CLIENT_ID`** in `grocery_organizer/src/store_api/kroger.py`
      to your app's client ID (the committed one belongs to the original
      author's registration)
- [ ] **Put the client secret** in `.env` as `KROGER_CLIENT_SECRET=...`
      (and later in Vercel, chapter 7)
- [ ] **Verify end to end** — start the server and hit
      `/api/find-item-aisle` with `{"item": "milk", "store_id": "01400943"}`,
      or poke the raw API at http://localhost:8000/debug

---

Next: [Chapter 3 — Testing the Python Backend](03-testing-python.md)

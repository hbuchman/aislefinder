# Chapter 3: Testing the Python Backend

The backend has a **pytest** suite in `grocery_organizer/tests/` — about a
hundred tests that run in seconds with zero network access. This chapter
covers running them, and the two testing techniques the suite is built on.

## 3.1 Running the suite

pytest is a dev-only tool, so it's not in `requirements.txt`; install it
into your venv once:

```bash
# Run this — venv active
pip install pytest
```

```bash
# Run this — from the repo root
PYTHONPATH=. python -m pytest grocery_organizer/tests
```

`PYTHONPATH=.` matters: the code imports as `grocery_organizer.src....`, so
the repo root must be on Python's import path (the server does this itself
at startup; for pytest you supply it). Useful variations:

```bash
# Run this — one file, verbose
PYTHONPATH=. python -m pytest grocery_organizer/tests/test_search_terms.py -v

# Run this — only tests whose name matches a keyword
PYTHONPATH=. python -m pytest grocery_organizer/tests -k "frozen"
```

pytest's model is simple: any `test_*.py` file, any `test_*` function, and
plain `assert` statements — no assertion classes to memorize.

## 3.2 What the suite covers

| File | Tests | Covers |
|------|------:|--------|
| `test_word_matching.py` | 64 | Kroger fuzzy matching + scoring (chapter 2's `_fuzzy_word_match`, `_is_product_relevant`, `_score_product`) |
| `test_input_parser.py` | 13 | Text → items: newlines, commas, bullets, checkboxes, numbering |
| `test_grocery_routes.py` | 9 | The Flask endpoints, with the Kroger client stubbed |
| `test_output_formatter.py` | 7 | Grouping, food-safe section order, markdown rendering |
| `test_search_terms.py` | 3 | Quantity/filler stripping |

Notice where the weight is: 64 of 96 tests target the match-scoring logic
— the code with the most edge cases and the most reasons to change (every
tuning tweak from chapter 2 risks regressing an earlier fix). Test density
should follow fragility, not file size.

## 3.3 Technique 1: parametrize — one test, many cases

Most of the suite is input/output pairs, and pytest has first-class support
for that shape (`test_search_terms.py`):

```python
@pytest.mark.parametrize("raw,expected", [
    ("2 lbs chicken", "chicken"),
    ("3 gallons of milk", "milk"),
    ("a dozen eggs", "eggs"),
    ("two loaves of bread", "bread"),
    ("large eggs", "eggs"),
    ("peanut butter", "peanut butter"),
    ("Cheez-Its", "cheez-its"),
])
def test_quantities_and_fillers_removed(raw, expected):
    assert preprocess_search_term(raw) == expected
```

Each tuple runs as a separate test with its own pass/fail. When you find a
mis-parsed item in real use, the fix is one new tuple — this is how the
word-matching file grew to 64 cases.

## 3.4 Technique 2: stubbing — testing routes without Kroger

Route tests must not call the real Kroger API (slow, flaky, needs secrets).
So the tests swap the whole client out for a fake
(`test_grocery_routes.py`):

```python
class StubKrogerAPI:
    """Deterministic stand-in for KrogerAPI."""

    def get_auth_token(self):
        return 'stub-token'

    def find_product(self, product_name):
        if product_name == 'milk':
            return FullProduct('milk', 'Whole Milk', 'Dairy', -1)
        ...

@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(grocery_bp)
    # Both the routes and the processor import KrogerAPI by name
    with patch.object(grocery_routes, 'KrogerAPI', StubKrogerAPI), \
         patch.object(processor, 'KrogerAPI', StubKrogerAPI):
        with app.test_client() as test_client:
            yield test_client
```

Three ideas packed in here:

- **A stub** is a hand-written fake with the same methods as `KrogerAPI`
  but canned answers — the whole test becomes deterministic.
- **`patch.object`** swaps the `KrogerAPI` name for the stub *for the
  duration of the test only*. Both modules that imported it get patched —
  a classic gotcha: patch where a name is *used*, not where it's defined.
- **A fixture** is pytest's reusable setup: any test that takes a `client`
  argument receives this pre-stubbed Flask **test client**, which fakes HTTP
  requests in-process — no server, no port:

```python
def test_returns_organized_markdown(self, client):
    response = client.post('/api/process-grocery-list', data={
        'file': (io.BytesIO(b'milk\nrice'), 'list.txt'),
        'output_format': 'aisle',
    })
    assert response.status_code == 200
```

This layering works because `grocery_organizer/` never imports Flask, and
all network access is funneled through one class — each layer is testable
at its own boundary.

## 3.5 Writing a new test

The habits this codebase follows:

1. **Pure logic** (parser, formatter, scoring) → plain function tests,
   parametrized when there are multiple cases.
2. **Route behavior** → add to `test_grocery_routes.py`; the `client`
   fixture already isolates you from the network.
3. **Fixing a bug?** Write the failing case first, watch it fail, then fix —
   the test is now permanent protection against regression.
4. Name tests as sentences: `test_falls_back_to_original_when_everything_filtered`
   reads as documentation when it fails.

## TODOs to get this working

- [ ] **Install pytest** — `pip install pytest` (venv active)
- [ ] **Run the suite** — `PYTHONPATH=. python -m pytest grocery_organizer/tests`
      and confirm everything passes (no `.env` or network needed)
- [ ] **Try a mutation** — flip a score bonus in `api.py`, rerun, and watch
      `test_word_matching.py` catch it; revert
- [ ] **Adopt the rhythm** — run the suite before every commit that touches
      `grocery_organizer/` or the blueprints

---

Next: [Chapter 4 — React Frontend](04-react-frontend.md)

# Chapter 12: The Full Codebase

A map of every directory and how a request actually flows through the system.

## 12.1 The annotated tree

```
aislefinder/
│
├── src/                          ── REACT FRONTEND (chapters 4–6)
│   ├── index.js                     CRA entry — mounts <AisleFinder />
│   ├── AisleFinder.jsx              Shell: screen/sheet state, theme CSS vars, toasts
│   ├── listsStore.js                useLists() — data model + background sync (ch. 11)
│   ├── auth.js                      useAuth() — Cognito sign-in (chapter 10)
│   ├── api.js                       All fetch calls to the backend
│   ├── storage.js                   localStorage + Capacitor Preferences mirror
│   ├── listUtils.js                 Parse/build the markdown list format
│   ├── AisleFinder.test.js          Jest: app rendering + data migration (ch. 5)
│   ├── listUtils.test.js            Jest: pure markdown-parsing tests
│   ├── screens/
│   │   ├── CurrentListScreen.jsx    Home: quick-add, items, frequent suggestions
│   │   ├── MyListsScreen.jsx        Switch / create / delete / merge lists
│   │   ├── HistoryScreen.jsx        Completed trips grouped by month
│   │   └── ShopScreen.jsx           Aisle groups, drag-drop, check-off, confetti
│   └── components/
│       ├── TopBar.jsx               Sticky header + nav buttons
│       ├── Sheet.jsx                Bottom-sheet modal wrapper
│       ├── AccountSheet.jsx         Sign in / sign up / confirm code
│       ├── ShareSheet.jsx           Create + join share codes
│       ├── StoreSheet.jsx           ZIP search → pick a store
│       └── Logo.jsx                 The green shelf-"A" monogram (SVG)
│
├── public/                       ── CRA static assets (index.html shell, logo.svg)
│
├── api_server.py                 ── FLASK ENTRY, local dev (chapter 1)
├── api/index.py                  ── FLASK ENTRY, Vercel serverless (chapter 7)
├── grocery_routes.py             ── Blueprint: product/aisle/store endpoints
├── lists_backend.py              ── Blueprint: Cognito auth + DynamoDB lists (ch. 10)
│
├── grocery_organizer/            ── PYTHON CORE (framework-free; no Flask imports)
│   ├── main.py                      CLI entry point (predates the web app)
│   ├── tests/                       pytest suite (chapter 3)
│   └── src/
│       ├── core/
│       │   ├── processor.py         GroceryListProcessor — the orchestrator
│       │   └── models.py            FullProduct dataclass (name, match, category, aisle)
│       ├── input_parsing/
│       │   └── input_parser.py      Text → item list (newlines, commas, bullets)
│       ├── store_api/
│       │   ├── kroger.py            KrogerAPI: OAuth, product search + scoring (ch. 2)
│       │   └── search_terms.py      Search-term cleanup (quantities, filler words)
│       └── output_formatting/
│           └── output_formatter.py  Group + sort + render markdown
│
├── ios/                          ── Capacitor Xcode project (chapter 8)
├── android/                      ── Capacitor Gradle project (chapter 9)
├── capacitor.config.json         ── appId, appName, webDir
│
├── infra/
│   ├── setup-aws.sh                 Idempotent Cognito + DynamoDB creation (ch. 10)
│   └── README.md                    AWS wiring notes
│
├── vercel.json                   ── Build config + /api rewrites (chapter 7)
├── package.json                  ── npm deps + build scripts
├── requirements.txt              ── Python deps
├── .env                          ── Secrets (git-ignored; see .env.example)
│
├── docs/
│   ├── design-rules.html            Design tokens: colors, spacing, motion (ch. 6)
│   └── dev-guide/                   ← you are here
│
├── mockups/                      ── Design explorations
├── api-response-viewer.html      ── Local debug UI for raw Kroger responses (ch. 2)
├── CLAUDE.md                     ── Codebase notes for AI-assisted development
├── DEPLOYMENT.md                 ── Deployment quick-reference
└── README.md                     ── Project overview
```

## 12.2 The three-layer backend

The Python side is deliberately layered so each piece is testable alone:

```
entry points        api_server.py (local)      api/index.py (Vercel)
                            \                     /
routes (blueprints)   grocery_routes.py    lists_backend.py
                            |                     |
domain logic          grocery_organizer/src/   boto3 → DynamoDB/Cognito
```

- **Entry points** contain no route logic — only app creation, CORS, and
  blueprint registration. This is the "two servers can't drift" rule: if you
  add an endpoint, it goes in a blueprint, never in an entry point.
- **`grocery_organizer/src/`** never imports Flask. It's a plain Python
  library, which is why the CLI (`main.py`) and the pytest suite can drive
  it directly.

## 12.3 Life of a request: "organize my list"

1. **ShopScreen** calls `processGroceryList()` in `src/api.js` → `POST
   /api/process-grocery-list` with the items and the chosen store's ID.
2. `grocery_routes.py` builds a `GroceryListProcessor` and calls
   `process_list()`.
3. **InputParser** normalizes the text into item strings.
4. The processor creates a **KrogerAPI** for the store, pre-fetches the
   OAuth token, and fans lookups out **in parallel** (ThreadPoolExecutor);
   each returns a `FullProduct(input_name, found_product, category,
   aisle_number)`. A failed lookup becomes a "Not Found" entry instead of
   failing the whole list.
5. **OutputFormatter** groups by aisle (falling back to category), sorts
   sections in a food-safe shopping order (produce first, frozen/dairy last),
   and renders markdown: `## AISLE 3\n- bread`.
6. The frontend's `listUtils.js` parses that markdown back into groups for
   ShopScreen to render as draggable, checkable sections.

## 12.4 Life of a list: where data lives

```
user edit ──► useLists() state ──► localStorage (always, instantly)
                                      │
                          (native)    ├──► Capacitor Preferences mirror
                                      │      (survives WebView eviction)
                          (signed in) └──► dirty set ──► debounced PUT /api/lists/{id}
                                                              │
                                                          DynamoDB
                                                              ▲
                              pull every 15s / on reconnect ──┘
```

Guest mode is the baseline; everything below the first line is progressive
enhancement that turns on only when configured (chapters 8–10). Chapter 11
walks this diagram in code.

## 12.5 Running everything

```bash
# Backend (venv active, .env in place)
python api_server.py                                   # → localhost:8000

# Frontend
npm start                                              # → localhost:3000

# CLI (no web stack needed)
PYTHONPATH=. python grocery_organizer/main.py \
  --file=grocery_organizer/list.txt --output_format=aisle

# Tests
PYTHONPATH=. python -m pytest grocery_organizer/tests  # Python (chapter 3)
CI=true npm test                                       # JavaScript (chapter 5)

# Mobile (after web changes)
npm run ios:build && npm run ios:open
npm run android:build && npm run android:open
```

## 12.6 Conventions to know before contributing

- **Route logic lives in blueprints**, never in `api_server.py` /
  `api/index.py`.
- **Kroger is the only store chain**, used directly via `KrogerAPI` — the
  multi-chain abstraction was deliberately removed; don't reintroduce a
  chain parameter without a real second chain.
- **The backend speaks markdown** (`## Section\n- item`); the frontend owns
  presentation.
- **Colors only via `--af-*` CSS variables** (green palette + amber accent,
  dark mode via `prefers-color-scheme`); **Font Awesome icons, never
  emojis**; font set once on the shell. Chapter 6 and
  `docs/design-rules.html` are the law here.
- **Secrets only via environment variables** — nothing sensitive is ever
  committed; every credential in this guide flows through `.env` locally and
  the Vercel dashboard in production.
- **Guest mode must keep working** — every cloud feature degrades gracefully
  when its env vars are absent.

---

Next: [Chapter 13 — Security & App Hardening](13-security-hardening.md)

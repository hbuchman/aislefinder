# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AisleFinder organizes grocery lists by store aisle or category using the Kroger API, so shopping trips follow an efficient path through the store. It ships as a React web app (also wrapped as iOS/Android apps via Capacitor), a Flask API backend, and a small Python CLI.

## Architecture

### Python backend (`grocery_organizer/` + root-level Flask files)

Modular pipeline, orchestrated by **GroceryListProcessor** (`grocery_organizer/src/core/processor.py`):

1. **InputParser** (`src/input_parsing/`) — parses grocery-list text (file or raw string; one item per line or comma-separated; strips bullets/checkboxes/numbering)
2. **KrogerAPI** (`src/store_api/kroger.py`) — OAuth token handling, product search with fuzzy word matching/scoring, store search by zip. Search-term cleanup (quantities/filler words) lives in `search_terms.py`
3. **FullProduct** (`src/core/models.py`) — dataclass with input name, matched product, category, and aisle number (-1 = unknown)
4. **OutputFormatter** (`src/output_formatting/`) — renders markdown (`## Section\n- item`) grouped by aisle or category, sorted in a food-safe shopping order (fresh first, frozen/dairy last)

Item lookups run in parallel (ThreadPoolExecutor); a failed lookup becomes a "Not Found" entry instead of failing the list.

### Flask servers — shared blueprints, two entry points

- **`grocery_routes.py`** (repo root) — blueprint with the grocery endpoints (`/api/process-grocery-list`, `/api/find-stores`, `/api/find-item-aisle`, `/api/item-details`, `/api/health`)
- **`lists_backend.py`** (repo root) — blueprint for list sync/sharing (DynamoDB + Cognito); returns 503 when unconfigured so the frontend stays local-only
- **`api_server.py`** — local/Railway server; registers both blueprints and adds local-only debug routes (`/api/debug-kroger`, `/debug`, `/health`)
- **`api/index.py`** — Vercel serverless entry point; registers the same blueprints

Route logic must live in the blueprints, never in the entry points, so the two servers cannot drift.

### React frontend (`src/`)

- `AisleFinder.jsx` — shell: screen routing, theme CSS variables, toasts
- `screens/` — CurrentList (home), MyLists, History, Shop
- `components/` — TopBar, bottom sheets (Account/Share/Store), Logo
- `listsStore.js` — lists data model + server sync hook; `storage.js` — localStorage with a durable Capacitor Preferences mirror on native
- `api.js` — backend fetch helpers; `auth.js` — Cognito auth; `listUtils.js` — markdown list helpers
- Backend returns markdown (`## Header\n- item`); the frontend parses and reformats it for display/copy

## Running

```bash
# Frontend (`.env.development` points REACT_APP_API_URL at localhost:8000)
npm start

# Backend (reads .env; see .env.example)
python api_server.py

# CLI
PYTHONPATH=. python grocery_organizer/main.py --file=grocery_organizer/list.txt --output_format=aisle
```

## Tests

```bash
# Python (pytest; run from repo root)
PYTHONPATH=. python -m pytest grocery_organizer/tests

# JavaScript (Jest via react-scripts)
CI=true npm test
```

Python tests cover input parsing, output formatting, search-term cleanup, Kroger word matching/scoring, and the Flask routes (with a stubbed Kroger client). JS tests cover `listUtils` and app rendering/migration.

## Configuration

All credentials come from environment variables (never commit secrets):

- `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` — required for Kroger lookups (Kroger's API terms forbid embedding either in the public repo)
- `AISLEFINDER_TABLE`, Cognito + AWS vars — list sync (see `lists_backend.py` docstring and `infra/`)
- Frontend: `REACT_APP_API_URL`, `REACT_APP_COGNITO_USER_POOL_ID`, `REACT_APP_COGNITO_CLIENT_ID`

The default store is Kroger `01400943` ("4500S Smiths"), defined in `grocery_routes.py`.

## Development Notes

- After web changes that should ship to mobile: `npm run ios:build` / `npm run android:build` (Capacitor sync)
- UI rules: Font Awesome icons only (no emojis), `fa-cog` not `fa-gear`; all colors via `--af-*` CSS variables (green-only palette + amber accent); font set once on the shell — see `docs/design-rules.html`
- The legacy `aislefinder.py` script opens browser tabs for manual searching (not part of the main workflow)

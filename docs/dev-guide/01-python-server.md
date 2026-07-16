# Chapter 1: Python Server

The backend of Aisle Finder is a **Flask** server written in Python. Its job:
take a raw grocery list, look up each item against Kroger's product API, and
return the list reorganized by aisle. When accounts are configured
(chapter 10), it also stores and shares lists.

## 1.1 Basic Python setup

Python is an interpreted language — you don't compile it, you just run `.py`
files with an interpreter. macOS ships with a system Python, but you should
never install packages into it; use your own install (Homebrew is easiest):

```bash
# Run this
brew install python3
python3 --version   # anything 3.10+ is fine
```

Two commands to know:

- `python3 some_file.py` — run a script
- `pip3 install some_package` — install a library (but see venvs below first!)

Python finds importable code via `sys.path`. Aisle Finder's server adds the
repo root to that path at startup so `grocery_organizer/...` imports work
(`api_server.py:20-21`):

```python
project_root = Path(__file__).parent
sys.path.append(str(project_root))
```

## 1.2 Virtual environments

If you `pip install` globally, every project on your machine shares one pile
of packages — project A needs `Flask 3.0`, project B needs `Flask 2.x`, and
one of them breaks. A **virtual environment (venv)** is a private,
per-project copy of Python + packages that lives in a folder inside the repo.

```bash
# Run this — from the repo root
python3 -m venv venv          # create the venv (a ./venv folder appears)
source venv/bin/activate      # activate it for this terminal session
```

While a venv is active your prompt shows `(venv)`, and `python` / `pip`
point at the private copy. Install Aisle Finder's dependencies into it:

```bash
# Run this — with (venv) active
pip install -r requirements.txt
```

`requirements.txt` is the standard "shopping list" of dependencies:

```
Flask==3.0.0          # the web framework
Flask-CORS==4.0.0     # lets the React dev server (a different port) call the API
requests==2.31.0      # HTTP client used to call the Kroger API
python-dotenv==1.0.0  # loads .env files into environment variables
boto3>=1.34.0         # AWS SDK (DynamoDB + Cognito, chapter 10)
```

To leave the venv later: `deactivate`. To come back: `source venv/bin/activate`.
The `venv/` folder is git-ignored — every developer creates their own.

## 1.3 Secrets and the `.env` file

The server reads credentials from **environment variables**, loaded from a
`.env` file at the repo root by `python-dotenv` (`api_server.py:17`):

```python
from dotenv import load_dotenv
load_dotenv()
```

The one variable required for the core feature is the Kroger API secret
(`grocery_organizer/src/store_api/kroger.py`):

```python
client_secret = os.getenv('KROGER_CLIENT_SECRET')
if not client_secret:
    raise ValueError("KROGER_CLIENT_SECRET environment variable is required")
```

Create `.env` in the repo root — `cp .env.example .env` gives you the
template. It's git-ignored; never commit it:

```
KROGER_CLIENT_SECRET=your_secret_here
```

The matching Kroger client ID is hardcoded in `kroger.py` as
`aislefinder5000-bbcct110`. Chapter 2 covers where both come from.

## 1.4 Starting the API server

```bash
# Run this — venv active, .env in place
python api_server.py
```

You should see Flask start on port 8000. Verify it's alive:

```bash
# Run this — in a second terminal
curl http://localhost:8000/health
# → {"status": "healthy"}
```

Then try the real thing — organize a list:

```bash
# Run this
printf "milk\neggs\nbananas\nbread" > /tmp/list.txt
curl -X POST http://localhost:8000/api/process-grocery-list \
  -F "file=@/tmp/list.txt" \
  -F "output_format=aisle"
```

You'll get back markdown grouped by aisle (`## AISLE 3\n- bread\n...`).

## 1.5 How the server is organized

`api_server.py` itself is tiny — the route logic lives in shared
**blueprints** (Flask's way of splitting routes across files) so the local
server and the Vercel serverless copy (`api/index.py`, chapter 7) can't
drift apart:

```python
from grocery_routes import grocery_bp     # product lookup endpoints
from lists_backend import lists_bp        # account-backed list sync (ch. 10)

app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'https://aislefinder3000.com',
                   'capacitor://localhost', 'http://localhost', 'https://localhost'])
app.register_blueprint(grocery_bp)
app.register_blueprint(lists_bp)
```

Note the CORS list: browsers block cross-origin requests by default, and in
local dev React runs on port 3000 while Flask runs on 8000 — different
origins. `Flask-CORS` explicitly allowlists the React dev server, the
production domain, and the Capacitor app origins (chapters 8–9).

The endpoints in `grocery_routes.py`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/process-grocery-list` | POST | Upload a list file → aisle-organized markdown |
| `/api/find-stores` | POST | ZIP code → nearby Kroger stores |
| `/api/find-item-aisle` | POST | One item → its aisle at a given store |
| `/api/health` | GET | Health check |

A request flows: route → `GroceryListProcessor` (`grocery_organizer/src/core/processor.py`)
→ `KrogerAPI` product lookups in parallel → `OutputFormatter` renders
markdown. The Kroger client is the interesting part — that's chapter 2.

## TODOs to get this working

- [ ] **Install Python 3.10+** — `brew install python3`
- [ ] **Create + activate a venv** — `python3 -m venv venv && source venv/bin/activate`
- [ ] **Install deps** — `pip install -r requirements.txt`
- [ ] **Register a Kroger developer account** at https://developer.kroger.com,
      create an app with the *Products* and *Locations* APIs, and copy its
      client secret (details in chapter 2)
- [ ] **Create `.env`** in the repo root with `KROGER_CLIENT_SECRET=...`
- [ ] **Start the server** — `python api_server.py`, then `curl localhost:8000/health`

---

Next: [Chapter 2 — The Kroger API](02-kroger-api.md)

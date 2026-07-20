# Aisle Finder

A grocery list organizer that sorts your shopping list by store aisle or category using the Kroger API. Enter your items, pick a nearby Kroger-family store, and get an organized list so you can shop efficiently.

Live at [aislefinder3000.com](https://aislefinder3000.com)

## How It Works

1. Find your store by entering a ZIP code (supports Kroger, Pick 'N Save, Harris Teeter, Ralphs, King Soopers, Smith's, Fry's, QFC, and more)
2. Type or paste your grocery items
3. Organize by **aisle** (requires a selected store) or by **category**
4. Use **Shop Mode** to check off items as you go

## Architecture

- **Frontend** -- React (Create React App), single-component UI in `src/AisleFinder.jsx`
- **Backend** -- Flask API in `api/index.py` (Vercel serverless) and `api_server.py` (local dev)
- **Grocery pipeline** -- Python modules under `grocery_organizer/` that parse input, call the Kroger API, and format output

## Local Development

### Prerequisites

- Node.js (v16+)
- Python 3.9+

### 1. Clone the repo

```bash
git clone https://github.com/Soapsuds/aislefinder.git
cd aislefinder
```

### 2. Set up environment variables

Copy the example env file and fill in your Kroger client secret:

```bash
cp .env.example .env
```

Edit `.env` and set `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` to your Kroger API credentials. You can request them via written request to the maintainer.

The `.env.development` file is pre-configured to point the React frontend at `http://localhost:8000`.

### 3. Install dependencies

```bash
# Frontend
npm install

# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Run the app locally

Activate the virtual environment, then run the backend and frontend in separate terminals:

```bash
# Terminal 1 -- Flask API server
source venv/bin/activate
python api_server.py
```

```bash
# Terminal 2 -- React dev server
npm start
```

The React app runs on `http://localhost:3000` and proxies API requests to the Flask server on `http://localhost:8000`.

### CLI usage

You can also run the grocery pipeline directly from the command line:

```bash
export PYTHONPATH=$PYTHONPATH:$(pwd)
python grocery_organizer/main.py --file=./grocery_organizer/list.txt --output_format=aisle --store="4500S Smiths"
```

Options:
- `--file` -- Path to a text file with one grocery item per line
- `--output_format` -- `aisle` or `category`
- `--store` -- Store name (default: `4500S Smiths`)

## Deployment

The app is deployed on **Vercel**.

- **Frontend** -- Built with `npm run build` (Create React App) and served as static files. Vercel auto-detects the CRA framework.
- **Backend** -- The Flask API in `api/index.py` runs as a Vercel serverless function using the `@vercel/python` runtime. All `/api/*` routes are rewritten to this function. All other routes fall through to `index.html` for client-side routing.
- **Configuration** -- `vercel.json` defines the build command, output directory, serverless function config, and URL rewrites.
- **Environment variables** -- `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` must be set in the Vercel project settings. `REACT_APP_API_URL` is set in `.env.production` to point at the production API domain.
- **Domain** -- Production is served at `aislefinder3000.com`.

## Contributing

Bug reports and feature requests are welcome at [github.com/Soapsuds/aislefinder/issues](https://github.com/Soapsuds/aislefinder/issues).

# Aisle Finder Deployment Guide

Production runs entirely on **Vercel**: the React app is served as static
files and the Flask API runs as a serverless function (`api/index.py`),
both behind https://aislefinder3000.com. There is no separate backend
host. For the full walkthrough (DNS, domains, how `vercel.json` wires it
up), see [dev-guide chapter 7](docs/dev-guide/07-web-deployment.md).

## Environment variables (Vercel dashboard)

| Variable | Purpose |
|----------|---------|
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | Kroger API auth — lookups fail without both |
| `REACT_APP_COGNITO_USER_POOL_ID`, `REACT_APP_COGNITO_CLIENT_ID` | Login UI (baked in at build time) |
| `AISLEFINDER_TABLE`, `COGNITO_REGION` | List sync (DynamoDB) |
| `AF_AWS_ACCESS_KEY_ID`, `AF_AWS_SECRET_ACCESS_KEY` | AWS credentials (`AWS_*` names are reserved on Vercel) |

`REACT_APP_API_URL` is deliberately **unset** in production: the frontend
and API share one origin, so the app uses relative `/api/...` URLs.
The mobile builds set it explicitly (see `ios:build` / `android:build`
in `package.json`).

Kroger credentials come from the
[Kroger Developer Portal](https://developer.kroger.com/) — register an
application with Products and Locations API access. Per Kroger's API
terms, neither the client ID nor the secret may appear in the repo.

## Deploying

Pushes to `master` deploy to production automatically; other branches get
preview URLs. After changing env vars, redeploy (build-time `REACT_APP_*`
values are baked in).

Verify a deploy:

```bash
curl https://aislefinder3000.com/api/health
# → {"status": "healthy"}
```

## Local development

1. Copy `.env.example` to `.env` and fill in real values
2. `source venv/bin/activate && python api_server.py`
3. `npm start` for the frontend

`api_server.py` is the local dev server only — it is not deployed
anywhere. Its debug routes (`/debug`, `/api/debug-kroger`) exist only
when `FLASK_ENV=development`.

# Chapter 7: Web Deployment

Locally you run two processes (Flask + CRA dev server). In production, one
platform serves both: **Vercel** hosts the built React app as static files
*and* runs the Python API as serverless functions, all behind one domain —
https://aislefinder3000.com.

## 7.1 What Vercel is

Vercel is a hosting platform built around a simple loop:

1. You connect a Git repository.
2. Every `git push` triggers a **build** (here: `npm run build`).
3. The output is deployed globally to a CDN — static files are served from
   servers near the user.
4. Anything under `api/` becomes a **serverless function**: code that isn't
   running anywhere until a request arrives, at which point Vercel spins it
   up, handles the request, and tears it down. You pay per invocation and
   never manage a server.

Pushes to `master` deploy to production; pushes to any other branch get their
own **preview URL** — a throwaway deployment for testing before merge.

## 7.2 How this repo is wired: `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "framework": "create-react-app",
  "functions": {
    "api/index.py": { "runtime": "@vercel/python@4.5.0" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Reading it top to bottom:

- **Build** — Vercel runs `npm run build` and serves the `build/` folder as
  static files (the React app).
- **Functions** — `api/index.py` runs on Vercel's Python runtime. It's a
  thin mirror of `api_server.py`: both register the same shared blueprints
  (`grocery_routes.py`, `lists_backend.py`), so local and production route
  logic literally cannot drift. If you edit one entry point, check the other.
- **Rewrites** — `/api/*` requests are routed to the Python function;
  *everything else* falls through to `index.html` so the React app loads no
  matter the URL (client-side routing).

The upshot: frontend and API share one origin in production, so there's no
CORS complexity and `REACT_APP_API_URL` can simply be the site's own domain.

## 7.3 Connecting the repo to Vercel

```bash
# Option A: the dashboard (recommended first time)
# 1. Sign up at https://vercel.com (log in with GitHub)
# 2. "Add New… → Project" → import the aislefinder repo
# 3. Vercel auto-detects CRA; vercel.json supplies the rest → Deploy

# Option B: the CLI
# Run this
npm i -g vercel
vercel          # link the project + create a preview deployment
vercel --prod   # deploy to production
```

Then set the **environment variables** in the Vercel dashboard
(*Project → Settings → Environment Variables*). The build and the Python
function each read different ones:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `KROGER_CLIENT_SECRET` | Python function | Kroger API auth (chapter 2) |
| `REACT_APP_COGNITO_USER_POOL_ID`, `REACT_APP_COGNITO_CLIENT_ID` | React build | Login UI (chapter 10) |
| `AISLEFINDER_TABLE`, `COGNITO_REGION` | Python function | List sync (chapter 10) |
| `AF_AWS_ACCESS_KEY_ID`, `AF_AWS_SECRET_ACCESS_KEY` | Python function | AWS credentials — Vercel reserves the `AWS_*` names, hence the `AF_` prefix |

After changing env vars, **redeploy** — `REACT_APP_*` values are baked in at
build time.

## 7.4 The domain manager

A deployment gets a free `*.vercel.app` URL, but a real product wants a real
domain. Three pieces are involved:

- **Registrar** — where you buy/renew the domain name (e.g. Namecheap,
  Cloudflare, or Vercel itself). This is a yearly fee (~$10–15).
- **DNS** — the phone book mapping `aislefinder3000.com` → server addresses.
  Whoever hosts your DNS records controls where the name points.
- **Vercel's domain manager** (*Project → Settings → Domains*) — where you
  attach the domain to the project. Vercel provisions the HTTPS certificate
  automatically once DNS points at it.

## 7.5 How to connect the domain

1. In Vercel: *Project → Settings → Domains → Add* → enter
   `aislefinder3000.com`. Vercel shows you exactly which DNS records it needs.
2. At your registrar, either:
   - **Point the nameservers at Vercel** (`ns1.vercel-dns.com`,
     `ns2.vercel-dns.com`) — Vercel then manages all DNS for you, or
   - **Add individual records**: an `A` record for the apex
     (`@ → 76.76.21.21`) and a `CNAME` for `www → cname.vercel-dns.com`.
3. Wait for DNS propagation (minutes to a few hours). Vercel's Domains page
   flips to a green checkmark and issues the TLS certificate.
4. Verify:

```bash
# Run this
curl https://aislefinder3000.com/api/health
# → {"status": "healthy"}
```

Note the domain also appears in two places in the code: the CORS allowlist in
`api_server.py:29` and the `ios:build`/`android:build` scripts in
`package.json` (the mobile apps call the production API). If you ever change
domains, update both.

## TODOs to get this working

- [ ] **Create a Vercel account** at https://vercel.com (sign in with GitHub)
- [ ] **Push the repo to GitHub** if it isn't already, then **import it** as a
      Vercel project (Add New → Project)
- [ ] **Type the env vars into Vercel** — at minimum `KROGER_CLIENT_SECRET`;
      the AWS ones come in chapter 10
- [ ] **Register the domain** (e.g. `aislefinder3000.com`) at a registrar
- [ ] **Add the domain in Vercel** (Settings → Domains) and **enter the DNS
      records / nameservers shown** at your registrar
- [ ] **Redeploy and verify** — `curl https://<your-domain>/api/health`

---

Next: [Chapter 8 — Adding iOS Support](08-ios-support.md)

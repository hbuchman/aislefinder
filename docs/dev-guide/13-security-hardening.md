# Chapter 13: Security & App Hardening

A hobby app with real users still has real things to protect: your API
credentials, your API quota, and your users' data. This chapter walks
through the hardening that's actually in the codebase — each piece exists
because of a concrete way the app could be abused, so the threat is
explained alongside the defense.

## 13.1 The threat model

For an app this size, the realistic risks aren't nation-states — they're:

1. **Credential leakage** — the Kroger client ID/secret or AWS keys ending
   up somewhere public. The repo *is* public, so anything committed is
   published.
2. **Quota abuse** — the grocery endpoints are unauthenticated by design
   (guest mode is a feature), and every request spends Kroger API quota:
   10,000 Products calls and 1,600 Locations calls per day. One hostile
   script can lock every real user out until midnight.
3. **Data exposure** — synced lists live in DynamoDB behind share codes
   and Cognito accounts; bugs in authorization logic leak other people's
   lists.
4. **Information leakage** — error messages and debug tooling revealing
   internals that make the other three easier.

Everything below maps back to one of these.

## 13.2 Credentials live only in the environment

Both halves of the Kroger OAuth pair come from env vars — the client ID is
*not* hardcoded, because Kroger's API terms explicitly class client IDs as
developer credentials that "may not be embedded in open source projects":

```python
# kroger.py — get_auth_token()
client_id = os.getenv('KROGER_CLIENT_ID')
client_secret = os.getenv('KROGER_CLIENT_SECRET')
if not client_id or not client_secret:
    raise ValueError("KROGER_CLIENT_ID and KROGER_CLIENT_SECRET environment variables are required")
```

Locally they sit in `.env` (git-ignored); in production they're typed into
the Vercel dashboard (chapter 7). The same pattern covers the AWS
credentials (chapter 10).

Two hard-won lessons about git and secrets:

- **Deleting a committed secret doesn't unpublish it.** A file removed in
  a later commit is still one `git show` away in history. If a secret ever
  lands in a public repo, treat it as burned: rotate it at the provider,
  *then* worry about scrubbing history.
- **Rotation beats scrubbing.** Rewriting public history (`git
  filter-repo` + force push) breaks clones and doesn't recall caches or
  forks. A deactivated credential is worthless no matter who has it.

## 13.3 Bounding what one request can cost

`/api/process-grocery-list` fans out 1–2 Kroger calls *per list item*, in
parallel. Without limits, a single upload with ten thousand lines drains
the day's quota. So the route bounds the work before doing any of it:

```python
# grocery_routes.py
MAX_ITEMS_PER_REQUEST = 100     # a big real-world list is ~50-60 items
MAX_UPLOAD_BYTES = 64 * 1024

raw = file.read()
if len(raw) > MAX_UPLOAD_BYTES:
    return jsonify({'error': 'List file is too large'}), 413
item_count = len(InputParser.parse_text(text))
if item_count > MAX_ITEMS_PER_REQUEST:
    return jsonify({'error': f'Lists are limited to {MAX_ITEMS_PER_REQUEST} items (got {item_count})'}), 400
```

The principle: **validate cost, not just correctness**. The upload was
always "valid" — the problem was what it would cost to serve. The same
idea appears in `lists_backend.py` (`MAX_LIST_BYTES` keeps synced lists
under DynamoDB's 400 KB item limit) and as an app-wide backstop in
`api_server.py` (`MAX_CONTENT_LENGTH`). Note the ordering, too: the checks
run *before* the Kroger calls, so rejected requests cost nothing.

The caps live in the blueprint, not in `GroceryListProcessor` — the CLI
(you, locally) stays uncapped while both servers get the protection.

## 13.4 Rate limiting: `rate_limit.py`

Per-request caps don't stop someone looping requests, so every
Kroger-backed endpoint shares a per-IP sliding window (30 requests/minute)
via the `@rate_limited` decorator. The module is small enough to read in
one sitting, and three of its details teach general lessons:

**Trust the proxy, not the client.** The client's address comes from the
`X-Forwarded-For` header, but clients can *send* that header themselves.
Proxies append the real address to the end, so only the last entry is
trustworthy:

```python
# rate_limit.py — _client_ip()
forwarded = request.headers.get('X-Forwarded-For', '')
last = forwarded.rsplit(',', 1)[-1].strip()
return last or request.remote_addr or 'unknown'
```

Taking the *first* entry — the intuitive choice — would let an attacker
rotate through unlimited fake addresses and never hit the limit.

**Defenses need their own defenses.** The limiter tracks a deque of
timestamps per IP. An attacker rotating addresses would grow that table
forever — a memory leak *caused by* the rate limiter. Past a threshold,
expired buckets get swept.

**Know your limits' limits.** The state is in-memory and per-process:
full protection on a single-process server, but on Vercel each serverless
instance keeps its own window, so the effective limit is (30 × instances).
That's documented in the module docstring rather than hidden — a partial
defense you understand beats a perfect one you assumed.

## 13.5 Shrinking the attack surface

**Debug routes are gated.** `api_server.py` has `/api/debug-kroger` and
`/debug` — unauthenticated routes that make real Kroger calls and dump raw
responses. Handy locally; a quota-burning gift on the public internet if this file
is ever deployed — "it's in the local server file" is *not* the same as
"it's local-only". The routes are only registered when
`FLASK_ENV=development`, and
`test_api_server.py` pins that behavior so it can't silently regress.

**CORS is an allowlist everywhere.** Both entry points share one origin
list (`cors_config.py`): the CRA dev server, the production domain, and
the Capacitor origins the mobile wrappers present. Before this, the Vercel
entry point used `CORS(app)` — any website on the internet could call the
API (and spend the quota) from its visitors' browsers. Same shared-module
trick as the blueprints: one definition, so the two servers can't drift.

## 13.6 Errors that don't overshare

Exception text can contain file paths, library internals, even request
URLs. Clients get a generic message; the log gets everything:

```python
# grocery_routes.py
def _server_error(context, exc):
    # Exception details stay in the server log; clients get a generic message
    print(f"Error {context}: {exc}")
    traceback.print_exc()
    return jsonify({'error': f'Server error while {context}'}), 500
```

Related: malformed input should be a 400, not a 500. The JSON routes parse
with `get_json(silent=True)` and validate field types (`_json_body()` /
`_clean_item()`), so garbage bodies get clean rejections instead of
tracebacks.

## 13.7 Multi-user boundaries

The list-sync endpoints (chapter 10) enforce three rules worth naming:

- **Membership is checked on every operation** — read, write, delete,
  share. There's no "the client wouldn't send that" — the client is
  whatever `curl` says it is.
- **Server-owned fields are stripped from client input.** `put_list`
  discards any `members`/`shareCode` the client sends; otherwise a member
  could promote themselves or forge a share code.
- **Share codes resist guessing.** Six characters from a 31-character
  alphabet (~890M combinations), generated with `random.SystemRandom` —
  the cryptographically seeded generator, not the predictable default
  `random` — and `/api/lists/join` sits behind the rate limiter, applied
  *before* auth so guessing attempts can't even spend Cognito lookups.
  At 30 attempts/minute, the code space is out of reach.

Passwords never touch this codebase at all — Cognito owns sign-up,
verification, and reset (chapter 10). The best password-handling code is
none.

## 13.8 Privacy and API compliance

Security also means keeping promises:

- **Privacy policy** — `public/privacy.html`, linked from the account
  sheet. Kroger's API terms require one for any client collecting user
  info, and it must stay accurate: if the app starts collecting something
  new, the page changes in the same PR.
- **Kroger's terms, distilled**: don't embed credentials in the repo,
  don't store API content permanently, respect the rate limits, display
  required attributions, don't imply Kroger endorses the app. Product
  images are hotlinked from Kroger's CDN rather than stored partly for
  this reason.

## TODOs to get this working

- [ ] **Set `KROGER_CLIENT_ID`** alongside `KROGER_CLIENT_SECRET` in the
      Vercel dashboard — lookups fail without both
- [ ] **Verify `FLASK_ENV` is not `development`** on any deployed server,
      so the debug routes and Flask debug mode stay off
- [ ] **Deactivate retired Kroger clients** in the developer portal —
      any credential that ever appeared in a public commit is burned
- [ ] **Read `public/privacy.html`** and confirm it matches what the app
      actually collects
- [ ] **Occasionally run `npm audit` / `pip list --outdated`** — CRA's
      dev-dependency noise makes this low-signal, but real issues in
      runtime deps do surface this way

---

Back to the [guide index](README.md)

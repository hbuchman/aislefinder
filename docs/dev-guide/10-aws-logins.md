# Chapter 10: Adding AWS Logins

Everything so far works in **guest mode** — lists live in localStorage on one
device. Accounts add cross-device sync and list sharing, built on two AWS
services:

- **Amazon Cognito** — a managed user directory: sign-up, email verification,
  password auth, and token issuance. You never store passwords yourself.
- **DynamoDB** — a serverless key-value database holding lists, memberships,
  and share codes. No server to run; you pay per request.

A deliberate design property: if the AWS env vars are absent, `auth.js`
exports `authConfigured = false`, the list endpoints return 503, and the app
silently stays guest-only. Nothing breaks before setup — so this chapter is
genuinely optional.

## 10.1 One script creates everything

`infra/setup-aws.sh` is an idempotent script (safe to re-run) that creates:

1. A **Cognito user pool** `aislefinder-users` — email as username,
   email-verification codes, 8-char minimum password.
2. An **app client** `aislefinder-web` — *no client secret*, SRP auth only.
   Browser apps can't keep secrets (anyone can View Source), so the client
   uses SRP: a challenge-response protocol where the password never leaves
   the browser.
3. A **DynamoDB table** `aislefinder-lists` — on-demand billing, plus a
   `byShareCode` index so join-by-code lookups are fast.

```bash
# Run this
brew install awscli
aws configure                    # paste an IAM access key with admin-ish rights
./infra/setup-aws.sh us-east-1   # prints the four env values when done
```

## 10.2 Wiring the env vars

Add the script's output to `.env` (local) — the frontend pair is baked into
the React build, the backend pair is read by Flask at runtime:

```
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
REACT_APP_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
AISLEFINDER_TABLE=aislefinder-lists
COGNITO_REGION=us-east-1
```

Restart both `npm start` (CRA reads `REACT_APP_*` only at start) and
`python api_server.py`. Locally, boto3 uses your `aws configure` credentials
automatically.

On **Vercel**, set the same four — plus explicit AWS credentials, because
Vercel's servers aren't yours and have no AWS identity. Vercel reserves the
`AWS_*` variable names, so the code reads an `AF_`-prefixed pair:

```
AF_AWS_ACCESS_KEY_ID=...
AF_AWS_SECRET_ACCESS_KEY=...
```

Create these as a **dedicated IAM user** with a minimal policy: DynamoDB
read/write on the `aislefinder-lists` table (and its `byShareCode` index)
plus `cognito-idp:GetUser` — never reuse your admin keys in a deployment.

## 10.3 How the auth flow works

**Frontend** (`src/auth.js`) talks to Cognito directly via
`amazon-cognito-identity-js` — the Flask server is not involved in sign-in:

```javascript
export const signIn = (email, password) =>
  new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    const details = new AuthenticationDetails({ Username: email, Password: password });
    cognitoUser.authenticateUser(details, {
      onSuccess: (session) => resolve(sessionToUser(cognitoUser, session)),
      onFailure: (err) => reject(err),
    });
  });
```

Sign-up is a three-step dance you can watch in `AccountSheet.jsx`:
`signUp(email, password)` → Cognito emails a 6-digit code →
`confirmSignUp(email, code)` → `signIn(...)`.

On success Cognito issues **JWTs** (signed tokens): an ID token (who you
are — `auth.js` reads `email` and `sub`, the stable user ID, from its
payload) and an access token (proof for API calls). The SDK stores and
silently refreshes them; `getAccessToken()` in `auth.js` hands the current
one to the API layer.

**Every authenticated request** then carries the token (`src/api.js`):

```javascript
const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
```

**Backend** (`lists_backend.py`) validates the bearer token by calling
Cognito's `GetUser` API (cached ~5 min per token to avoid a round trip on
every request), extracts the user's `sub`, and only then touches DynamoDB.

## 10.4 What lands in DynamoDB

One table, two item shapes (a common single-table design):

| pk | sk | Contents |
|----|----|----------|
| `LIST#{id}` | `META` | the full list JSON + members map + `share_code` |
| `USER#{sub}` | `LIST#{id}` | membership marker: "this user can see this list" |

`GET /api/lists` queries `USER#{sub}` for memberships, then fetches each
list's `META`. Sharing generates a 6-character code (skipping ambiguous
characters like 0/O and 1/I/L) stored on the list; `POST /api/lists/join`
finds it via the `byShareCode` index and adds the joiner as a member. The
members map and share code are **server-owned** — `PUT` strips them from
client payloads so a client can't grant itself access.

When and how the frontend actually pushes and pulls — the dirty tracking,
debouncing, and conflict rules — is chapter 11.

## 10.5 Costs

Effectively free at hobby scale: Cognito's free tier covers 10,000 monthly
active users, and an on-demand DynamoDB table with a handful of users costs
pennies per month.

## TODOs to get this working

- [ ] **Create an AWS account** at https://aws.amazon.com (needs a credit
      card; this setup stays in the free tier)
- [ ] **Create an IAM user for yourself** with rights to create Cognito
      pools + DynamoDB tables, and run `aws configure` with its access key
- [ ] **Run the script** — `./infra/setup-aws.sh us-east-1`
- [ ] **Copy the four printed env values into `.env`**, restart both dev
      servers, and test: sign up in the account sheet, get the email code,
      confirm, sign in
- [ ] **For production**: create a second, minimal-permission IAM user
      (DynamoDB on `aislefinder-lists` + `cognito-idp:GetUser`), and type
      all six vars into Vercel — the four from the script plus
      `AF_AWS_ACCESS_KEY_ID` / `AF_AWS_SECRET_ACCESS_KEY` — then redeploy
- [ ] **For mobile**: the two `REACT_APP_COGNITO_*` vars must also be present
      in the environment when running `npm run ios:build` / `android:build`
      (they're baked into the JS bundle)
- [ ] **Verify sync** — sign in on two browsers, add an item in one, watch it
      appear in the other within ~15 seconds

---

Next: [Chapter 11 — Offline-First Sync](11-offline-sync.md)

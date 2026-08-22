# AWS setup for accounts, sync, and sharing

AisleFinder works fully in **guest mode** with no AWS at all — lists, history,
and shop mode live in localStorage. Signing in adds cross-device sync and list
sharing, backed by:

- **Amazon Cognito** — email/password accounts with email verification
- **DynamoDB** — one on-demand table holding lists, memberships, and share codes

## One-time setup

```bash
# 1. Install + configure the AWS CLI if you haven't
brew install awscli
aws configure   # needs an IAM identity that can create Cognito pools + DynamoDB tables

# 2. Run the setup script (idempotent; safe to re-run)
./infra/setup-aws.sh us-east-1
```

The script prints four env values when it finishes.

## Wiring the env vars

**Local dev** — add all of them to `.env` in the repo root:

```
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
REACT_APP_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
AISLEFINDER_TABLE=aislefinder-lists
COGNITO_REGION=us-east-1
```

CRA only reads `REACT_APP_*` vars at build/start time — restart `npm start`
after editing. The Flask server (`python api_server.py`) picks up the backend
vars via `load_dotenv()`. Locally, boto3 uses your `aws configure` credentials.

**Vercel (production)** — in the project settings add:

```
AISLEFINDER_TABLE=aislefinder-lists
COGNITO_REGION=us-east-1
AF_AWS_ACCESS_KEY_ID=...        # AWS_* names are reserved on Vercel,
AF_AWS_SECRET_ACCESS_KEY=...    # hence the AF_ prefix
```

Create a dedicated IAM user for these keys with a minimal policy:
DynamoDB read/write on the `aislefinder-lists` table (and its `byShareCode`
index) plus `cognito-idp:GetUser`. Also set the two `REACT_APP_COGNITO_*`
vars in Vercel so the frontend build includes them, and add them to the
`ios:build` / `android:build` environments in `package.json` when cutting
mobile builds.

## How the pieces talk

- The frontend signs in with Cognito directly (SRP via
  `amazon-cognito-identity-js`) and sends the access token as
  `Authorization: Bearer <token>` to the `/api/lists*` endpoints.
- The backend (`lists_backend.py`, registered by both `api_server.py` and
  `api/index.py`) validates the token by calling Cognito `GetUser`, then
  reads/writes DynamoDB.
- If `AISLEFINDER_TABLE` is unset, those endpoints return 503 and the app
  quietly behaves as guest/local-only — so nothing breaks before setup.

## Aisle overrides (shopper aisle/category corrections)

`lists_backend.py` also serves `/api/aisle-overrides` (PUT one correction) and
`/api/aisle-overrides/resolve` (POST, effective placement per trip item). These
reuse the **same table and IAM policy** — no schema change and **no new GSI** —
storing extra item types keyed `pk=AISLE#<storeId>#<itemKey>`:

- `sk=USER#<sub>` — one vote per shopper (their correction, synced across their
  devices and shared with the members of a shared list).
- `sk=CONSENSUS` — derived; recomputed inline on every vote (no DynamoDB
  Streams/Lambda). Once `CONSENSUS_MIN_AGREE` shoppers (default 3, in
  `lists_backend.py`) agree, it's served to everyone at that store, below any
  personal/household override.

Account deletion does **not** purge a user's vote rows (they keep feeding
consensus and carry no PII); erasing them would require a `byUser` GSI.

## Costs

Both services are effectively free at hobby scale: Cognito's free tier covers
10k monthly active users, and an on-demand DynamoDB table with a few users
costs pennies per month.

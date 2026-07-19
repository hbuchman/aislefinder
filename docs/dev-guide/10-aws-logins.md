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

---

## 10.0 AWS for absolute beginners

If you've used AWS before, skip to [10.1](#101-one-script-creates-everything).

**What is AWS?** Amazon Web Services is a collection of cloud infrastructure
services. Instead of running your own database server or authentication
system, you rent capacity from Amazon and pay for what you use. For this app
at hobby scale, the monthly cost will likely be $0 thanks to generous free
tiers.

**What is "the cloud" here?** Concretely: computers in Amazon's data centers
running software on your behalf. When a user signs up, their account gets
created in Amazon's systems, not on your laptop. This means it works even when
your laptop is off, and it scales automatically if you get more users.

**The mental model for this chapter:**

```
User's browser  ──sign-in──►  Cognito (AWS)
                              (manages passwords, tokens)

User's browser  ──save list──►  Your Flask server  ──stores──►  DynamoDB (AWS)
```

You never touch passwords directly. Cognito handles all the cryptography.
DynamoDB stores lists and syncs them across devices.

---

## 10.1 Create an AWS account

Go to **https://aws.amazon.com** and click **Create an AWS Account** in the
top right.

You'll need:
- An **email address** (this becomes your "root" account — use a real one you
  can receive email at)
- A **phone number** for identity verification (they send an SMS or call you)
- A **credit card** — AWS requires one even for free-tier usage; you won't be
  charged for what this app uses at small scale

### The sign-up steps

1. Enter your email and choose an account name (e.g. `hayley-personal` or
   `aislefinder-dev` — it's just a label).
2. Verify your email address via the code they send.
3. Choose **Personal** account type (not Business).
4. Fill in your contact information.
5. Add a credit card. AWS won't charge you for free-tier usage but needs one
   on file.
6. Verify your phone number via SMS or voice call.
7. Choose a **Support plan** — pick **Basic (Free)**. You don't need paid
   support.
8. Sign in to the AWS Console at **https://console.aws.amazon.com**.

### The AWS Console

The Console is a web dashboard where you can see and manage everything you've
created. When you first log in it looks overwhelming — there are hundreds of
services. You only need two: **Cognito** and **DynamoDB**. You can find any
service by typing its name in the search bar at the top.

### Important: the root account vs IAM users

When you first create your AWS account, you sign in as the **root user** —
an all-powerful account that can do anything, including delete everything and
rack up a huge bill. **Never use the root account for day-to-day work.** If
your root credentials are ever leaked, an attacker has unlimited access.

Instead, you create **IAM users** (Identity and Access Management) — accounts
with specific, limited permissions. This chapter has you:

1. Create an **admin IAM user** for yourself — has enough access to create
   Cognito pools and DynamoDB tables, but isn't the root account.
2. Later, create a **minimal IAM user** for your production server — only has
   the exact permissions the running app needs.

This "principle of least privilege" limits damage if a credential leaks.

---

## 10.2 Create an IAM admin user for yourself

> **Why not just use the root account?** The setup script needs to create
> Cognito and DynamoDB resources. You could use root credentials, but you'd
> be training yourself into a bad habit. An admin IAM user is nearly as
> capable and much safer to use daily.

### Steps in the AWS Console

1. In the Console search bar, type **IAM** and click the IAM service.

2. In the left sidebar, click **Users**, then click **Create user**.

3. Enter a username — something like `hayley-admin` or `aislefinder-admin`.
   Do **not** check "Provide user access to the AWS Management Console" unless
   you specifically want this IAM user to log in to the Console (usually you
   don't need that for a developer IAM user).

4. Click **Next**. On the permissions page, choose **Attach policies
   directly**, then search for and select **AdministratorAccess**. This gives
   the user full access to all AWS services — broad but fine for your personal
   admin user.

5. Click **Next**, then **Create user**.

6. Click the username you just created to open it. Go to the **Security
   credentials** tab. Under **Access keys**, click **Create access key**.

7. Choose **Command Line Interface (CLI)** as the use case, check the
   confirmation box, and click **Next**.

8. Optionally add a description tag (e.g. `dev laptop`), then click **Create
   access key**.

9. **This is your only chance to see the Secret Access Key.** Copy both
   the **Access key ID** and **Secret access key** somewhere safe (a password
   manager works well). Click **Done**.

You'll paste these into `aws configure` in the next section.

---

## 10.3 Install and configure the AWS CLI

The AWS CLI is a command-line tool that lets scripts and your terminal talk
to AWS. The setup script (`infra/setup-aws.sh`) uses it to create the Cognito
pool and DynamoDB table.

### Install

**macOS (Homebrew):**
```bash
brew install awscli
```

**macOS (without Homebrew) / other platforms:**  
Download the installer from the [AWS CLI install page](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

Verify it installed:
```bash
aws --version
# Should print something like: aws-cli/2.x.x ...
```

### Configure with your IAM credentials

```bash
aws configure
```

It asks four questions:

```
AWS Access Key ID [None]: AKIA...          ← paste your access key ID
AWS Secret Access Key [None]: abc123...    ← paste your secret access key
Default region name [None]: us-east-1     ← type this exactly
Default output format [None]: json        ← type this
```

**Region** is which Amazon data center your resources live in. `us-east-1`
(Northern Virginia) is the most common choice and has the best service
availability. Pick one and stick with it — all resources in this project
should be in the same region.

These credentials get saved in `~/.aws/credentials` on your laptop. The CLI
reads them automatically; you never pass them as command-line arguments.

### Verify it works

```bash
aws sts get-caller-identity
```

Expected output (your account ID will differ):
```json
{
    "UserId": "AIDA...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/hayley-admin"
}
```

If you get an error like `InvalidClientTokenId`, double-check that you pasted
the keys correctly and that the key hasn't been deactivated.

---

## 10.4 What the setup script creates

`infra/setup-aws.sh` is an **idempotent** script — safe to run multiple
times. If a resource already exists it skips creation instead of failing.

Run it with the region you chose during `aws configure`:

```bash
./infra/setup-aws.sh us-east-1
```

It creates three things:

### 1. Cognito User Pool: `aislefinder-users`

A **user pool** is Cognito's name for a directory of users. Configuration:
- **Email as username** — users sign up and log in with their email address,
  not a separate username.
- **Email verification** — when a user signs up, Cognito emails them a 6-digit
  code they must enter to confirm their address. This proves email ownership
  without you writing any email-sending code.
- **8-character minimum password** — the pool enforces this automatically.
- **No admin-created users** — users self-register through the app's sign-up
  form; you don't provision accounts manually.

### 2. App Client: `aislefinder-web`

Within a user pool, an **app client** represents one application that talks to
Cognito. Configuration:
- **No client secret** — browser apps can't keep secrets (anyone can open
  DevTools and read them), so this client is configured as a public client.
- **SRP auth only** — Secure Remote Password is a challenge-response protocol
  where the password is never sent over the network in any form, even encrypted.
  The browser proves it knows the password without revealing it.

### 3. DynamoDB table: `aislefinder-lists`

A **DynamoDB table** is like a key-value store crossed with a document
database. No columns to define upfront — each item can have different fields.
Configuration:
- **On-demand billing** — you pay per read/write operation rather than
  reserving capacity. At hobby scale this is nearly free.
- **`byShareCode` global secondary index (GSI)** — an index that lets the app
  quickly find a list by its share code without scanning the whole table. Like
  an index in a relational database.

### What the script prints

When it finishes, the script prints four values:

```
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
REACT_APP_COGNITO_CLIENT_ID=1abc2def3ghi4jkl5mno6pqr
AISLEFINDER_TABLE=aislefinder-lists
COGNITO_REGION=us-east-1
```

Copy all four — you'll need them in the next section.

---

## 10.5 Wire the environment variables

### Local development (`.env` file)

Open `.env` in the repo root (create it from `.env.example` if it doesn't
exist). Add the four values the script printed:

```
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
REACT_APP_COGNITO_CLIENT_ID=1abc2def3ghi4jkl5mno6pqr
AISLEFINDER_TABLE=aislefinder-lists
COGNITO_REGION=us-east-1
```

**Why two pairs?** The `REACT_APP_*` vars are read by the React build and
baked into the JavaScript bundle served to browsers. The other two are read
by the Flask server at runtime. The split is intentional — the frontend talks
to Cognito directly; the backend talks to DynamoDB and validates tokens.

**Restart both dev servers** after editing `.env`:

```bash
# In one terminal:
npm start

# In another terminal:
python api_server.py
```

The React dev server only reads `REACT_APP_*` at startup time — changes to
`.env` don't hot-reload.

**Local AWS access:** The Flask server uses `boto3` (the Python AWS SDK) to
talk to DynamoDB. Locally, boto3 automatically reads your `~/.aws/credentials`
file set by `aws configure` — you don't need to add AWS credentials to `.env`
for local development.

### Test that it's working locally

1. Start both servers.
2. Open the app in your browser.
3. Tap the account icon (top right).
4. The sheet should show a **Sign Up** form rather than a "sign in unavailable"
   message.
5. Sign up with an email address you can receive mail at.
6. Check your inbox — Cognito sends a verification code within a minute or two.
   (Check spam if it doesn't arrive.)
7. Enter the code in the app. You should be signed in.
8. Open the app in a second browser or incognito window, sign in with the same
   credentials, and verify your lists appear on both.

---

## 10.6 How the auth flow works (code walkthrough)

You don't need to understand this to get it running, but it's useful context
for debugging.

### Sign-in: frontend to Cognito (no server involved)

`src/auth.js` talks to Cognito directly via `amazon-cognito-identity-js`.
The Flask server is not involved in the sign-in step:

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

Sign-up is a three-step sequence you can watch in `AccountSheet.jsx`:

```
signUp(email, password)
    → Cognito emails a 6-digit verification code
        → confirmSignUp(email, code)
            → signIn(email, password)
```

### JWTs: what Cognito gives back after sign-in

On success Cognito issues **JWTs** (JSON Web Tokens) — cryptographically
signed blobs of data. Two tokens matter:

- **ID token** — contains who you are: your `email` and `sub` (a stable UUID
  that never changes even if you update your email). `auth.js` reads these
  from the token payload.
- **Access token** — proof you're logged in, used for API calls. The SDK
  stores both tokens in localStorage and automatically refreshes them before
  they expire (default: 1-hour expiry). `getAccessToken()` in `auth.js`
  returns the current valid token.

### Authenticated requests: frontend to Flask

Every API call that needs auth attaches the token as a Bearer header
(`src/api.js`):

```javascript
const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
```

### Token validation: Flask to Cognito

`lists_backend.py` receives the bearer token, calls Cognito's `GetUser` API
to validate it (Cognito rejects expired or tampered tokens), and extracts the
user's `sub`. Only then does it touch DynamoDB.

This validation is cached for ~5 minutes per token to avoid a Cognito round
trip on every single request. The `sub` is the stable user identity used as
DynamoDB's partition key.

---

## 10.7 What lands in DynamoDB

One table, two item shapes (a common "single-table design" pattern):

| pk | sk | What it is |
|----|----|------------|
| `LIST#{id}` | `META` | The full list JSON, plus members map and `share_code` |
| `USER#{sub}` | `LIST#{id}` | Membership marker: "this user can see this list" |

**How loading works:** `GET /api/lists` queries all `USER#{sub}` items to find
which lists you're a member of, then fetches each list's `META` item. Two
DynamoDB calls total, regardless of list count.

**How sharing works:** Sharing generates a 6-character code (skipping
ambiguous characters like 0/O and 1/I/L) stored on the list's `META` item.
`POST /api/lists/join` looks up that code via the `byShareCode` GSI and adds
the joiner as a member by writing a `USER#{sub}` item.

**Security:** The members map and share code are server-owned. `PUT /api/lists`
strips them from client payloads, so a client can't grant itself access to
other lists by crafting a request.

---

## 10.8 Production setup: Vercel and a minimal IAM user

Local development uses your admin IAM credentials automatically. Production
(Vercel) is a different story — Vercel's servers have no AWS identity, so you
must provide credentials explicitly. But you should **never use your admin
keys in production** — if they leaked, an attacker could do anything.

Instead, create a second IAM user with only the permissions the running app
actually needs.

### Create the minimal IAM user

1. In the AWS Console, go to **IAM → Users → Create user**.
2. Name it `aislefinder-prod` (or similar).
3. On permissions: choose **Attach policies directly**. Do **not** add
   AdministratorAccess. Instead click **Create policy** to open the policy
   editor.
4. Switch to the **JSON** tab and paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/aislefinder-lists",
        "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/aislefinder-lists/index/byShareCode"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cognito-idp:GetUser",
      "Resource": "arn:aws:cognito-idp:us-east-1:YOUR_ACCOUNT_ID:userpool/us-east-1_XXXXXXX"
    }
  ]
}
```

Replace `YOUR_ACCOUNT_ID` with your 12-digit AWS account ID (visible in the
top-right of the Console under your username) and `us-east-1_XXXXXXX` with
your actual user pool ID from the script output.

5. Name the policy `aislefinder-prod-policy`, create it, then attach it to
   the `aislefinder-prod` user.
6. After creating the user, go to **Security credentials → Create access key**,
   choose **Other** as the use case, and save the key pair.

### Add vars to Vercel

In your Vercel project dashboard, go to **Settings → Environment Variables**.
Add all six:

| Variable | Value |
|----------|-------|
| `REACT_APP_COGNITO_USER_POOL_ID` | from script output |
| `REACT_APP_COGNITO_CLIENT_ID` | from script output |
| `AISLEFINDER_TABLE` | `aislefinder-lists` |
| `COGNITO_REGION` | `us-east-1` |
| `AF_AWS_ACCESS_KEY_ID` | from the `aislefinder-prod` IAM user |
| `AF_AWS_SECRET_ACCESS_KEY` | from the `aislefinder-prod` IAM user |

> **Why `AF_` prefix?** Vercel reserves the `AWS_*` namespace for its own
> internal use. The app reads `AF_AWS_ACCESS_KEY_ID` and
> `AF_AWS_SECRET_ACCESS_KEY` specifically to work around this.

After saving, trigger a redeploy (Vercel → Deployments → Redeploy). The
`REACT_APP_*` vars are baked into the JS bundle at build time, so a redeploy
is required even if only those values changed.

---

## 10.9 Mobile builds

The two `REACT_APP_COGNITO_*` vars must be present in your local shell
environment when you build the mobile apps — they get baked into the JS
bundle that Capacitor packages:

```bash
# Make sure your .env has the vars, then:
npm run ios:build
# or
npm run android:build
```

If you build without them, the app will ship in guest-only mode even on
devices where auth would otherwise work. Re-build and re-submit to fix it.

---

## 10.10 Costs

At hobby scale this is effectively free:

| Service | Free tier | What you'll actually use |
|---------|-----------|--------------------------|
| Cognito | 10,000 monthly active users | likely single digits |
| DynamoDB | 25 GB storage + 200M requests/month | kilobytes, hundreds of requests |
| Data transfer | 1 GB/month outbound | negligible |

Your bill will realistically be **$0.00/month** until you have hundreds of
active users. DynamoDB on-demand pricing is $1.25 per million write request
units and $0.25 per million read request units — at personal-project scale
you won't hit even a million requests in a month.

Set up a **billing alert** so you're never surprised: AWS Console → Billing →
Budgets → Create budget → Zero spend budget. AWS will email you the moment any
charge appears.

---

## 10.11 Troubleshooting

### "Sign up" form doesn't appear — just shows a message about auth being unavailable

The `REACT_APP_COGNITO_*` env vars aren't set or the dev server wasn't
restarted after setting them. Check:

```bash
# Should print non-empty values:
echo $REACT_APP_COGNITO_USER_POOL_ID
echo $REACT_APP_COGNITO_CLIENT_ID
```

If those are empty, your `.env` file isn't being picked up. Make sure `.env`
is in the repo root (same directory as `package.json`), not a subdirectory.

### Verification code email never arrives

- Check spam/junk.
- Wait up to 5 minutes — Cognito sends via SES and there can be a delay.
- Make sure you entered the correct email during sign-up; no typos.
- You can resend the code: in `AccountSheet.jsx` there's a resend link during
  the confirmation step.

### Lists don't sync to the second device

- Confirm you're signed in on both devices (account icon should show your
  email, not a "Sign in" prompt).
- Wait ~15 seconds after saving on the first device — the sync has a debounce
  and polling interval.
- Open the browser console (F12 → Console) and look for red errors, especially
  401/403 HTTP errors which indicate a token problem, or 503 which means the
  backend couldn't reach DynamoDB.

### `aws configure` errors when running the setup script

```
Error: InvalidClientTokenId
```
The access key ID is wrong — check for copy-paste errors.

```
Error: SignatureDoesNotMatch
```
The secret access key is wrong or contains extra whitespace.

```
Error: AuthFailure — not authorized
```
The IAM user doesn't have AdministratorAccess. Go back to IAM and check
the attached policies.

### Script fails with "already exists" errors

The script is idempotent but may fail loudly on partial setups. Check what
already exists in the Console (Cognito → User Pools, DynamoDB → Tables) and
either delete the partial resources and rerun, or manually copy the IDs of the
existing resources into your `.env`.

---

## TODOs checklist

- [ ] **Create an AWS account** at https://aws.amazon.com (needs a credit
      card; this setup stays in the free tier — set up a zero-spend billing
      alert too)
- [ ] **Create an admin IAM user** (not the root account), generate an access
      key, and run `aws configure` with it
- [ ] **Verify the CLI works**: `aws sts get-caller-identity` should return
      your account ID
- [ ] **Run the setup script**: `./infra/setup-aws.sh us-east-1`
- [ ] **Copy the four printed env values into `.env`**, restart both dev
      servers (`npm start` + `python api_server.py`)
- [ ] **Test locally**: sign up in the account sheet, receive the email code,
      confirm, sign in — make sure no errors appear in the browser console
- [ ] **Test sync**: open the app in two browsers, add an item in one, watch
      it appear in the other within ~15 seconds
- [ ] **For production**: create the minimal `aislefinder-prod` IAM user with
      the restricted policy, add all six vars to Vercel, redeploy
- [ ] **For mobile**: make sure `REACT_APP_COGNITO_*` vars are in your
      environment when running `npm run ios:build` / `android:build`

---

Next: [Chapter 11 — Offline-First Sync](11-offline-sync.md)

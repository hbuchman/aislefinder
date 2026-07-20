# Aisle Finder — Full-Stack Development Guide

Aisle Finder is a grocery-list app that organizes your shopping list by store
aisle so you can walk the store in one pass. Under the hood it's a complete
full-stack project, and this guide uses it to walk through every layer:

```
React (CRA) ──► Flask API ──► Kroger product API
   │                │
   │                └──► DynamoDB (list sync) + Cognito (accounts)
   │
   ├──► Vercel (web deployment, aislefinder3000.com)
   └──► Capacitor (iOS + Android native wrappers)
```

## Chapters

**The backend**

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 1 | [Python Server](01-python-server.md) | Python setup, virtual environments, running the Flask API |
| 2 | [The Kroger API](02-kroger-api.md) | OAuth, search cleanup, and the product match-scoring engine |
| 3 | [Testing the Python Backend](03-testing-python.md) | pytest, parametrize, and stubbing out the network |

**The frontend**

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 4 | [React Frontend](04-react-frontend.md) | React fundamentals via real components from this codebase |
| 5 | [Testing the React Frontend](05-testing-react.md) | Jest, jsdom, and behavior-level app tests |
| 6 | [The Design System](06-design-system.md) | `--af-*` tokens, dark mode, and the green-only rules |

**Shipping it**

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 7 | [Web Deployment](07-web-deployment.md) | Vercel, domains, DNS, and connecting it all |
| 8 | [Adding iOS Support](08-ios-support.md) | Capacitor, Xcode, and shipping to iPhone |
| 9 | [Adding Android Support](09-android-support.md) | Android Studio, Gradle, and shipping to Android |

**Going multi-user**

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 10 | [Adding AWS Logins](10-aws-logins.md) | Cognito accounts, DynamoDB, IAM |
| 11 | [Offline-First Sync](11-offline-sync.md) | Dirty tracking, debounced pushes, conflict resolution |
| 12 | [The Full Codebase](12-codebase-tour.md) | How all the source code is organized |

**Running it safely**

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 13 | [Security & App Hardening](13-security-hardening.md) | Credentials, rate limiting, abuse caps, and API compliance |

Each chapter ends with a **TODO checklist** — the external-world steps
(accounts to create, keys to register, things to type into dashboards) needed
to make that layer actually work.

## Reading order

- **Just want to run the app locally?** Chapters 1–2, then 4.
- **Want to change code safely?** Add the testing chapters (3, 5) and the
  design system (6).
- **Want it on the internet?** Chapter 7.
- **Want it on your phone?** Chapters 8 and/or 9.
- **Want accounts and sync across devices?** Chapters 10–11.
- **Want the whole map at once?** Chapter 12.
- **Running it for real users?** Chapter 13.

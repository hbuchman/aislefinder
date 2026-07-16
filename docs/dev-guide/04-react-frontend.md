# Chapter 4: React Frontend

The user interface is a **React** single-page app. React's core idea: the UI
is a function of state. You write **components** (JavaScript functions that
return HTML-like markup called JSX), React re-renders them whenever their
state changes, and it efficiently updates only the parts of the page that
changed.

## 4.1 The framework: Create React App

Aisle Finder uses **Create React App (CRA)** — a zero-config toolchain that
bundles React, a dev server with hot reload, and a production build step.
Everything is driven by npm scripts in `package.json`:

```json
"scripts": {
  "start": "react-scripts start",   // dev server on http://localhost:3000
  "build": "react-scripts build",   // production bundle → build/
  "test": "react-scripts test"      // run the test suite (chapter 5)
}
```

```bash
# Run this — from the repo root
npm install     # install dependencies into node_modules/ (one-time)
npm start       # opens http://localhost:3000 with hot reload
```

To talk to your local Flask server from chapter 1, point the frontend at it
via a `REACT_APP_*` environment variable in `.env`:

```
REACT_APP_API_URL=http://localhost:8000
```

CRA bakes `REACT_APP_*` vars in **at build/start time** — restart `npm start`
after editing `.env`. `src/api.js` reads it to build request URLs and attaches
auth headers when needed:

```javascript
const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
```

## 4.2 Anatomy of a component: `Sheet.jsx`

The simplest real component in the codebase is the bottom-sheet wrapper
(`src/components/Sheet.jsx`) — it demonstrates props, conditional rendering,
JSX, and event handling in 40 lines:

```jsx
// Bottom sheet used for account, share, and store pickers
const Sheet = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--af-backdrop)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div style={{ /* ...the sheet panel... */ }}>
        {children}
      </div>
    </div>
  );
};
```

What to notice:

- **Props** — `{ open, onClose, children }` are inputs passed by the parent.
  `children` is whatever JSX the parent nests inside `<Sheet>...</Sheet>`.
- **Conditional rendering** — `if (!open) return null;` means "render
  nothing." No imperative show/hide; the parent just flips a boolean.
- **Data flows down, events flow up** — the sheet never decides to close
  itself; it calls `onClose()` (a function handed down by the parent), and
  the parent changes state, which re-renders with `open={false}`.
- **The backdrop-click trick** — `e.target === e.currentTarget` ensures only
  clicks on the backdrop itself (not on content inside it) close the sheet.

## 4.3 State and hooks: `useAuth` in `auth.js`

**Hooks** are functions starting with `use` that give components state and
lifecycle behavior. `useState` holds a value across re-renders; `useEffect`
runs side effects (fetching, subscriptions) after render. A **custom hook**
bundles these into a reusable unit — here's the app's auth hook
(`src/auth.js:90`):

```javascript
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(authConfigured);

  useEffect(() => {
    if (!authConfigured) return;
    let cancelled = false;
    getCurrentUser().then((u) => {
      if (!cancelled) {
        setUser(u);
        setAuthLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);
  // ...returns { user, authLoading, signIn, signOut, signUp, confirmSignUp }
};
```

What to notice:

- `useState(null)` — `user` starts as `null` (guest mode); calling `setUser`
  triggers a re-render everywhere `user` is read.
- `useEffect(..., [])` — the empty dependency array means "run once when the
  component mounts": check whether a Cognito session already exists.
- The `cancelled` flag + cleanup function is the standard guard against
  setting state on a component that unmounted while the promise was pending.

The heavyweight sibling is `useLists(user)` in `src/listsStore.js` — the
app's entire data layer as one hook. Chapter 11 dissects it.

## 4.4 Composition: the shell in `AisleFinder.jsx`

`src/AisleFinder.jsx` is the root component. It owns two pieces of navigation
state — which **screen** is showing and which **sheet** (modal) is open — and
composes everything else:

```
AisleFinder (shell: theme CSS, toast, online/offline, screen + sheet state)
├── TopBar                      — logo, user name, nav buttons
├── one of four screens:
│   ├── CurrentListScreen       — quick-add bar, items, frequent suggestions
│   ├── MyListsScreen           — switch / create / delete lists
│   ├── HistoryScreen           — completed trips by month
│   └── ShopScreen              — aisle groups, drag-drop, check-off, confetti
└── sheets (each wrapped in <Sheet>):
    ├── AccountSheet            — sign in / sign up / confirm code
    ├── ShareSheet              — create + join share codes
    └── StoreSheet              — ZIP search, pick your store
```

This is React's composition model in miniature: no router library — the
screen is just a state variable, and rendering is a switch over it. State
that multiple screens need (`lists`, `user`) lives in the shell and is passed
down as props.

The shell also owns the app's visual identity — theme CSS variables, fonts,
icons. Those conventions get their own chapter (chapter 6); read it before
touching any UI code.

## 4.5 Everything in `src/` at a glance

| File | Role |
|------|------|
| `index.js` | CRA entry point — mounts `<AisleFinder />` into the page |
| `AisleFinder.jsx` | Shell: theme, navigation state, composition |
| `listsStore.js` | `useLists()` — the data layer + background sync (ch. 11) |
| `auth.js` | `useAuth()` — Cognito sign-in (chapter 10) |
| `api.js` | All `fetch` calls to the Flask backend |
| `storage.js` | localStorage, mirrored to native storage on mobile (ch. 8–9) |
| `listUtils.js` | Parse/build the backend's markdown list format |
| `screens/` | The four full-page views |
| `components/` | Reusable pieces: `TopBar`, `Sheet`, the three sheets, `Logo` |

## TODOs to get this working

- [ ] **Install Node.js** (18+) — `brew install node`, verify with `node --version`
- [ ] **Install dependencies** — `npm install` in the repo root
- [ ] **Point at your backend** — add `REACT_APP_API_URL=http://localhost:8000`
      to `.env` (the same file from chapter 1)
- [ ] **Start both servers** — `python api_server.py` in one terminal,
      `npm start` in another, open http://localhost:3000
- [ ] **Smoke test** — add "milk, eggs, bread" via the quick-add bar, pick a
      store in the store sheet, hit Shop, and confirm items come back grouped
      by aisle

---

Next: [Chapter 5 — Testing the React Frontend](05-testing-react.md)

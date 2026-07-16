# Chapter 5: Testing the React Frontend

The frontend has a **Jest** suite — two files, two very different styles of
test, and both run without a browser.

## 5.1 Running the tests

Jest ships inside CRA; there's nothing to install. Two modes:

```bash
# Run this — interactive watch mode: reruns tests as you edit
npm test

# Run this — single pass and exit (what CI and pre-commit checks want)
CI=true npm test
```

There's no browser involved: Jest runs in Node with **jsdom**, a simulated
DOM. Components really render, `document` and `localStorage` really exist —
it's just headless and fast. The trade-off: nothing is *painted*, so tests
assert on DOM content, not pixels.

## 5.2 Style 1: pure-function tests (`listUtils.test.js`)

The easiest code to test is code with no React in it — plain functions in,
values out. `src/listUtils.js` (parsing the backend's `## Section\n- item`
markdown into groups and back) is tested exactly like the Python
`search_terms` tests in chapter 3: feed input, assert output, no setup.

This is a design lesson as much as a testing one: because the markdown
logic lives in a plain module instead of inside a component, testing it
costs nothing. Keep logic out of components and most of your tests stay
this simple.

## 5.3 Style 2: rendering the whole app (`AisleFinder.test.js`)

The second file mounts the *entire* app and asserts on what appears:

```javascript
const render = () => {
  const div = document.createElement('div');
  document.body.appendChild(div);
  act(() => { createRoot(div).render(<AisleFinder />); });
  return div;
};

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

it('renders the current-list home screen in guest mode', () => {
  const div = render();
  expect(div.textContent).toContain('AisleFinder');
  expect(div.textContent).toContain('Guest');
  expect(div.querySelector('input[placeholder*="Add an item"]')).not.toBeNull();
});
```

What to notice:

- **`act(...)`** wraps the render so React flushes all state updates and
  effects before your assertions run — without it, you'd assert against a
  half-rendered tree (React warns loudly when you forget).
- **`beforeEach` resets shared state.** The app persists to localStorage on
  every change (chapter 11), and jsdom's localStorage survives between
  tests in a file. Without the reset, test A's lists leak into test B —
  the classic source of tests that pass alone and fail together.
- **Tests always run in guest mode** — jsdom starts with no saved Cognito
  session, so `useAuth` resolves to no user and nothing touches the network.

## 5.4 The migration test: pinning down risky code

The best test in the suite protects the scariest code path — upgrading a
user's stored data from the old single-list format without losing anything:

```javascript
it('migrates the old single-list localStorage format', () => {
  localStorage.setItem('af_textInput', JSON.stringify('milk\neggs, bananas'));
  localStorage.setItem('af_groceryList', JSON.stringify('## Dairy\n- milk\n- eggs\n\n## Produce\n- bananas'));
  const div = render();
  expect(div.textContent).toContain('milk');
  const lists = JSON.parse(localStorage.getItem('af_lists'));
  expect(lists).toHaveLength(1);
  expect(lists[0].items.map((it) => it.name).sort()).toEqual(['bananas', 'eggs', 'milk']);
  expect(lists[0].organized).toContain('## Dairy');
});
```

The pattern: *seed* the pre-condition (old-format keys in localStorage),
*run* the system (mount the app), *assert* the outcome at both levels — what
the user sees (`textContent`) and what got persisted (`af_lists`). Note
what it does **not** assert: no internal function calls, no component
structure. It tests behavior, so refactoring `listsStore.js` freely won't
break it — only actually losing user data will.

## 5.5 When you add frontend code

- New parsing/formatting logic → put it in `listUtils.js` (or a new plain
  module) and test it pure.
- New user-visible flows → extend `AisleFinder.test.js`: seed localStorage,
  render, assert on the DOM.
- Anything touching stored data shapes → **always** add a migration test
  like §5.4; localStorage on a user's phone is forever.

## TODOs to get this working

- [ ] **Run the suite once** — `CI=true npm test` (needs only `npm install`
      from chapter 4; no backend, no `.env`)
- [ ] **Try watch mode** — `npm test`, then edit a file and watch it rerun
- [ ] **Adopt the rhythm** — `CI=true npm test` before every commit that
      touches `src/`, alongside the Python suite from chapter 3

---

Next: [Chapter 6 — The Design System](06-design-system.md)

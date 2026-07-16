# Chapter 11: Offline-First Sync

The subtlest code in the app is `src/listsStore.js` — one hook that keeps
grocery lists correct across offline edits, multiple devices, and shared
lists, without a sync library. This chapter dissects it. (Chapter 10
covered the server side; this is the client half.)

**Offline-first** means the local copy is the source of truth for the UI:
every edit applies instantly to local state and localStorage, and the
network is only ever catching up in the background. The app never shows a
spinner for a list edit.

## 11.1 The data shape

Everything revolves around one list object (`newList()`):

```javascript
{
  id: uid(),
  name, status: 'active',        // or 'completed'
  items: [],                     // [{ id, name, addedAt, addedBy, fromList }]
  store: null,                   // the picked Kroger store
  organized: null,               // markdown from the last organize call
  checkedItems: {}, collapsedGroups: {}, customCategoryOrder: null,
  shareCode: null, members: [],  // server-owned (chapter 10)
  createdAt, updatedAt, completedAt,
}
```

Two fields do the sync heavy lifting: `updatedAt` (bumped on every
mutation — the conflict tiebreaker) and `id` (generated client-side, so
lists created offline need no server round trip to exist).

## 11.2 Local persistence: every render, every write

Persistence isn't an event — it's a `useEffect` that mirrors state whenever
it changes:

```javascript
const [lists, setLists] = useState(initialLists);
useEffect(() => { saveState('lists', lists); }, [lists]);
```

`saveState` (in `storage.js`) writes localStorage synchronously and, on
iOS/Android, also mirrors the value to native storage via Capacitor
Preferences (debounced ~100ms per key) so the OS can't evict it
(chapter 8). On startup, `initialLists()` loads from localStorage — and
falls back to migrating the pre-redesign single-list format, the path
pinned down by the migration test in chapter 5.

## 11.3 Dirty tracking: remembering what the server hasn't seen

Every mutation marks its list **dirty** — "changed locally, not yet
confirmed by the server":

```javascript
const dirtyIds = useRef(new Set(loadState('dirtyListIds', [])));

const markDirty = useCallback((id) => {
  dirtyIds.current.add(id);
  saveState('dirtyListIds', [...dirtyIds.current]);
}, []);
```

Details that matter:

- It's a `useRef`, not `useState` — dirtiness is bookkeeping, not UI; it
  shouldn't cause re-renders.
- It's **persisted**. Close the app with unsynced edits and the dirty set
  survives the restart — nothing is lost, just late.
- It's a set of list IDs, not a diff. Sync always pushes the whole current
  list, which makes retries trivially safe (idempotent PUT).

## 11.4 Pushing: debounced, per-list, failure-tolerant

```javascript
// Debounced push after any mutation
useEffect(() => {
  if (!user) return;
  clearTimeout(pushTimer.current);
  pushTimer.current = setTimeout(pushDirty, 1500);
  return () => clearTimeout(pushTimer.current);
}, [lists, user, pushDirty]);
```

Every state change resets a 1.5-second timer — type five items quickly and
the app makes one request, not five. Inside `pushDirty()`:

```javascript
for (const id of [...dirtyIds.current]) {
  try {
    const saved = await pushList(token, list);
    dirtyIds.current.delete(id);      // clean only after the server confirms
    if (saved && saved.members) { /* adopt server-owned members/shareCode */ }
  } catch { /* stays dirty; retried next cycle */ }
}
```

The empty `catch` is the whole failure strategy, and it's the right one: a
failed push changes nothing — the list simply *stays dirty* and the next
cycle retries. No error queues, no exponential backoff bookkeeping. Note
also the write-back: `members` and `shareCode` come from the server's
response, never from local guesses (they're server-owned, chapter 10).

## 11.5 Pulling: four triggers, one conflict rule

`pullRemote()` runs on sign-in, every 15 seconds while the tab is visible,
on window focus, and when connectivity returns:

```javascript
const onOnline = () => { pushDirty().then(pullRemote); };   // push first, then pull!
```

(Push-then-pull on reconnect matters: pulling first could overwrite offline
edits that haven't been sent yet.)

Merging remote lists into local state is three lines of policy:

```javascript
if (!local) {
  byId.set(r.id, r);                    // new from another device: take it
} else if (!dirtyIds.current.has(r.id) && (r.updatedAt || '') > (local.updatedAt || '')) {
  byId.set(r.id, r);                    // clean here + newer there: take it
}
// otherwise: keep local
```

In words: **a dirty local list always wins** (your unsent edits are never
clobbered), and a clean local list defers to a newer server copy. This is
last-write-wins at list granularity — simple, predictable, and honest about
its trade-off: if two people edit the *same list* while both offline, the
later sync wins whole. For a grocery list, that's an acceptable deal.

One more subtlety at the end of `pullRemote()`: any local list the server
has never heard of gets marked dirty, so lists created before you signed in
(or while the backend was down) upload themselves on the next cycle.

## 11.6 The complete picture

```
edit ──► setLists ──► useEffect ──► localStorage (+ native mirror)
              │
              └─► markDirty ──► 1.5s debounce ──► PUT /api/lists/{id} ──► clean
                                                        ▲ (fail → stays dirty)
sign-in / 15s visible / focus / reconnect ──► pullRemote
        merge rule: dirty-local wins, else newer updatedAt wins
```

Guest mode is just this diagram with the bottom half switched off — which
is why every sync effect starts with `if (!user) return;`.

## TODOs to verify it works

- [ ] **Two-device sync** — with chapter 10 configured, sign in on two
      browsers; an item added in one appears in the other within ~15s
- [ ] **Offline edits** — DevTools → Network → Offline; add items (works
      instantly), go back online, watch the push fire and the other browser
      catch up
- [ ] **Restart survival** — go offline, edit, fully close the tab, reopen:
      the edits and the pending dirty state are both still there
- [ ] **Guest-mode isolation** — sign out and confirm zero requests to
      `/api/lists*` in the Network tab

---

Next: [Chapter 12 — The Full Codebase](12-codebase-tour.md)

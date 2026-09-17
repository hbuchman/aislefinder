import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchLists, pushList, deleteListRemote, putAisleOverride, resolveAisleOverrides } from './api';
import { getAccessToken } from './auth';
import { itemsHash, itemKey } from './listUtils';
import { isOnline, onNetworkChange } from './network';

import { loadState, saveState } from './storage';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Exponential backoff for the dirty-queue flushers below, so a persistently
// failing push (server error, not just being offline — the caller already
// skips the attempt entirely while offline, so this never counts that as a
// failure) doesn't retry on every debounce tick or reconnect. Caps at 5min.
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const makeBackoff = () => ({ failures: 0, nextAttemptAt: 0 });
const backoffReady = (state) => Date.now() >= state.nextAttemptAt;
const backoffRecordFailure = (state) => {
  state.failures += 1;
  state.nextAttemptAt = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (state.failures - 1));
};
const backoffRecordSuccess = (state) => { state.failures = 0; state.nextAttemptAt = 0; };

export const newList = (name = 'My Groceries') => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    status: 'active',
    items: [],
    store: null,
    organized: null,        // markdown from the last organize call
    organizedBy: null,      // 'aisle' | 'category' — the format actually applied
    formatPreference: null, // 'aisle' | 'category' | null — explicit user choice; null means auto
    checkedItems: {},
    collapsedGroups: {},
    customCategoryOrder: null,
    shareCode: null,
    members: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
};

export const newItem = (name, addedBy = null, fromList = null) => ({
  id: uid(),
  name: name.trim().toLowerCase(),
  addedAt: new Date().toISOString(),
  addedBy,
  fromList,
});

// One-time migration from the pre-redesign single-list format.
const migrateLegacyState = () => {
  const textInput = loadState('textInput', '');
  const groceryList = loadState('groceryList', '');
  if (!textInput.trim() && !groceryList) return null;

  const list = newList();
  list.items = textInput
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => newItem(name));
  list.store = loadState('selectedStore', null);
  list.organized = groceryList || null;
  list.organizedForHash = groceryList ? itemsHash(list.items) : null;
  list.organizedBy = loadState('organizeByCategory', true) ? 'category' : 'aisle';
  list.checkedItems = loadState('checkedItems', {});
  list.collapsedGroups = loadState('collapsedGroups', {});
  list.customCategoryOrder = loadState('customCategoryOrder', null);
  return list;
};

const initialLists = () => {
  const saved = loadState('lists', null);
  if (saved && saved.length > 0) return saved;
  const migrated = migrateLegacyState();
  return [migrated || newList()];
};

export const daysAgoLabel = (iso) => {
  if (!iso) return 'an unknown time ago';
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

// Plain-text grounding for the chat assistant: the current list plus the most
// recent purchase of each item across completed trips. Built client-side
// since list/history data lives on-device (localStorage), not queryable from
// the backend — see lists_backend.py's docstring.
export const buildChatContext = (currentList, completedLists) => {
  const parts = [];

  if (currentList && currentList.items.length > 0) {
    parts.push(`Current list ("${currentList.name}"): ${currentList.items.map((it) => it.name).join(', ')}.`);
  } else {
    parts.push('The current list is empty.');
  }

  // Most recent purchase of each item, newest trip first
  const lastSeen = new Map();
  completedLists.forEach((list) => {
    list.items.forEach((it) => {
      if (!lastSeen.has(it.name)) {
        lastSeen.set(it.name, { completedAt: list.completedAt, storeName: list.store ? list.store.name : null });
      }
    });
  });

  if (lastSeen.size > 0) {
    const lines = [...lastSeen.entries()]
      .sort((a, b) => (b[1].completedAt || '').localeCompare(a[1].completedAt || ''))
      .slice(0, 40)
      .map(([name, info]) => `- ${name} — ${daysAgoLabel(info.completedAt)}${info.storeName ? ` at ${info.storeName}` : ''}`);
    parts.push(`Recent purchases (most recent first):\n${lines.join('\n')}`);
  }

  return parts.join('\n\n');
};

// Per-item purchase history, grouped by list name — how many times each item
// was bought under that name and when it was last seen. Drives the "Bought
// before" section on the current list screen.
export const groupPurchaseHistory = (completedLists) => {
  const groups = new Map(); // list name -> { name, trips, lastAt, itemsByKey }
  completedLists.forEach((list) => {
    let group = groups.get(list.name);
    if (!group) {
      group = { name: list.name, trips: 0, lastAt: null, itemsByKey: new Map() };
      groups.set(list.name, group);
    }
    group.trips += 1;
    if (!group.lastAt || (list.completedAt || '') > group.lastAt) group.lastAt = list.completedAt;
    list.items.forEach((it) => {
      const key = itemKey(it.name);
      const existing = group.itemsByKey.get(key);
      if (!existing) {
        group.itemsByKey.set(key, {
          name: it.name,
          count: 1,
          lastAt: list.completedAt,
          lastStore: list.store ? list.store.name : null,
        });
      } else {
        existing.count += 1;
        if ((list.completedAt || '') > (existing.lastAt || '')) {
          existing.lastAt = list.completedAt;
          existing.lastStore = list.store ? list.store.name : null;
        }
      }
    });
  });
  return [...groups.values()]
    .map((g) => ({ name: g.name, trips: g.trips, lastAt: g.lastAt, items: [...g.itemsByKey.values()] }))
    .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
};

// Main store hook. `user` is the auth user (null in guest mode); when signed
// in, changes sync to the backend and remote changes are polled in.
export const useLists = (user) => {
  const [lists, setLists] = useState(initialLists);
  const [currentListId, setCurrentListId] = useState(() => loadState('currentListId', null));
  // Aisle/category corrections a shopper has set, keyed by store then by
  // lowercased item name — kept outside the per-list `organized` markdown (the
  // backend overwrites that on every re-organize) and reused across trips at
  // the same store. Placement: {kind:'aisle',value} | {kind:'category',value} |
  // {kind:'none'}. Device-local for now; a signed-in sync path can follow.
  const [aisleOverrides, setAisleOverridesState] = useState(() => loadState('aisleOverrides', {}));
  // Item -> remembered aisle/category placement, per store and format, built
  // from organize results and single-item lookups as they happen. Lets Shop
  // mode reconstruct a previously-seen item's group offline without a network
  // call. Shape: { [storeId]: { [itemKey]: { aisle: {group,updatedAt},
  // category: {group,updatedAt} } } }.
  const [itemHistory, setItemHistory] = useState(() => loadState('itemAisleHistory', {}));
  // Items a shopper has dismissed from the "You often buy" suggestions —
  // still counted in history, just never surfaced again. Device-local.
  const [hiddenFrequentItems, setHiddenFrequentItems] = useState(() => loadState('hiddenFrequentItems', []));
  const dirtyIds = useRef(new Set(loadState('dirtyListIds', [])));
  // Aisle/category overrides set while offline (or whose push failed) — keys
  // are `${storeId}::${itemKey}`, flushed the same way dirty lists are.
  const dirtyOverrideKeys = useRef(new Set(loadState('dirtyOverrideKeys', [])));
  // List deletes made offline (or whose push failed) — the list itself is
  // already gone from `lists`/localStorage, so this is the only record that
  // the server still needs to hear about it.
  const dirtyDeleteIds = useRef(new Set(loadState('dirtyDeleteIds', [])));
  const pushBackoff = useRef(makeBackoff());
  const overridePushBackoff = useRef(makeBackoff());
  const deletePushBackoff = useRef(makeBackoff());
  const pushTimer = useRef(null);

  useEffect(() => { saveState('lists', lists); }, [lists]);
  useEffect(() => { saveState('currentListId', currentListId); }, [currentListId]);
  useEffect(() => { saveState('aisleOverrides', aisleOverrides); }, [aisleOverrides]);
  useEffect(() => { saveState('itemAisleHistory', itemHistory); }, [itemHistory]);
  useEffect(() => { saveState('hiddenFrequentItems', hiddenFrequentItems); }, [hiddenFrequentItems]);

  const activeLists = useMemo(() => lists.filter((l) => l.status === 'active'), [lists]);
  const completedLists = useMemo(
    () => lists
      .filter((l) => l.status === 'completed')
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
    [lists]
  );

  const currentList = useMemo(() => {
    const found = lists.find((l) => l.id === currentListId && l.status === 'active');
    return found || activeLists[0] || null;
  }, [lists, currentListId, activeLists]);

  // Make sure currentListId always points at a real active list
  useEffect(() => {
    if (currentList && currentList.id !== currentListId) setCurrentListId(currentList.id);
  }, [currentList, currentListId]);

  const markDirty = useCallback((id) => {
    dirtyIds.current.add(id);
    saveState('dirtyListIds', [...dirtyIds.current]);
  }, []);

  // ---- mutations ----

  const updateList = useCallback((id, patch) => {
    setLists((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const changes = typeof patch === 'function' ? patch(l) : patch;
      return { ...l, ...changes, updatedAt: new Date().toISOString() };
    }));
    markDirty(id);
  }, [markDirty]);

  const addItem = useCallback((listId, name) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;
    let added = false;
    setLists((prev) => prev.map((l) => {
      if (l.id !== listId) return l;
      if (l.items.some((it) => it.name === trimmed)) return l;
      added = true;
      return {
        ...l,
        items: [newItem(trimmed, user ? user.displayName : null), ...l.items],
        updatedAt: new Date().toISOString(),
      };
    }));
    markDirty(listId);
    return added;
  }, [user, markDirty]);

  const removeItem = useCallback((listId, itemId) => {
    updateList(listId, (l) => ({ items: l.items.filter((it) => it.id !== itemId) }));
  }, [updateList]);

  const editItem = useCallback((listId, itemId, name) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;
    let edited = false;
    setLists((prev) => prev.map((l) => {
      if (l.id !== listId) return l;
      if (l.items.some((it) => it.id !== itemId && it.name === trimmed)) return l;
      edited = true;
      return {
        ...l,
        items: l.items.map((it) => (it.id === itemId ? { ...it, name: trimmed } : it)),
        updatedAt: new Date().toISOString(),
      };
    }));
    if (edited) markDirty(listId);
    return edited;
  }, [markDirty]);

  // Save/clear a shopper's aisle or category correction for an item at a store.
  // Writes device-local immediately (so it works offline/guest), then pushes a
  // vote to the backend when signed in — the sync layer resolves the rest.
  const markOverrideDirty = useCallback((sid, key) => {
    dirtyOverrideKeys.current.add(`${sid}::${key}`);
    saveState('dirtyOverrideKeys', [...dirtyOverrideKeys.current]);
  }, []);

  const setAisleOverride = useCallback((storeId, itemName, placement) => {
    const sid = storeId || 'default';
    const key = itemKey(itemName);
    if (!key) return;
    setAisleOverridesState((prev) => ({
      ...prev,
      [sid]: { ...(prev[sid] || {}), [key]: placement },
    }));
    markOverrideDirty(sid, key);
    if (user && isOnline()) {
      getAccessToken().then((token) => {
        if (!token) return;
        putAisleOverride(token, {
          storeId: sid,
          item: itemName,
          placement,
          storeAisle: placement && placement.storeAisle,
        }).then(() => {
          dirtyOverrideKeys.current.delete(`${sid}::${key}`);
          saveState('dirtyOverrideKeys', [...dirtyOverrideKeys.current]);
        }).catch(() => {});
      });
    }
  }, [user, markOverrideDirty]);

  const clearAisleOverride = useCallback((storeId, itemName) => {
    const sid = storeId || 'default';
    const key = itemKey(itemName);
    setAisleOverridesState((prev) => {
      if (!prev[sid] || !(key in prev[sid])) return prev;
      const forStore = { ...prev[sid] };
      delete forStore[key];
      return { ...prev, [sid]: forStore };
    });
    markOverrideDirty(sid, key);
    if (user && isOnline()) {
      getAccessToken().then((token) => {
        if (!token) return;
        putAisleOverride(token, { storeId: sid, item: itemName, placement: null }).then(() => {
          dirtyOverrideKeys.current.delete(`${sid}::${key}`);
          saveState('dirtyOverrideKeys', [...dirtyOverrideKeys.current]);
        }).catch(() => {});
      });
    }
  }, [user, markOverrideDirty]);

  // Remember where items were found so Shop mode can reconstruct a list's
  // groups offline. `entries` is [{name, group}]; called after a successful
  // organize or single-item lookup — device-local, never synced (it's just a
  // cache of network results, not a correction).
  const recordItemHistory = useCallback((storeId, format, entries) => {
    if (!entries || entries.length === 0) return;
    const sid = storeId || 'default';
    const now = new Date().toISOString();
    setItemHistory((prev) => {
      const forStore = { ...(prev[sid] || {}) };
      entries.forEach(({ name, group }) => {
        const key = itemKey(name);
        if (!key || !group) return;
        forStore[key] = { ...(forStore[key] || {}), [format]: { group, updatedAt: now } };
      });
      return { ...prev, [sid]: forStore };
    });
  }, []);

  // Pull the effective overrides for a trip (mine → household → community) and
  // merge them over the device-local cache. Best-effort; a no-op when signed
  // out, offline, or sync is unconfigured.
  const syncAisleOverrides = useCallback(async (storeId, itemNames, listId) => {
    if (!user || !isOnline() || !Array.isArray(itemNames) || itemNames.length === 0) return;
    const token = await getAccessToken();
    if (!token) return;
    const resolved = await resolveAisleOverrides(token, { listId, storeId, items: itemNames });
    if (!resolved) return;
    const sid = storeId || 'default';
    setAisleOverridesState((prev) => ({ ...prev, [sid]: { ...(prev[sid] || {}), ...resolved } }));
  }, [user]);

  const createList = useCallback((name) => {
    const list = newList(name);
    setLists((prev) => [list, ...prev]);
    setCurrentListId(list.id);
    markDirty(list.id);
    return list;
  }, [markDirty]);

  const deleteList = useCallback(async (id) => {
    setLists((prev) => prev.filter((l) => l.id !== id));
    dirtyIds.current.delete(id);
    saveState('dirtyListIds', [...dirtyIds.current]);
    dirtyDeleteIds.current.add(id);
    saveState('dirtyDeleteIds', [...dirtyDeleteIds.current]);
    if (user && isOnline()) {
      const token = await getAccessToken();
      if (token) {
        deleteListRemote(token, id).then(() => {
          dirtyDeleteIds.current.delete(id);
          saveState('dirtyDeleteIds', [...dirtyDeleteIds.current]);
        }).catch(() => {});
      }
    }
  }, [user]);

  // Archive a finished shop into history and start a fresh current list.
  const completeList = useCallback((id) => {
    const now = new Date().toISOString();
    let replacement = null;
    setLists((prev) => {
      const updated = prev.map((l) => (
        l.id === id ? { ...l, status: 'completed', completedAt: now, updatedAt: now } : l
      ));
      const stillActive = updated.filter((l) => l.status === 'active');
      if (stillActive.length === 0) {
        const done = updated.find((l) => l.id === id);
        replacement = newList(done ? done.name : 'My Groceries');
        replacement.store = done ? done.store : null;
        replacement.formatPreference = done ? done.formatPreference : null;
        return [replacement, ...updated];
      }
      return updated;
    });
    markDirty(id);
    if (replacement) {
      markDirty(replacement.id);
      setCurrentListId(replacement.id);
    }
  }, [markDirty]);

  const adoptRemoteList = useCallback((remote) => {
    setLists((prev) => {
      const without = prev.filter((l) => l.id !== remote.id);
      return [remote, ...without];
    });
    setCurrentListId(remote.id);
  }, []);

  // Suggestions drawn from shopping history, excluding what's already listed
  // or what the shopper has dismissed from suggestions
  const frequentItems = useMemo(() => {
    if (!currentList) return [];
    const counts = {};
    completedLists.forEach((l) => l.items.forEach((it) => {
      counts[it.name] = (counts[it.name] || 0) + 1;
    }));
    const onList = new Set(currentList.items.map((it) => it.name));
    const hidden = new Set(hiddenFrequentItems);
    return Object.entries(counts)
      .filter(([name]) => !onList.has(name) && !hidden.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [completedLists, currentList, hiddenFrequentItems]);

  // Dismiss an item from "You often buy" suggestions going forward.
  const hideFrequentItem = useCallback((name) => {
    const key = name.trim().toLowerCase();
    setHiddenFrequentItems((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const purchaseHistory = useMemo(() => groupPurchaseHistory(completedLists), [completedLists]);

  // ---- server sync (signed-in only) ----

  const pushDirty = useCallback(async () => {
    if (!user || dirtyIds.current.size === 0 || !isOnline() || !backoffReady(pushBackoff.current)) return;
    const token = await getAccessToken();
    if (!token) return;
    const current = loadState('lists', []);
    let failed = false;
    for (const id of [...dirtyIds.current]) {
      const list = current.find((l) => l.id === id);
      if (!list) { dirtyIds.current.delete(id); continue; }
      try {
        const saved = await pushList(token, list);
        dirtyIds.current.delete(id);
        if (saved && saved.members) {
          setLists((prev) => prev.map((l) => (
            l.id === id ? { ...l, members: saved.members, shareCode: saved.shareCode ?? l.shareCode } : l
          )));
        }
      } catch { failed = true; /* stays dirty; retried next cycle */ }
    }
    saveState('dirtyListIds', [...dirtyIds.current]);
    if (failed) backoffRecordFailure(pushBackoff.current); else backoffRecordSuccess(pushBackoff.current);
  }, [user]);

  // Flush aisle/category overrides set while offline (or whose push failed).
  // Mirrors pushDirty's shape: only drop a key from the queue once the push
  // actually succeeds, so it's retried on the next debounce/online cycle.
  const pushDirtyOverrides = useCallback(async () => {
    if (!user || dirtyOverrideKeys.current.size === 0 || !isOnline() || !backoffReady(overridePushBackoff.current)) return;
    const token = await getAccessToken();
    if (!token) return;
    const current = loadState('aisleOverrides', {});
    let failed = false;
    for (const entry of [...dirtyOverrideKeys.current]) {
      const sep = entry.indexOf('::');
      const sid = entry.slice(0, sep);
      const key = entry.slice(sep + 2);
      const placement = (current[sid] && current[sid][key]) || null;
      try {
        await putAisleOverride(token, {
          storeId: sid,
          item: key,
          placement,
          storeAisle: placement && placement.storeAisle,
        });
        dirtyOverrideKeys.current.delete(entry);
      } catch { failed = true; /* stays dirty; retried next cycle */ }
    }
    saveState('dirtyOverrideKeys', [...dirtyOverrideKeys.current]);
    if (failed) backoffRecordFailure(overridePushBackoff.current); else backoffRecordSuccess(overridePushBackoff.current);
  }, [user]);

  // Flush list deletes made offline (or whose push failed) — same shape as
  // pushDirty/pushDirtyOverrides.
  const pushDirtyDeletes = useCallback(async () => {
    if (!user || dirtyDeleteIds.current.size === 0 || !isOnline() || !backoffReady(deletePushBackoff.current)) return;
    const token = await getAccessToken();
    if (!token) return;
    let failed = false;
    for (const id of [...dirtyDeleteIds.current]) {
      try {
        await deleteListRemote(token, id);
        dirtyDeleteIds.current.delete(id);
      } catch { failed = true; /* stays dirty; retried next cycle */ }
    }
    saveState('dirtyDeleteIds', [...dirtyDeleteIds.current]);
    if (failed) backoffRecordFailure(deletePushBackoff.current); else backoffRecordSuccess(deletePushBackoff.current);
  }, [user]);

  const pullRemote = useCallback(async () => {
    if (!user || !isOnline()) return;
    const token = await getAccessToken();
    if (!token) return;
    let remote;
    try {
      remote = await fetchLists(token);
    } catch { return; }
    if (!remote) return; // sync not configured server-side
    setLists((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]));
      remote.forEach((r) => {
        const local = byId.get(r.id);
        if (!local) {
          byId.set(r.id, r);
        } else if (!dirtyIds.current.has(r.id) && (r.updatedAt || '') > (local.updatedAt || '')) {
          byId.set(r.id, r);
        }
      });
      return [...byId.values()];
    });
    // Anything local the server has never seen gets pushed on the next cycle
    const remoteIds = new Set(remote.map((r) => r.id));
    loadState('lists', []).forEach((l) => {
      if (!remoteIds.has(l.id)) dirtyIds.current.add(l.id);
    });
    saveState('dirtyListIds', [...dirtyIds.current]);
  }, [user]);

  // Debounced push after any mutation
  useEffect(() => {
    if (!user) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => { pushDirty(); pushDirtyOverrides(); pushDirtyDeletes(); }, 1500);
    return () => clearTimeout(pushTimer.current);
  }, [lists, aisleOverrides, user, pushDirty, pushDirtyOverrides, pushDirtyDeletes]);

  // When connectivity returns, flush edits queued while offline, then pull
  useEffect(() => {
    if (!user) return;
    return onNetworkChange((connected) => {
      if (connected) Promise.all([pushDirty(), pushDirtyOverrides(), pushDirtyDeletes()]).then(pullRemote);
    });
  }, [user, pushDirty, pushDirtyOverrides, pushDirtyDeletes, pullRemote]);

  // Pull on sign-in and every 15s while the tab is visible
  useEffect(() => {
    if (!user) return;
    pullRemote();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') pullRemote();
    }, 15000);
    const onFocus = () => pullRemote();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, pullRemote]);

  return {
    lists,
    activeLists,
    completedLists,
    currentList,
    setCurrentListId,
    updateList,
    addItem,
    removeItem,
    editItem,
    createList,
    deleteList,
    completeList,
    adoptRemoteList,
    frequentItems,
    hideFrequentItem,
    purchaseHistory,
    pullRemote,
    aisleOverrides,
    setAisleOverride,
    clearAisleOverride,
    syncAisleOverrides,
    itemHistory,
    recordItemHistory,
  };
};

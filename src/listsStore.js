import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchLists, pushList, deleteListRemote, putAisleOverride, resolveAisleOverrides } from './api';
import { getAccessToken } from './auth';
import { itemsHash, itemKey } from './listUtils';

import { loadState, saveState } from './storage';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

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

export const completedLabel = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

// History, grouped by list name instead of by individual trip: every item
// ever bought under a recurring list (e.g. every trip ever run as "Costco
// Run"), deduped with a purchase count and most-recent date. "Bought" means
// "was on a trip this shopper completed" — the same assumption
// buildChatContext makes above, since there's no signed-in Kroger order
// history behind this, only what shoppers themselves checked off.
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
  const dirtyIds = useRef(new Set(loadState('dirtyListIds', [])));
  const pushTimer = useRef(null);

  useEffect(() => { saveState('lists', lists); }, [lists]);
  useEffect(() => { saveState('currentListId', currentListId); }, [currentListId]);
  useEffect(() => { saveState('aisleOverrides', aisleOverrides); }, [aisleOverrides]);

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

  // Bulk add, for restoring several items from purchase history in one go —
  // a single list write instead of one per item (each own write would reset
  // the push-debounce timer and re-render for every row selected).
  const addItems = useCallback((listId, names) => {
    let addedCount = 0;
    setLists((prev) => prev.map((l) => {
      if (l.id !== listId) return l;
      const existing = new Set(l.items.map((it) => it.name));
      const fresh = [];
      names.forEach((raw) => {
        const trimmed = raw.trim().toLowerCase();
        if (!trimmed || existing.has(trimmed)) return;
        existing.add(trimmed);
        fresh.push(newItem(trimmed, user ? user.displayName : null));
      });
      addedCount = fresh.length;
      if (fresh.length === 0) return l;
      return { ...l, items: [...fresh, ...l.items], updatedAt: new Date().toISOString() };
    }));
    if (addedCount > 0) markDirty(listId);
    return addedCount;
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
  const setAisleOverride = useCallback((storeId, itemName, placement) => {
    const sid = storeId || 'default';
    const key = itemKey(itemName);
    if (!key) return;
    setAisleOverridesState((prev) => ({
      ...prev,
      [sid]: { ...(prev[sid] || {}), [key]: placement },
    }));
    if (user && navigator.onLine) {
      getAccessToken().then((token) => {
        if (token) {
          putAisleOverride(token, {
            storeId: sid,
            item: itemName,
            placement,
            storeAisle: placement && placement.storeAisle,
          }).catch(() => {});
        }
      });
    }
  }, [user]);

  const clearAisleOverride = useCallback((storeId, itemName) => {
    const sid = storeId || 'default';
    const key = itemKey(itemName);
    setAisleOverridesState((prev) => {
      if (!prev[sid] || !(key in prev[sid])) return prev;
      const forStore = { ...prev[sid] };
      delete forStore[key];
      return { ...prev, [sid]: forStore };
    });
    if (user && navigator.onLine) {
      getAccessToken().then((token) => {
        if (token) putAisleOverride(token, { storeId: sid, item: itemName, placement: null }).catch(() => {});
      });
    }
  }, [user]);

  // Pull the effective overrides for a trip (mine → household → community) and
  // merge them over the device-local cache. Best-effort; a no-op when signed
  // out, offline, or sync is unconfigured.
  const syncAisleOverrides = useCallback(async (storeId, itemNames, listId) => {
    if (!user || !navigator.onLine || !Array.isArray(itemNames) || itemNames.length === 0) return;
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
    if (user) {
      const token = await getAccessToken();
      if (token) deleteListRemote(token, id).catch(() => {});
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
  const frequentItems = useMemo(() => {
    if (!currentList) return [];
    const counts = {};
    completedLists.forEach((l) => l.items.forEach((it) => {
      counts[it.name] = (counts[it.name] || 0) + 1;
    }));
    const onList = new Set(currentList.items.map((it) => it.name));
    return Object.entries(counts)
      .filter(([name]) => !onList.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [completedLists, currentList]);

  const purchaseHistory = useMemo(() => groupPurchaseHistory(completedLists), [completedLists]);

  // ---- server sync (signed-in only) ----

  const pushDirty = useCallback(async () => {
    if (!user || dirtyIds.current.size === 0 || !navigator.onLine) return;
    const token = await getAccessToken();
    if (!token) return;
    const current = loadState('lists', []);
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
      } catch { /* stays dirty; retried next cycle */ }
    }
    saveState('dirtyListIds', [...dirtyIds.current]);
  }, [user]);

  const pullRemote = useCallback(async () => {
    if (!user || !navigator.onLine) return;
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
    pushTimer.current = setTimeout(pushDirty, 1500);
    return () => clearTimeout(pushTimer.current);
  }, [lists, user, pushDirty]);

  // When connectivity returns, flush edits queued while offline, then pull
  useEffect(() => {
    if (!user) return;
    const onOnline = () => { pushDirty().then(pullRemote); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user, pushDirty, pullRemote]);

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
    addItems,
    removeItem,
    editItem,
    createList,
    deleteList,
    completeList,
    adoptRemoteList,
    frequentItems,
    purchaseHistory,
    pullRemote,
    aisleOverrides,
    setAisleOverride,
    clearAisleOverride,
    syncAisleOverrides,
  };
};

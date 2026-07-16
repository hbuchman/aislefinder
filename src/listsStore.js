import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchLists, pushList, deleteListRemote } from './api';
import { getAccessToken } from './auth';
import { itemsHash } from './listUtils';

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
    organizedBy: null,      // 'aisle' | 'category'
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

// Main store hook. `user` is the auth user (null in guest mode); when signed
// in, changes sync to the backend and remote changes are polled in.
export const useLists = (user) => {
  const [lists, setLists] = useState(initialLists);
  const [currentListId, setCurrentListId] = useState(() => loadState('currentListId', null));
  const dirtyIds = useRef(new Set(loadState('dirtyListIds', [])));
  const pushTimer = useRef(null);

  useEffect(() => { saveState('lists', lists); }, [lists]);
  useEffect(() => { saveState('currentListId', currentListId); }, [currentListId]);

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

  // "Shop again": copy a completed list into a new active list, keeping its
  // organized output so shop mode can start instantly.
  const reshopList = useCallback((sourceId) => {
    const source = lists.find((l) => l.id === sourceId);
    if (!source) return null;
    const copy = newList(source.name);
    copy.items = source.items.map((it) => newItem(it.name, null, completedLabel(source.completedAt)));
    copy.store = source.store;
    copy.organized = source.organized;
    // Item names match the source, so its organized output is still valid
    copy.organizedForHash = source.organized ? itemsHash(copy.items) : null;
    copy.organizedBy = source.organizedBy;
    copy.customCategoryOrder = source.customCategoryOrder;
    setLists((prev) => [copy, ...prev]);
    setCurrentListId(copy.id);
    markDirty(copy.id);
    return copy;
  }, [lists, markDirty]);

  // "Add to current list": merge a past list's items into the current one.
  const mergeIntoCurrent = useCallback((sourceId) => {
    const source = lists.find((l) => l.id === sourceId);
    if (!source || !currentList) return 0;
    const existing = new Set(currentList.items.map((it) => it.name));
    const fresh = source.items.filter((it) => !existing.has(it.name));
    if (fresh.length > 0) {
      updateList(currentList.id, (l) => ({
        items: [
          ...fresh.map((it) => newItem(it.name, user ? user.displayName : null, completedLabel(source.completedAt))),
          ...l.items,
        ],
      }));
    }
    return fresh.length;
  }, [lists, currentList, updateList, user]);

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
      .slice(0, 6)
      .map(([name]) => name);
  }, [completedLists, currentList]);

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
    removeItem,
    createList,
    deleteList,
    completeList,
    reshopList,
    mergeIntoCurrent,
    adoptRemoteList,
    frequentItems,
    pullRemote,
  };
};

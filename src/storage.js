// Persistent app storage. localStorage is the synchronous source of truth the
// UI reads from; on iOS/Android every write is mirrored into Capacitor
// Preferences (UserDefaults / SharedPreferences), which the OS never evicts
// the way it can evict WebView localStorage. hydrateStorage() restores the
// mirror into localStorage on launch, so lists survive offline and across
// WebView data eviction.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const isNative = Capacitor.isNativePlatform();
const PREFIX = 'af_';

export const loadState = (key, fallback) => {
  try {
    const saved = localStorage.getItem(`${PREFIX}${key}`);
    if (saved === null) return fallback;
    return JSON.parse(saved);
  } catch { return fallback; }
};

// Preferences writes cross the native bridge, so coalesce rapid saves of the
// same key (every keystroke updates af_lists) into one write. Exported so
// other modules that manage their own localStorage keys outside the af_
// namespace (e.g. auth.js's Cognito token storage) can get the same
// eviction-proofing without duplicating the debounce/bridge logic.
const pendingMirror = new Map();

export const mirrorToNative = (fullKey, json) => {
  if (!isNative) return;
  clearTimeout(pendingMirror.get(fullKey));
  pendingMirror.set(fullKey, setTimeout(() => {
    pendingMirror.delete(fullKey);
    Preferences.set({ key: fullKey, value: json }).catch(() => {});
  }, 400));
};

export const mirrorRemoveFromNative = (fullKey) => {
  if (!isNative) return;
  clearTimeout(pendingMirror.get(fullKey));
  pendingMirror.delete(fullKey);
  Preferences.remove({ key: fullKey }).catch(() => {});
};

export const saveState = (key, value) => {
  const fullKey = `${PREFIX}${key}`;
  let json;
  try { json = JSON.stringify(value); } catch { return; }
  try { localStorage.setItem(fullKey, json); } catch {}
  mirrorToNative(fullKey, json);
};

// Restore the durable native mirror into localStorage before first render.
// Preferences wins when both exist (localStorage may have been evicted);
// keys present only in localStorage (e.g. data from a build that predates the
// mirror) are seeded into Preferences so they become durable too.
// `extraPrefixes` lets other localStorage namespaces this module doesn't own
// (e.g. Cognito's own token keys, see auth.js) ride the same restore pass.
export const hydrateStorage = async (extraPrefixes = []) => {
  if (!isNative) return;
  const prefixes = [PREFIX, ...extraPrefixes];
  try {
    const { keys } = await Preferences.keys();
    const mirrored = new Set();
    for (const key of keys) {
      if (!prefixes.some((p) => key.startsWith(p))) continue;
      mirrored.add(key);
      const { value } = await Preferences.get({ key });
      if (value !== null) {
        try { localStorage.setItem(key, value); } catch {}
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p)) && !mirrored.has(key)) {
        Preferences.set({ key, value: localStorage.getItem(key) }).catch(() => {});
      }
    }
  } catch { /* fall back to whatever localStorage has */ }
};

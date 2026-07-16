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
// same key (every keystroke updates af_lists) into one write.
const pendingMirror = new Map();

const mirrorToNative = (fullKey, json) => {
  if (!isNative) return;
  clearTimeout(pendingMirror.get(fullKey));
  pendingMirror.set(fullKey, setTimeout(() => {
    pendingMirror.delete(fullKey);
    Preferences.set({ key: fullKey, value: json }).catch(() => {});
  }, 400));
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
export const hydrateStorage = async () => {
  if (!isNative) return;
  try {
    const { keys } = await Preferences.keys();
    const mirrored = new Set();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      mirrored.add(key);
      const { value } = await Preferences.get({ key });
      if (value !== null) {
        try { localStorage.setItem(key, value); } catch {}
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && !mirrored.has(key)) {
        Preferences.set({ key, value: localStorage.getItem(key) }).catch(() => {});
      }
    }
  } catch { /* fall back to whatever localStorage has */ }
};

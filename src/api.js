// Backend API helpers. All endpoints live on the Flask server locally and the
// Vercel serverless mirror in production.
const API_BASE = process.env.REACT_APP_API_URL || '';

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const processGroceryList = async ({ items, format, store }) => {
  const formData = new FormData();
  const blob = new Blob([items.join('\n')], { type: 'text/plain' });
  formData.append('file', blob, 'grocery-list.txt');
  formData.append('output_format', format);
  formData.append('store_id', store ? store.id : '01400943');
  formData.append('store', store ? store.name : '4500S Smiths');

  const response = await fetch(`${API_BASE}/api/process-grocery-list`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error('Couldn’t organize your list — try again');
  return response.text();
};

export const photoToItems = async (photoBlob) => {
  const formData = new FormData();
  formData.append('photo', photoBlob, 'grocery-list.jpg');

  const response = await fetch(`${API_BASE}/api/photo-to-list`, {
    method: 'POST',
    body: formData,
  });
  if (response.status === 503) throw new Error('Photo scanning isn’t available right now');
  if (response.status === 413) throw new Error('That photo is too large — try a smaller one');
  if (!response.ok) throw new Error('Couldn’t read that photo — try again');
  const result = await response.json();
  return result.items || [];
};

export const findStores = async (zipCode) => {
  const response = await fetch(`${API_BASE}/api/find-stores`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ zipCode }),
  });
  if (!response.ok) throw new Error("Couldn't find stores — check your connection and try again");
  const result = await response.json();
  return result.stores || [];
};

export const findItemAisle = async ({ item, store }) => {
  const response = await fetch(`${API_BASE}/api/find-item-aisle`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      item,
      store_id: store ? store.id : '01400943',
    }),
  });
  if (!response.ok) throw new Error("Couldn't look up that item");
  return response.json();
};

// Keyed the same way callers already did locally (store id + lowercased item)
// so repeat lookups — e.g. the item-info popup and then "Change aisle" opening
// the aisle-correction sheet for the same item — share one network call
// instead of each fetching it separately.
const itemDetailsCache = new Map();

export const fetchItemDetails = async ({ item, store }) => {
  const key = `${store ? store.id : 'default'}::${item.toLowerCase()}`;
  if (itemDetailsCache.has(key)) return itemDetailsCache.get(key);
  const response = await fetch(`${API_BASE}/api/item-details`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      item,
      store_id: store ? store.id : '01400943',
    }),
  });
  if (response.status === 404) { itemDetailsCache.set(key, []); return []; }
  if (!response.ok) throw new Error("Couldn't load item details");
  const data = await response.json();
  const results = data.results || [];
  itemDetailsCache.set(key, results);
  return results;
};

// The sound category vocabulary for the aisle-correction picker: normalized,
// shopper-facing names (matching the organizer's group headers) each with a
// food-safe `rank`. Store-agnostic and rarely changes, so it's fetched once
// per session rather than on every Shop-mode entry. Best-effort — an empty
// list just hides the browse section.
let categoriesCache = null;

export const fetchCategories = async () => {
  if (categoriesCache) return categoriesCache;
  try {
    const response = await fetch(`${API_BASE}/api/categories`);
    if (!response.ok) return [];
    const data = await response.json();
    categoriesCache = data.categories || [];
    return categoriesCache;
  } catch {
    return [];
  }
};

// ---- List sync/sharing (requires a signed-in user's Cognito access token) ----

export const fetchLists = async (token) => {
  const response = await fetch(`${API_BASE}/api/lists`, {
    headers: jsonHeaders(token),
  });
  if (response.status === 503) return null; // sync not configured on server
  if (!response.ok) throw new Error("Couldn't load your lists");
  const result = await response.json();
  return result.lists || [];
};

export const pushList = async (token, list) => {
  const response = await fetch(`${API_BASE}/api/lists/${encodeURIComponent(list.id)}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ list }),
  });
  if (response.status === 503) return null;
  if (!response.ok) throw new Error("Couldn't save your list");
  const result = await response.json();
  return result.list;
};

export const deleteListRemote = async (token, listId) => {
  const response = await fetch(`${API_BASE}/api/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
  if (response.status === 503) return null;
  if (!response.ok) throw new Error("Couldn't delete that list");
  return response.json();
};

export const deleteAccountRemote = async (token) => {
  const response = await fetch(`${API_BASE}/api/account`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
  if (response.status === 503) return null; // sync not configured on server
  if (!response.ok) throw new Error("Couldn't delete your account — try again");
  return response.json();
};

export const shareList = async (token, listId) => {
  const response = await fetch(`${API_BASE}/api/lists/${encodeURIComponent(listId)}/share`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  if (response.status === 503) throw new Error("Sharing isn't available right now");
  if (!response.ok) throw new Error("Couldn't create a share code — try again");
  return response.json(); // { code }
};

export const joinList = async (token, code) => {
  const response = await fetch(`${API_BASE}/api/lists/join`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ code }),
  });
  if (response.status === 503) throw new Error("Sharing isn't available right now");
  if (response.status === 404) throw new Error('No list found for that code');
  if (!response.ok) throw new Error("Couldn't join that list — try again");
  const result = await response.json();
  return result.list;
};

// Record (or clear, with placement=null) the signed-in shopper's aisle/category
// correction for one item at a store. Best-effort — returns null when sync is
// off so the device-local override still stands.
export const putAisleOverride = async (token, { storeId, item, placement, storeAisle }) => {
  const response = await fetch(`${API_BASE}/api/aisle-overrides`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ storeId, item, placement, storeAisle }),
  });
  if (response.status === 503) return null;
  if (!response.ok) throw new Error("Couldn't sync your aisle change");
  return response.json();
};

// Resolve the effective override for each item on a trip (mine → household →
// community). Returns { itemKey: {kind, value, source} }, or null if sync is off.
export const resolveAisleOverrides = async (token, { listId, storeId, items }) => {
  const response = await fetch(`${API_BASE}/api/aisle-overrides/resolve`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ listId, storeId, items }),
  });
  if (response.status === 503 || !response.ok) return null;
  const data = await response.json();
  return data.overrides || {};
};

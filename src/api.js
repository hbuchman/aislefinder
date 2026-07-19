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
  if (!response.ok) throw new Error('Failed to process grocery list');
  return response.text();
};

export const findStores = async (zipCode) => {
  const response = await fetch(`${API_BASE}/api/find-stores`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ zipCode }),
  });
  if (!response.ok) throw new Error('Failed to search stores');
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
  if (!response.ok) throw new Error('Failed to look up item');
  return response.json();
};

export const fetchItemDetails = async ({ item, store }) => {
  const response = await fetch(`${API_BASE}/api/item-details`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      item,
      store_id: store ? store.id : '01400943',
    }),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Failed to load item details');
  const data = await response.json();
  return data.results || [];
};

// ---- List sync/sharing (requires a signed-in user's Cognito access token) ----

export const fetchLists = async (token) => {
  const response = await fetch(`${API_BASE}/api/lists`, {
    headers: jsonHeaders(token),
  });
  if (response.status === 503) return null; // sync not configured on server
  if (!response.ok) throw new Error('Failed to fetch lists');
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
  if (!response.ok) throw new Error('Failed to save list');
  const result = await response.json();
  return result.list;
};

export const deleteListRemote = async (token, listId) => {
  const response = await fetch(`${API_BASE}/api/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
  if (response.status === 503) return null;
  if (!response.ok) throw new Error('Failed to delete list');
  return response.json();
};

export const shareList = async (token, listId) => {
  const response = await fetch(`${API_BASE}/api/lists/${encodeURIComponent(listId)}/share`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  if (response.status === 503) throw new Error('Sharing is not configured on the server');
  if (!response.ok) throw new Error('Failed to create share link');
  return response.json(); // { code }
};

export const joinList = async (token, code) => {
  const response = await fetch(`${API_BASE}/api/lists/join`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ code }),
  });
  if (response.status === 503) throw new Error('Sharing is not configured on the server');
  if (response.status === 404) throw new Error('No list found for that code');
  if (!response.ok) throw new Error('Failed to join list');
  const result = await response.json();
  return result.list;
};

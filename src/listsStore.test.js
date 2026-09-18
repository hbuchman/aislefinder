import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useLists, newItem } from './listsStore';

jest.mock('./auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('./api', () => ({
  putAisleOverride: jest.fn(),
  resolveAisleOverrides: jest.fn(),
}));

const { getAccessToken } = require('./auth');
const { putAisleOverride, resolveAisleOverrides } = require('./api');

// Minimal harness: renders the hook and exposes its return value on a ref so
// tests can call mutations and read back state without a UI.
const Harness = ({ storeRef, user = null }) => {
  storeRef.current = useLists(user);
  return null;
};

const setup = (user = null) => {
  const storeRef = { current: null };
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() => { root.render(<Harness storeRef={storeRef} user={user} />); });
  const rerender = () => act(() => { root.render(<Harness storeRef={storeRef} user={user} />); });
  return { storeRef, rerender };
};

beforeEach(() => {
  localStorage.clear();
  getAccessToken.mockReset().mockResolvedValue('test-token');
  putAisleOverride.mockReset();
  resolveAisleOverrides.mockReset();
});

it('finishing a shop early keeps unchecked items on an active list instead of deleting them', () => {
  const { storeRef, rerender } = setup();

  let listId;
  act(() => {
    const list = storeRef.current.createList('Groceries');
    listId = list.id;
    storeRef.current.addItem(listId, 'milk');
    storeRef.current.addItem(listId, 'eggs');
    storeRef.current.addItem(listId, 'bread');
  });
  rerender();

  // Check off only one item, mirroring ShopScreen's checkedItems shape
  act(() => {
    storeRef.current.updateList(listId, (l) => ({
      checkedItems: { 'Dairy::milk': true },
    }));
  });
  rerender();

  act(() => { storeRef.current.completeList(listId); });
  rerender();

  const { lists, currentList, completedLists } = storeRef.current;

  const completed = lists.find((l) => l.id === listId);
  expect(completed.status).toBe('completed');
  expect(completed.items.map((it) => it.name)).toEqual(['milk']);

  // Unchecked items must still exist somewhere, on an active list
  expect(currentList).not.toBeNull();
  expect(currentList.status).toBe('active');
  expect(currentList.items.map((it) => it.name).sort()).toEqual(['bread', 'eggs']);

  expect(completedLists.some((l) => l.id === listId)).toBe(true);
});

it('finishing a fully checked-off shop archives everything and starts a fresh empty list', () => {
  const { storeRef, rerender } = setup();

  let listId;
  act(() => {
    const list = storeRef.current.createList('Groceries');
    listId = list.id;
    storeRef.current.addItem(listId, 'milk');
  });
  rerender();

  act(() => {
    storeRef.current.updateList(listId, () => ({ checkedItems: { 'Dairy::milk': true } }));
  });
  rerender();

  act(() => { storeRef.current.completeList(listId); });
  rerender();

  const { currentList } = storeRef.current;
  expect(currentList.items).toHaveLength(0);
  expect(currentList.id).not.toBe(listId);
});

it('newItem still normalizes names the same way used to key checkedItems', () => {
  expect(newItem('  Milk ').name).toBe('milk');
});

it('a resync does not clobber an aisle correction still awaiting server confirmation', async () => {
  putAisleOverride.mockReturnValue(new Promise(() => {})); // never resolves — still "dirty"
  resolveAisleOverrides.mockResolvedValue({ milk: { kind: 'aisle', value: 3, source: 'community' } });

  const { storeRef, rerender } = setup({ sub: 'user-1' });

  await act(async () => {
    storeRef.current.setAisleOverride('store-1', 'milk', { kind: 'category', value: 'Dairy' });
  });
  rerender();

  await act(async () => {
    await storeRef.current.syncAisleOverrides('store-1', ['milk'], 'list-1');
  });
  rerender();

  expect(storeRef.current.aisleOverrides['store-1'].milk).toEqual({ kind: 'category', value: 'Dairy' });
});

it('a resync adopts the resolved placement once the local correction has confirmed as saved', async () => {
  putAisleOverride.mockResolvedValue({ ok: true });
  resolveAisleOverrides.mockResolvedValue({ milk: { kind: 'aisle', value: 3, source: 'community' } });

  const { storeRef, rerender } = setup({ sub: 'user-1' });

  await act(async () => {
    storeRef.current.setAisleOverride('store-1', 'milk', { kind: 'category', value: 'Dairy' });
  });
  // Let the (resolved) putAisleOverride promise's .then() clear the dirty key
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  rerender();

  await act(async () => {
    await storeRef.current.syncAisleOverrides('store-1', ['milk'], 'list-1');
  });
  rerender();

  expect(storeRef.current.aisleOverrides['store-1'].milk).toEqual({ kind: 'aisle', value: 3, source: 'community' });
});

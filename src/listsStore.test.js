import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useLists, newItem } from './listsStore';
import { saveState } from './storage';

jest.mock('./auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('./api', () => ({
  putAisleOverride: jest.fn(),
  resolveAisleOverrides: jest.fn(),
  fetchLists: jest.fn(),
  deleteListRemote: jest.fn(),
  pushList: jest.fn(),
}));

const { getAccessToken } = require('./auth');
const { putAisleOverride, resolveAisleOverrides, fetchLists, deleteListRemote, pushList } = require('./api');

// Minimal valid list record for tests that seed storage/remote state directly
// rather than going through createList.
const rawList = (overrides) => ({
  id: 'list-id',
  name: 'Groceries',
  status: 'active',
  items: [],
  store: null,
  organized: null,
  organizedBy: null,
  formatPreference: null,
  checkedItems: {},
  collapsedGroups: {},
  customCategoryOrder: null,
  shareCode: null,
  members: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  completedAt: null,
  ...overrides,
});

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
  fetchLists.mockReset().mockResolvedValue([]);
  deleteListRemote.mockReset().mockResolvedValue({});
  pushList.mockReset().mockResolvedValue({});
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

it('finishing a shop early merges leftovers into an existing active list with the same name instead of duplicating it', () => {
  const { storeRef, rerender } = setup();

  let listId;
  let otherId;
  act(() => {
    const list = storeRef.current.createList('Groceries');
    listId = list.id;
    storeRef.current.addItem(listId, 'milk');
    storeRef.current.addItem(listId, 'eggs');
  });
  rerender();
  act(() => {
    const other = storeRef.current.createList('Groceries');
    otherId = other.id;
    storeRef.current.addItem(otherId, 'bread');
  });
  rerender();

  act(() => {
    storeRef.current.updateList(listId, () => ({ checkedItems: { 'Dairy::milk': true } }));
  });
  rerender();

  act(() => { storeRef.current.completeList(listId); });
  rerender();

  const activeGroceries = storeRef.current.lists.filter((l) => l.status === 'active' && l.name === 'Groceries');
  expect(activeGroceries).toHaveLength(1);
  expect(activeGroceries[0].id).toBe(otherId);
  expect(activeGroceries[0].items.map((it) => it.name).sort()).toEqual(['bread', 'eggs']);
});

it('starting up with two active lists sharing a name merges them into one and archives the other into history', () => {
  const older = rawList({
    id: 'list-a',
    items: [newItem('milk')],
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  const newer = rawList({
    id: 'list-b',
    items: [newItem('eggs')],
    updatedAt: '2024-02-01T00:00:00.000Z',
  });
  saveState('lists', [older, newer]);

  const { storeRef } = setup();

  const active = storeRef.current.lists.filter((l) => l.name === 'Groceries' && l.status === 'active');
  expect(active).toHaveLength(1);
  expect(active[0].id).toBe('list-b');
  expect(active[0].items.map((it) => it.name).sort()).toEqual(['eggs', 'milk']);

  const archived = storeRef.current.lists.find((l) => l.id === 'list-a');
  expect(archived.status).toBe('completed');
});

it('pullRemote does not resurrect a list whose delete is still unconfirmed', async () => {
  fetchLists.mockResolvedValue([rawList({ id: 'list-x' })]);
  deleteListRemote.mockReturnValue(new Promise(() => {})); // never confirms — stays dirty

  const { storeRef, rerender } = setup({ sub: 'user-1' });

  await act(async () => {
    await storeRef.current.deleteList('list-x');
  });
  rerender();

  await act(async () => {
    await storeRef.current.pullRemote();
  });
  rerender();

  expect(storeRef.current.lists.some((l) => l.id === 'list-x')).toBe(false);
});

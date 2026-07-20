import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AisleFinder from './AisleFinder';

const render = () => {
  const div = document.createElement('div');
  document.body.appendChild(div);
  act(() => { createRoot(div).render(<AisleFinder />); });
  return div;
};

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

it('renders the current-list home screen in guest mode', () => {
  const div = render();
  expect(div.textContent).toContain('AisleFinder');
  expect(div.textContent).toContain('Guest');
  expect(div.textContent).toContain('Shop');
  expect(div.querySelector('input[placeholder*="Add an item"]')).not.toBeNull();
});

it('migrates the old single-list localStorage format', () => {
  localStorage.setItem('af_textInput', JSON.stringify('milk\neggs, bananas'));
  localStorage.setItem('af_groceryList', JSON.stringify('## Dairy\n- milk\n- eggs\n\n## Produce\n- bananas'));
  const div = render();
  expect(div.textContent).toContain('milk');
  expect(div.textContent).toContain('eggs');
  expect(div.textContent).toContain('bananas');
  // Migrated list is stored in the new multi-list format
  const lists = JSON.parse(localStorage.getItem('af_lists'));
  expect(lists).toHaveLength(1);
  expect(lists[0].items.map((it) => it.name).sort()).toEqual(['bananas', 'eggs', 'milk']);
  expect(lists[0].organized).toContain('## Dairy');
});

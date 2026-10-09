import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ListsSheet from './ListsSheet';

global.IS_REACT_ACT_ENVIRONMENT = true;

const existingList = { id: 'list-1', items: [], store: null };

const baseProps = (overrides = {}) => ({
  open: true,
  onClose: jest.fn(),
  listGroups: [{ name: 'Test', list: existingList, isActive: true }],
  currentListId: 'list-1',
  onSelectList: jest.fn(),
  onReopenList: jest.fn(),
  onCreateList: jest.fn(),
  onDeleteList: jest.fn(),
  toast: jest.fn(),
  ...overrides,
});

const render = (props) => {
  const div = document.createElement('div');
  document.body.appendChild(div);
  act(() => { createRoot(div).render(<ListsSheet {...props} />); });
  return div;
};

const setInput = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const button = (div, label) => [...div.querySelectorAll('button')].find((b) => b.textContent.includes(label));

beforeEach(() => { document.body.innerHTML = ''; });

it('creates a list with a unique name', () => {
  const props = baseProps();
  const div = render(props);

  click(button(div, 'New List'));
  setInput(div.querySelector('input[type="text"]'), 'Costco');
  click(button(div, 'Create'));

  expect(props.onCreateList).toHaveBeenCalledWith('Costco');
});

it('blocks creating a second active list with a name already in use and offers Switch/Rename', () => {
  const props = baseProps();
  const div = render(props);

  click(button(div, 'New List'));
  setInput(div.querySelector('input[type="text"]'), 'Test');
  click(button(div, 'Create'));

  expect(props.onCreateList).not.toHaveBeenCalled();
  expect(props.toast).toHaveBeenCalledTimes(1);
  const [message, { actions }] = props.toast.mock.calls[0];
  expect(message).toContain('Test');
  expect(actions.map((a) => a.label)).toEqual(['Switch to Existing', 'Rename']);

  // "Switch to Existing" selects the existing list behind the name
  act(() => { actions[0].onClick(); });
  expect(props.onSelectList).toHaveBeenCalledWith('list-1');

  // "Rename" keeps the input open, prefilled with a suggested alternate name
  act(() => { actions[1].onClick(); });
  const input = div.querySelector('input[type="text"]');
  expect(input).not.toBeNull();
  expect(input.value).toBe('Test (copy)');
});

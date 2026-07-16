import {
  parseGroceryListToGroups,
  buildMarkdownFromGroups,
  formatGroceryListForCopy,
  applyCustomOrder,
  itemsHash,
} from './listUtils';

const MARKDOWN = '## Produce\n- bananas\n- apples\n\n## Aisle 5\n- rice';

describe('parseGroceryListToGroups', () => {
  it('parses headers and items into groups', () => {
    expect(parseGroceryListToGroups(MARKDOWN)).toEqual([
      { name: 'Produce', items: ['bananas', 'apples'] },
      { name: 'Aisle 5', items: ['rice'] },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseGroceryListToGroups('')).toEqual([]);
    expect(parseGroceryListToGroups(null)).toEqual([]);
  });

  it('ignores items before the first header', () => {
    expect(parseGroceryListToGroups('- stray\n## Produce\n- bananas')).toEqual([
      { name: 'Produce', items: ['bananas'] },
    ]);
  });
});

describe('buildMarkdownFromGroups', () => {
  it('round-trips with parseGroceryListToGroups', () => {
    expect(buildMarkdownFromGroups(parseGroceryListToGroups(MARKDOWN))).toBe(MARKDOWN);
  });
});

describe('formatGroceryListForCopy', () => {
  it('numbers items continuously across groups', () => {
    expect(formatGroceryListForCopy(MARKDOWN, 'numbered')).toBe(
      'Produce\n1. bananas\n2. apples\n\nAisle 5\n3. rice'
    );
  });

  it('strips markdown for plain format', () => {
    expect(formatGroceryListForCopy(MARKDOWN, 'plain')).toBe(
      'Produce\nbananas\napples\n\nAisle 5\nrice'
    );
  });

  it('converts to checkboxes for checklist format', () => {
    expect(formatGroceryListForCopy(MARKDOWN, 'checklist')).toBe(
      'Produce\n- [ ] bananas\n- [ ] apples\n\nAisle 5\n- [ ] rice'
    );
  });

  it('returns the input unchanged for unknown formats', () => {
    expect(formatGroceryListForCopy(MARKDOWN, 'markdown')).toBe(MARKDOWN);
  });
});

describe('applyCustomOrder', () => {
  const groups = [
    { name: 'Produce', items: [] },
    { name: 'Dairy', items: [] },
    { name: 'Aisle 5', items: [] },
  ];

  it('sorts groups by the saved custom order', () => {
    const ordered = applyCustomOrder(groups, ['Dairy', 'Aisle 5', 'Produce']);
    expect(ordered.map((g) => g.name)).toEqual(['Dairy', 'Aisle 5', 'Produce']);
  });

  it('puts groups not in the custom order last, alphabetically', () => {
    const ordered = applyCustomOrder(groups, ['Dairy']);
    expect(ordered.map((g) => g.name)).toEqual(['Dairy', 'Aisle 5', 'Produce']);
  });

  it('returns groups unchanged without a custom order', () => {
    expect(applyCustomOrder(groups, null)).toEqual(groups);
    expect(applyCustomOrder(groups, [])).toEqual(groups);
  });

  it('does not mutate the input array', () => {
    const before = groups.map((g) => g.name);
    applyCustomOrder(groups, ['Aisle 5']);
    expect(groups.map((g) => g.name)).toEqual(before);
  });
});

describe('itemsHash', () => {
  it('is order-independent', () => {
    const a = [{ name: 'milk' }, { name: 'eggs' }];
    const b = [{ name: 'eggs' }, { name: 'milk' }];
    expect(itemsHash(a)).toBe(itemsHash(b));
  });

  it('changes when items change', () => {
    expect(itemsHash([{ name: 'milk' }])).not.toBe(itemsHash([{ name: 'milk' }, { name: 'eggs' }]));
  });
});

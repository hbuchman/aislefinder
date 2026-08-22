import {
  parseGroceryListToGroups,
  buildMarkdownFromGroups,
  formatGroceryListForCopy,
  applyCustomOrder,
  itemsHash,
  parseListItems,
  applyAisleOverrides,
  overrideGroupName,
  sectionSortKey,
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

describe('parseListItems', () => {
  it('splits on newlines', () => {
    expect(parseListItems('milk\neggs\nbread')).toEqual(['milk', 'eggs', 'bread']);
  });

  it('splits on commas', () => {
    expect(parseListItems('milk, eggs, bread')).toEqual(['milk', 'eggs', 'bread']);
  });

  it('splits on a mix of newlines and commas', () => {
    expect(parseListItems('milk, eggs\nbread\nrice, beans')).toEqual(
      ['milk', 'eggs', 'bread', 'rice', 'beans']
    );
  });

  it('strips bullets, checkboxes, numbering, and brackets', () => {
    expect(parseListItems('- milk\n* eggs\n+ bread\n• rice\n1. beans\n2) [cheese]\n- [ ] tofu\n- [x] tea'))
      .toEqual(['milk', 'eggs', 'bread', 'rice', 'beans', 'cheese', 'tofu', 'tea']);
  });

  it('drops blank lines and empty entries', () => {
    expect(parseListItems('milk\n\n, eggs, ')).toEqual(['milk', 'eggs']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseListItems('')).toEqual([]);
    expect(parseListItems(null)).toEqual([]);
  });
});

describe('overrideGroupName', () => {
  it('maps each placement kind to its group header', () => {
    expect(overrideGroupName({ kind: 'aisle', value: 14 })).toBe('Aisle 14');
    expect(overrideGroupName({ kind: 'category', value: 'Spices & Seasonings' })).toBe('Spices & Seasonings');
    expect(overrideGroupName({ kind: 'none' })).toBe('Not Found');
    expect(overrideGroupName(null)).toBeNull();
  });
});

describe('sectionSortKey', () => {
  it('orders fresh depts, named categories, aisles, cold, then Not Found', () => {
    const order = ['Produce', 'Snacks', 'Aisle 3', 'Aisle 12', 'Dairy', 'Frozen', 'Not Found'];
    const shuffled = ['Frozen', 'Aisle 12', 'Not Found', 'Produce', 'Aisle 3', 'Dairy', 'Snacks'];
    const sorted = [...shuffled].sort((a, b) => {
      const ka = sectionSortKey(a); const kb = sectionSortKey(b);
      for (let i = 0; i < 3; i += 1) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
      return 0;
    });
    expect(sorted).toEqual(order);
  });
});

describe('applyAisleOverrides', () => {
  const groups = () => [
    { name: 'Aisle 7', items: ['pasta', 'olive oil'] },
    { name: 'Not Found', items: ['saffron', "za'atar"] },
  ];

  it('returns groups unchanged when there are no overrides', () => {
    expect(applyAisleOverrides(groups(), {})).toEqual(groups());
    expect(applyAisleOverrides(groups(), null)).toEqual(groups());
  });

  it('moves a Not Found item into a new aisle group in food-safe order', () => {
    const result = applyAisleOverrides(groups(), { saffron: { kind: 'aisle', value: 14 } });
    expect(result).toEqual([
      { name: 'Aisle 7', items: ['pasta', 'olive oil'] },
      { name: 'Aisle 14', items: ['saffron'] },
      { name: 'Not Found', items: ["za'atar"] },
    ]);
  });

  it('merges items sent to the same aisle and drops emptied groups', () => {
    const result = applyAisleOverrides(groups(), {
      saffron: { kind: 'aisle', value: 7 },
      "za'atar": { kind: 'aisle', value: 7 },
    });
    expect(result).toEqual([
      { name: 'Aisle 7', items: ['pasta', 'olive oil', 'saffron', "za'atar"] },
    ]);
  });

  it('files an item under a Kroger category', () => {
    const result = applyAisleOverrides(groups(), { saffron: { kind: 'category', value: 'Produce' } });
    expect(result[0]).toEqual({ name: 'Produce', items: ['saffron'] });
    expect(result.find((g) => g.name === 'Not Found').items).toEqual(["za'atar"]);
  });

  it('ignores overrides for items not on the list', () => {
    const result = applyAisleOverrides(groups(), { cardamom: { kind: 'aisle', value: 9 } });
    expect(result).toEqual(groups());
  });
});

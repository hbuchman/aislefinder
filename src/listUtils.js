// Helpers for the backend's markdown list format (`## Group\n- item`)

export const parseGroceryListToGroups = (text) => {
  if (!text) return [];
  const groups = [];
  let currentGroup = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      currentGroup = { name: line.replace('## ', ''), items: [] };
      groups.push(currentGroup);
    } else if (line.startsWith('- ') && currentGroup) {
      currentGroup.items.push(line.replace('- ', ''));
    }
  }
  return groups;
};

export const buildMarkdownFromGroups = (groups) => {
  return groups.map((g) => {
    const header = `## ${g.name}`;
    const items = g.items.map((i) => `- ${i}`).join('\n');
    return `${header}\n${items}`;
  }).join('\n\n');
};

export const formatGroceryListForCopy = (list, outputFormat) => {
  switch (outputFormat) {
    case 'plain':
      return list.replace(/^## /gm, '').replace(/^- /gm, '');
    case 'numbered': {
      let counter = 1;
      return list.split('\n').map((line) => {
        if (line.startsWith('## ')) return line.replace('## ', '');
        if (line.startsWith('- ')) return `${counter++}. ${line.replace('- ', '')}`;
        return line;
      }).join('\n');
    }
    case 'checklist':
      return list.replace(/^## /gm, '').replace(/^- (.+)/gm, '- [ ] $1');
    default:
      return list;
  }
};

export const applyCustomOrder = (groups, customCategoryOrder) => {
  if (!customCategoryOrder || customCategoryOrder.length === 0) return groups;
  const orderMap = {};
  customCategoryOrder.forEach((name, index) => { orderMap[name] = index; });
  return [...groups].sort((a, b) => {
    const aIdx = orderMap[a.name] !== undefined ? orderMap[a.name] : customCategoryOrder.length;
    const bIdx = orderMap[b.name] !== undefined ? orderMap[b.name] : customCategoryOrder.length;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.name.localeCompare(b.name);
  });
};

// Food-safe section ordering, mirroring the backend OutputFormatter's
// _FIRST_SECTIONS/_LAST_SECTIONS exactly (grocery_organizer/src/output_formatting/
// output_formatter.py) so a client-created group (from an aisle/category
// override) lands in the same slot the server would have chosen. Buckets:
// fresh departments, generic named categories, numbered aisles, cold
// sections, then Not Found last.
const FIRST_SECTIONS = { produce: 0, bakery: 1, deli: 2, 'meat & seafood': 3, 'meat and seafood': 3 };
const LAST_SECTIONS = { dairy: 0, 'dairy products': 0, milk: 0, breakfast: 0, frozen: 1, 'frozen foods': 1, 'frozen section': 1 };

export const sectionSortKey = (name) => {
  if (name === 'Unsorted') return [-1, 0, name];
  if (name === 'Not Found') return [4, 0, name];
  const placement = placementFromGroupName(name);
  if (placement && placement.kind === 'aisle') return [2, placement.value, ''];
  const lower = name.toLowerCase();
  if (lower in FIRST_SECTIONS) return [0, FIRST_SECTIONS[lower], name];
  if (lower in LAST_SECTIONS) return [3, LAST_SECTIONS[lower], name];
  return [1, 0, name];
};

const compareSectionKeys = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

// The group header a placement belongs under. A placement is one of
// { kind: 'aisle', value: <number> } | { kind: 'category', value: <string> } |
// { kind: 'none' } (the shopper marked it not sold here → back to Not Found).
export const overrideGroupName = (placement) => {
  if (!placement) return null;
  if (placement.kind === 'aisle') return `Aisle ${placement.value}`;
  if (placement.kind === 'category') return placement.value;
  if (placement.kind === 'none') return 'Not Found';
  return null;
};

// The inverse of overrideGroupName: parses a group header back into the
// placement it represents ("Aisle 9" → aisle mode at 9; anything else → that
// category), or null for "Not Found"/"Unsorted"/empty — neither is a real
// placement a correction should be recorded against. Shared so the "Aisle N"
// pattern only needs to be recognized in one place.
export const placementFromGroupName = (name) => {
  if (!name || name === 'Not Found' || name === 'Unsorted') return null;
  const m = /^Aisle (\d+)$/.exec(name);
  if (m) return { kind: 'aisle', value: parseInt(m[1], 10) };
  return { kind: 'category', value: name };
};

// Normalizes an item name into the key overrides/checked-state maps use.
export const itemKey = (name) => (name || '').trim().toLowerCase();

// Re-applies a store's saved aisle/category overrides on top of the parsed
// groups, so a shopper's correction survives the backend re-organizing the
// list (which overwrites `organized`). Pure. `overrides` maps a lowercased
// item name to a placement (see overrideGroupName). Only items actually on the
// list are moved; empty groups are dropped and the result is re-sorted into
// food-safe order.
export const applyAisleOverrides = (groups, overrides) => {
  if (!overrides || Object.keys(overrides).length === 0) return groups;
  const working = groups.map((g) => ({ name: g.name, items: [...g.items] }));

  // Pull every overridden item out of wherever the backend placed it.
  const pulled = {}; // lowercased name -> original display string
  working.forEach((g) => {
    g.items = g.items.filter((item) => {
      const key = itemKey(item);
      if (key in overrides) { pulled[key] = item; return false; }
      return true;
    });
  });

  // Drop each into its overridden group, creating the group if needed.
  const byName = {};
  working.forEach((g) => { byName[g.name] = g; });
  Object.entries(pulled).forEach(([key, display]) => {
    const target = overrideGroupName(overrides[key]);
    if (!target) return; // malformed override — leave the item off, don't crash
    if (!byName[target]) {
      byName[target] = { name: target, items: [] };
      working.push(byName[target]);
    }
    byName[target].items.push(display);
  });

  return working
    .filter((g) => g.items.length > 0)
    .sort((a, b) => compareSectionKeys(sectionSortKey(a.name), sectionSortKey(b.name)));
};

// Builds a client-side approximation of the backend's organize step for use
// when offline: items with a remembered placement (from `itemHistory`, see
// listsStore.js) go into that group; anything never looked up before at this
// store/format goes into "Unsorted" rather than blocking the list. Pure —
// `historyForStore` is `{ [itemKey]: { aisle: {group}, category: {group} } }`.
export const buildOfflineOrganizedGroups = (items, format, historyForStore) => {
  const byGroup = new Map();
  const unsorted = [];
  items.forEach((it) => {
    const entry = historyForStore && historyForStore[itemKey(it.name)];
    const groupName = entry && entry[format] ? entry[format].group : null;
    if (!groupName) { unsorted.push(it.name); return; }
    if (!byGroup.has(groupName)) byGroup.set(groupName, []);
    byGroup.get(groupName).push(it.name);
  });
  const groups = [...byGroup.entries()].map(([name, groupItems]) => ({ name, items: groupItems }));
  if (unsorted.length > 0) groups.push({ name: 'Unsorted', items: unsorted });
  return groups.sort((a, b) => compareSectionKeys(sectionSortKey(a.name), sectionSortKey(b.name)));
};

// Re-keys a checkedItems map (keyed `${groupName}::${item}`) onto a new set of
// groups by item name, so check state survives an item moving to a different
// group — e.g. reconciling an offline-organized list against the real
// backend result once back online. Generalizes the single-item remap
// ShopScreen's drag handler already does ad hoc.
export const remapCheckedItems = (checkedItems, groups) => {
  const checkedByItem = new Set();
  Object.entries(checkedItems || {}).forEach(([key, checked]) => {
    if (!checked) return;
    const sep = key.indexOf('::');
    checkedByItem.add(itemKey(sep >= 0 ? key.slice(sep + 2) : key));
  });
  const next = {};
  groups.forEach((g) => {
    g.items.forEach((item) => {
      if (checkedByItem.has(itemKey(item))) next[`${g.name}::${item}`] = true;
    });
  });
  return next;
};

// Turns typed or pasted list text into individual item names. Supports
// comma- and newline-separated entries, and strips common list formatting
// (checkboxes, bullets, numbering, brackets) so a pasted list drops in clean.
export const parseListItems = (text) => {
  if (!text) return [];
  const items = [];
  for (const line of text.split('\n')) {
    for (const part of line.split(',')) {
      const cleaned = part
        .trim()
        .replace(/^[-*+]\s*\[[xX\s]*\]\s*/, '')
        .replace(/^[-*+•]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/[()[\]{}]/g, '')
        .trim();
      if (cleaned) items.push(cleaned);
    }
  }
  return items;
};

// Fingerprint of a list's items so we know when the organized markdown is stale
export const itemsHash = (items) => items.map((it) => it.name).sort().join('|');

// The format shop mode should organize by: the user's explicit choice
// (`formatPreference`) if they've made one, otherwise aisle when a store is
// picked and category when it isn't. A shopper can also explicitly choose
// aisle with no store picked (via StoreSheet's "skip" option) to organize
// purely by aisles they set themselves — see ShopScreen's `organize()`.
export const resolveOrganizeFormat = (list) =>
  list.formatPreference || (list.store ? 'aisle' : 'category');

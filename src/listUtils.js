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

// Fingerprint of a list's items so we know when the organized markdown is stale
export const itemsHash = (items) => items.map((it) => it.name).sort().join('|');

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import confetti from 'canvas-confetti';
import { processGroceryList, findItemAisle, fetchCategories } from '../api';
import { newItem } from '../listsStore';
import ItemInfoSheet from '../components/ItemInfoSheet';
import AisleSheet from '../components/AisleSheet';
import FormatToggle from '../components/FormatToggle';
import ShopSummary from './ShopSummary';
import {
  parseGroceryListToGroups,
  buildMarkdownFromGroups,
  formatGroceryListForCopy,
  applyCustomOrder,
  applyAisleOverrides,
  overrideGroupName,
  placementFromGroupName,
  itemKey,
  itemsHash,
  resolveOrganizeFormat,
} from '../listUtils';

// Badge shown next to an item with an aisle/category correction, describing
// who set it. Returns [label, tooltip] or null if the item has no override.
const overrideBadge = (ov) => {
  if (!ov) return null;
  if (ov.source === 'community') return [ov.agree ? `${ov.agree} shoppers` : 'community', 'Set by other shoppers at this store'];
  if (ov.source === 'household') return ['shared', 'Set by someone on this list'];
  return ['edited', 'You set this aisle'];
};

// One draggable aisle/category group with its collapsible item checklist
const ShopGroup = ({ group, index, collapsed, checkedItems, overrides = {}, onToggleCollapse, onToggleGroup, onToggleItem, onShowItemInfo, onSetAisle }) => {
  const complete = group.items.every((item) => checkedItems[`${group.name}::${item}`]);
  const checkedInGroup = group.items.filter((item) => checkedItems[`${group.name}::${item}`]).length;
  const isNotFound = group.name === 'Not Found';

  return (
    <Draggable draggableId={`shop-${group.name}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            ...provided.draggableProps.style,
            marginBottom: '10px',
            borderRadius: '6px',
            border: snapshot.isDragging ? '1px dashed var(--af-focus)' : '1px solid transparent',
            backgroundColor: snapshot.isDragging ? 'var(--af-highlight-bg)' : 'transparent',
          }}
        >
          <div
            {...provided.dragHandleProps}
            onClick={() => onToggleCollapse(group.name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              backgroundColor: complete ? 'var(--af-green)' : 'var(--af-surface)',
              borderRadius: '6px',
              cursor: 'grab',
              fontWeight: 600,
              fontSize: '13px',
              color: complete ? 'white' : 'var(--af-text)',
              transition: 'background-color 0.2s ease',
              // Touch drag needs the browser out of the way: no scroll
              // stealing, and no iOS long-press text-selection/callout
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
          >
            <i className="fa-solid fa-grip-vertical" style={{ color: complete ? 'rgba(255,255,255,0.6)' : 'var(--af-text-muted)', fontSize: '14px', flexShrink: 0 }} />
            <div
              onClick={(e) => { e.stopPropagation(); onToggleGroup(group); }}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${complete ? 'rgba(255,255,255,0.6)' : 'var(--af-text-muted)'}`,
                backgroundColor: complete ? 'rgba(255,255,255,0.25)' : 'var(--af-inset-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {complete && <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '11px' }} />}
            </div>
            <i className={collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'}
               style={{ fontSize: '10px', width: '12px' }} />
            {group.name}
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 400, color: complete ? 'rgba(255,255,255,0.8)' : 'var(--af-text-muted)' }}>
              {checkedInGroup}/{group.items.length}
            </span>
          </div>

          {!collapsed && (
            <Droppable droppableId={`items::${group.name}`} type="ITEM">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  style={{ paddingLeft: '12px', marginTop: '4px' }}
                >
                  {group.items.map((item, idx) => {
                    const checked = checkedItems[`${group.name}::${item}`];
                    const badge = overrideBadge(overrides[itemKey(item)]);
                    return (
                      <Draggable
                        key={`${group.name}::${item}::${idx}`}
                        draggableId={`item::${group.name}::${idx}::${item}`}
                        index={idx}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            onClick={() => onToggleItem(group.name, item)}
                            className="af-checklist-item"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: checked ? 'var(--af-text-faint)' : 'var(--af-text)',
                              textDecoration: checked ? 'line-through' : 'none',
                              borderRadius: '4px',
                              border: dragSnapshot.isDragging ? '1px dashed var(--af-focus)' : '1px solid transparent',
                              backgroundColor: dragSnapshot.isDragging ? 'var(--af-highlight-bg)' : undefined,
                              ...dragProvided.draggableProps.style,
                            }}
                          >
                            <span
                              {...dragProvided.dragHandleProps}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px',
                                margin: '-4px',
                                cursor: 'grab',
                                color: 'var(--af-text-muted)',
                                flexShrink: 0,
                                // Same touch-drag treatment as the group handle
                                touchAction: 'none',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                WebkitTouchCallout: 'none',
                              }}
                            >
                              <i className="fa-solid fa-grip-vertical" style={{ fontSize: '12px' }} />
                            </span>
                            <div style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: `2px solid ${checked ? 'var(--af-green)' : 'var(--af-text-muted)'}`,
                              backgroundColor: checked ? 'var(--af-green)' : 'var(--af-inset-bg)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              transition: 'all 0.2s ease',
                            }}>
                              {checked && <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '10px' }} />}
                            </div>
                            {item}
                            {badge && (
                              <span
                                title={badge[1]}
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: 'var(--af-green)',
                                  background: 'var(--af-highlight-bg)',
                                  padding: '1px 6px',
                                  borderRadius: '999px',
                                  marginLeft: '6px',
                                  flexShrink: 0,
                                }}
                              >
                                {badge[0]}
                              </span>
                            )}
                            {isNotFound ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onSetAisle(item); }}
                                style={{
                                  marginLeft: 'auto',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: 'white',
                                  background: 'var(--af-green)',
                                  border: 0,
                                  borderRadius: '999px',
                                  padding: '4px 10px',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  fontFamily: 'inherit',
                                }}
                              >
                                <i className="fa-solid fa-plus" style={{ marginRight: '5px' }} />
                                Set aisle
                              </button>
                            ) : (
                              <button
                                className="af-iteminfo"
                                title={`What is ${item}?`}
                                onClick={(e) => { e.stopPropagation(); onShowItemInfo(item); }}
                              >
                                <i className="fa-solid fa-circle-info" />
                              </button>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </div>
      )}
    </Draggable>
  );
};

// Modal for choosing the clipboard format used by the copy button
const CopyFormatPopup = ({ outputFormat, setOutputFormat, onClose }) => (
  <>
    <div className="af-settings-backdrop" onClick={onClose} />
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'var(--af-popup-bg)',
      border: '2px solid var(--af-border)',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: 'var(--af-shadow-lg)',
      zIndex: 1000,
      minWidth: '220px',
      maxWidth: 'calc(100vw - 40px)',
      color: 'var(--af-text)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--af-text)' }}>
          Copy Format
        </h4>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--af-text-muted)', fontSize: '16px', padding: '4px' }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[
          { value: 'numbered', label: 'Numbered List (1. 2. 3.)' },
          { value: 'checklist', label: 'Checklist (- [ ] Items)' },
          { value: 'plain', label: 'Plain Text' },
        ].map((opt) => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="radio"
              name="outputFormat"
              value={opt.value}
              checked={outputFormat === opt.value}
              onChange={(e) => setOutputFormat(e.target.value)}
              style={{ cursor: 'pointer' }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  </>
);

const ShopScreen = ({ list, updateList, completeList, outputFormat, setOutputFormat, onExit, onFinished, onShowStore, toast, aisleOverrides = {}, setAisleOverride, clearAisleOverride, syncAisleOverrides }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [singleItemQuery, setSingleItemQuery] = useState('');
  const [singleItemError, setSingleItemError] = useState(false);
  const [singleItemLoading, setSingleItemLoading] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [infoItem, setInfoItem] = useState(null);
  const [aisleSheet, setAisleSheet] = useState(null); // { item, currentGroupName }
  const [catalog, setCatalog] = useState([]);
  const hasFiredConfetti = useRef(false);
  const confettiCanvasRef = useRef(null);
  const confettiInstance = useRef(null);
  const organizedKey = useRef(null);
  const shopStartRef = useRef(null);
  const [checkTimestamps, setCheckTimestamps] = useState({});
  const [showSummary, setShowSummary] = useState(false);

  const listId = list ? list.id : null;
  const itemCount = list ? list.items.length : 0;
  const storeId = list && list.store ? list.store.id : 'default';
  const overridesForStore = useMemo(() => aisleOverrides[storeId] || {}, [aisleOverrides, storeId]);

  // The category vocabulary for the aisle sheet's picker (sound, store-agnostic)
  useEffect(() => { fetchCategories().then(setCatalog).catch(() => {}); }, []);

  // Pull synced overrides for this trip — the caller's own, a shared-list
  // member's, then community consensus — and merge them over the local cache.
  const itemsKey = list ? itemsHash(list.items) : '';
  useEffect(() => {
    if (!list || !syncAisleOverrides || list.items.length === 0) return;
    syncAisleOverrides(storeId, list.items.map((it) => it.name), list.id);
  }, [listId, storeId, itemsKey, syncAisleOverrides]);

  // Organize on entry, and again whenever the store or item set changes
  // since the last organize (e.g. picking a new store mid-shop)
  const organize = useCallback(async () => {
    if (!list) return;
    const hash = itemsHash(list.items);
    const format = resolveOrganizeFormat(list);
    organizedKey.current = `${hash}::${list.store ? list.store.id : ''}::${format}`;
    setLoading(true);
    setError('');
    try {
      const markdown = await processGroceryList({
        items: list.items.map((it) => it.name),
        format,
        store: list.store,
      });
      updateList(list.id, {
        organized: markdown,
        organizedBy: format,
        organizedForHash: hash,
        checkedItems: {},
        collapsedGroups: {},
      });
    } catch (err) {
      setError(err.message || "Couldn't organize your list — try again");
    } finally {
      setLoading(false);
    }
  }, [list, updateList]);

  useEffect(() => {
    if (!list) return;
    const hash = itemsHash(list.items);
    const format = resolveOrganizeFormat(list);
    const key = `${hash}::${list.store ? list.store.id : ''}::${format}`;
    if (
      (!list.organized || list.organizedForHash !== hash || list.organizedBy !== format)
      && organizedKey.current !== key
    ) {
      organize();
    }
  }, [list, organize]);

  // Explicit aisle/category switch, available mid-shop; overrides the
  // store-driven default and re-triggers the organize effect above
  const setFormat = (format) => {
    if (format === 'aisle' && !list.store) {
      onShowStore();
      return;
    }
    if (format === resolveOrganizeFormat(list)) return;
    updateList(listId, { formatPreference: format, customCategoryOrder: null });
  };

  // Lock body scroll while shopping (ported from the old overlay)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (confettiCanvasRef.current && !confettiInstance.current) {
      confettiInstance.current = confetti.create(confettiCanvasRef.current, { resize: true });
    }
    return () => {
      if (confettiInstance.current) {
        confettiInstance.current.reset();
        confettiInstance.current = null;
      }
    };
  }, []);

  const checkedItems = useMemo(() => (list ? list.checkedItems || {} : {}), [list]);
  const collapsedGroups = useMemo(() => (list ? list.collapsedGroups || {} : {}), [list]);

  const orderedGroups = useMemo(() => {
    if (!list || !list.organized) return [];
    const parsed = parseGroceryListToGroups(list.organized);
    const corrected = applyAisleOverrides(parsed, overridesForStore);
    return applyCustomOrder(corrected, list.customCategoryOrder);
  }, [list, overridesForStore]);

  const totalItems = useMemo(
    () => orderedGroups.reduce((sum, g) => sum + g.items.length, 0),
    [orderedGroups]
  );
  const checkedCount = useMemo(
    () => Object.values(checkedItems).filter(Boolean).length,
    [checkedItems]
  );

  // Groups that represent actual store locations (skip "Not Found" — no physical position)
  const routeGroups = useMemo(
    () => orderedGroups.filter(g => g.name !== 'Not Found'),
    [orderedGroups]
  );

  // Start the shop timer when the organized list is first ready
  useEffect(() => {
    if (!loading && !error && routeGroups.length > 0 && !shopStartRef.current) {
      shopStartRef.current = Date.now();
    }
  }, [loading, error, routeGroups.length]);

  // Confetti when the last item is checked, then drop straight into the
  // summary screen once it finishes — no "Finish" tap required. Skipped
  // whenever `organized` doesn't match the list's current items — a previous
  // shop session can leave stale, fully-checked data in place while this one
  // is (re)organizing or failed to organize, and that stale completeness
  // shouldn't fire confetti.
  const isStale = !list || !list.organized || list.organizedForHash !== itemsHash(list.items);
  useEffect(() => {
    if (loading || isStale) return;
    if (totalItems > 0 && checkedCount === totalItems && !hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      setTimeout(() => {
        const fire = confettiInstance.current;
        const duration = 3000;
        const end = Date.now() + duration;
        const frame = () => {
          if (fire) {
            fire({
              particleCount: 4,
              angle: 90,
              spread: 160,
              startVelocity: 25,
              origin: { x: Math.random(), y: 0 },
              colors: ['#1f5fa0', '#153f6e', '#a8c8ea', '#ffb52e'],
            });
          }
          if (Date.now() < end) {
            requestAnimationFrame(frame);
          } else {
            setShowSummary(true);
          }
        };
        frame();
      }, 0);
    }
    if (totalItems > 0 && checkedCount < totalItems) {
      hasFiredConfetti.current = false;
    }
  }, [checkedCount, totalItems, loading, isStale]);

  // Longest gap between consecutive checked-off items — the item that took
  // the longest to track down, used as the summary's headline stat in place
  // of a generic per-item average.
  const hardestToFind = useMemo(() => {
    if (!shopStartRef.current) return null;
    const entries = Object.entries(checkTimestamps).sort((a, b) => a[1] - b[1]);
    if (entries.length === 0) return null;
    let prevTime = shopStartRef.current;
    let best = null;
    for (const [key, time] of entries) {
      const gapMs = time - prevTime;
      if (!best || gapMs > best.gapMs) {
        best = { item: key.slice(key.indexOf('::') + 2), gapMs };
      }
      prevTime = time;
    }
    return best;
  }, [checkTimestamps]);

  // Auto-collapse a group once every item in it is checked, and drop any
  // stale manual override once it's no longer complete — otherwise a single
  // manual chevron-tap on a group (via toggleGroupCollapse) permanently pins
  // its collapsed state and it stops reacting to completion.
  const syncGroupCollapse = (collapsedGroups, groupName, nextChecked) => {
    const group = orderedGroups.find((g) => g.name === groupName);
    if (!group) return collapsedGroups;
    const isComplete = group.items.every((item) => nextChecked[`${groupName}::${item}`]);
    const next = { ...collapsedGroups };
    if (isComplete) {
      next[groupName] = true;
    } else {
      delete next[groupName];
    }
    return next;
  };

  const toggleItem = (groupName, itemName) => {
    const key = `${groupName}::${itemName}`;
    const isChecking = !checkedItems[key];

    setCheckTimestamps((prev) => {
      if (isChecking) return { ...prev, [key]: Date.now() };
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    updateList(listId, (l) => {
      const nextChecked = { ...(l.checkedItems || {}), [key]: !(l.checkedItems || {})[key] };
      return {
        checkedItems: nextChecked,
        collapsedGroups: syncGroupCollapse(l.collapsedGroups || {}, groupName, nextChecked),
      };
    });
  };

  const toggleGroup = (group) => {
    const allChecked = group.items.every((item) => checkedItems[`${group.name}::${item}`]);
    updateList(listId, (l) => {
      const updates = {};
      group.items.forEach((item) => { updates[`${group.name}::${item}`] = !allChecked; });
      const nextChecked = { ...(l.checkedItems || {}), ...updates };
      return {
        checkedItems: nextChecked,
        collapsedGroups: syncGroupCollapse(l.collapsedGroups || {}, group.name, nextChecked),
      };
    });
  };

  const toggleGroupCollapse = (groupName) => {
    updateList(listId, (l) => ({
      collapsedGroups: { ...(l.collapsedGroups || {}), [groupName]: !(l.collapsedGroups || {})[groupName] },
    }));
  };

  const isGroupComplete = (group) =>
    group.items.every((item) => checkedItems[`${group.name}::${item}`]);

  // Dragging a group changes the shopper's preferred section order — a plain
  // list-preference reorder, not a placement correction.
  const handleGroupDragEnd = ({ source, destination }) => {
    const reordered = Array.from(orderedGroups);
    const [removed] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, removed);
    updateList(listId, { customCategoryOrder: reordered.map((g) => g.name) });
  };

  // Dragging an item into a different group is an aisle/category correction:
  // it moves the item, carries its checked state and timing along, and
  // records the new placement so it survives the next re-organize. Dropping
  // into Not Found has no route position, so it sets no aisle.
  const handleItemDragEnd = ({ source, destination }) => {
    const sourceName = source.droppableId.slice('items::'.length);
    const destName = destination.droppableId.slice('items::'.length);
    const groups = orderedGroups.map((g) => ({ ...g, items: [...g.items] }));
    const sourceGroup = groups.find((g) => g.name === sourceName);
    const destGroup = groups.find((g) => g.name === destName);
    if (!sourceGroup || !destGroup) return;
    const [moved] = sourceGroup.items.splice(source.index, 1);
    destGroup.items.splice(destination.index, 0, moved);

    const movedGroups = sourceName !== destName;
    const oldKey = `${sourceName}::${moved}`;
    const newKey = `${destName}::${moved}`;

    updateList(listId, (l) => {
      const updates = {
        organized: buildMarkdownFromGroups(groups.filter((g) => g.items.length > 0)),
      };
      // Checked state is keyed by group, so a cross-group move carries it over
      if (movedGroups) {
        const checked = { ...(l.checkedItems || {}) };
        if (oldKey in checked) {
          checked[newKey] = checked[oldKey];
          delete checked[oldKey];
        }
        updates.checkedItems = checked;
      }
      return updates;
    });

    if (!movedGroups) return;
    setCheckTimestamps((prev) => {
      if (!(oldKey in prev)) return prev;
      const next = { ...prev, [newKey]: prev[oldKey] };
      delete next[oldKey];
      return next;
    });
    if (destName !== 'Not Found' && setAisleOverride) {
      setAisleOverride(storeId, moved, placementFromGroupName(destName));
    }
  };

  const handleDragEnd = (result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (type === 'ITEM') handleItemDragEnd(result);
    else handleGroupDragEnd(result);
  };

  // Quick lookup adds the item to both the organized markdown and the list model
  const lookupSingleItem = async () => {
    const query = singleItemQuery.trim();
    if (!query) return;
    setSingleItemLoading(true);
    setSingleItemError(false);
    try {
      const result = await findItemAisle({ item: query, store: list.store });
      if (result && !result.error) {
        // Match the list's grouping scheme: a category-organized list should
        // never grow an "Aisle N" section (and vice versa the aisle label
        // already falls back to category when the store has no aisle data)
        const groupName = list.organizedBy === 'category' && result.category !== 'Not Found'
          ? result.category
          : result.aisle;
        updateList(listId, (l) => {
          const groupHeader = `## ${groupName}`;
          const newLine = `- ${result.item}`;
          let organized = l.organized || '';
          if (organized.includes(groupHeader)) {
            const lines = organized.split('\n');
            const headerIdx = lines.findIndex((line) => line === groupHeader);
            let insertIdx = headerIdx + 1;
            while (insertIdx < lines.length && lines[insertIdx].startsWith('- ')) insertIdx++;
            lines.splice(insertIdx, 0, newLine);
            organized = lines.join('\n');
          } else {
            organized = organized.trimEnd() + `\n\n${groupHeader}\n${newLine}`;
          }
          const items = l.items.some((it) => it.name === query.toLowerCase())
            ? l.items
            : [newItem(query), ...l.items];
          return { organized, items, organizedForHash: itemsHash(items) };
        });
        hasFiredConfetti.current = false;
        setSingleItemQuery('');
      } else {
        setSingleItemError(true);
      }
    } catch {
      setSingleItemError(true);
    } finally {
      setSingleItemLoading(false);
    }
  };

  // The group an item currently sits in, so the aisle sheet opens pre-filled
  const currentGroupOf = (itemName) => {
    const key = itemKey(itemName);
    const g = orderedGroups.find((grp) => grp.items.some((it) => itemKey(it) === key));
    return g ? g.name : null;
  };

  const openAisleSheet = (itemName) => {
    setInfoItem(null);
    setAisleSheet({ item: itemName, currentGroupName: currentGroupOf(itemName) });
  };

  const saveAisleOverride = (placement) => {
    if (!aisleSheet || !setAisleOverride) return;
    const itemName = aisleSheet.item;
    setAisleOverride(storeId, itemName, placement);
    hasFiredConfetti.current = false; // a re-placed item may un-complete the list
    setAisleSheet(null);
    toast(placement.kind === 'none'
      ? `Removed ${itemName} from your route`
      : `${itemName} → ${overrideGroupName(placement)}`);
  };

  const clearCurrentOverride = () => {
    if (!aisleSheet || !clearAisleOverride) return;
    clearAisleOverride(storeId, aisleSheet.item);
    setAisleSheet(null);
    toast('Reset to the store’s aisle');
  };

  const copyToClipboard = async () => {
    try {
      const orderedMarkdown = buildMarkdownFromGroups(orderedGroups);
      await navigator.clipboard.writeText(formatGroceryListForCopy(orderedMarkdown, outputFormat));
      toast('Copied!');
    } catch {
      toast('Copy failed');
    }
  };

  const completeShopping = () => {
    completeList(listId);
    onFinished();
  };

  if (!list) return null;

  if (showSummary) {
    return (
      <ShopSummary
        totalItems={totalItems}
        checkedCount={checkedCount}
        shopStartTime={shopStartRef.current}
        hardestToFind={hardestToFind}
        list={list}
        onDone={completeShopping}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      <canvas
        ref={confettiCanvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10000,
        }}
      />

      {/* Sticky shop header */}
      <div style={{
        position: 'sticky',
        top: 0,
        backgroundColor: 'var(--af-bg)',
        zIndex: 10,
        borderBottom: '2px solid var(--af-border)',
        paddingTop: 'var(--safe-area-inset-top)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px' }}>
          <button className="af-backbtn" onClick={onExit}>
            <i className="fa-solid fa-chevron-left" style={{ marginRight: '5px', fontSize: '12px' }} />
            Exit
          </button>
          <h3 style={{
            margin: 0,
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--af-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: 1,
            marginLeft: '4px',
          }}>
            <i className="fa-solid fa-basket-shopping" style={{ color: 'var(--af-green)' }} />
            {list.store ? list.store.name : list.name}
          </h3>
          <div style={{ position: 'relative', display: 'flex', gap: '6px' }}>
            <button className="af-iconbtn" title="Change store" onClick={onShowStore}>
              <i className="fa-solid fa-location-dot" />
            </button>
            <button className="af-iconbtn" title="Copy list" onClick={copyToClipboard}>
              <i className="fa-solid fa-copy" />
            </button>
            <button className="af-iconbtn" title="Copy format" onClick={() => setShowSettingsPopup(!showSettingsPopup)}>
              <i className="fa-solid fa-cog" />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px 10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--af-text-faint)' }}>Organize by</span>
          <FormatToggle format={resolveOrganizeFormat(list)} onChange={setFormat} disabled={loading} aisleDisabled={!list.store} />
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '20px', fontSize: '24px' }}>
              {[
                { icon: 'fa-basket-shopping', color: 'var(--af-green-dark)' },
                { icon: 'fa-wheat-awn', color: 'var(--af-amber)' },
                { icon: 'fa-apple-whole', color: 'var(--af-green)' },
              ].map((item, i) => (
                <div key={i} className={`loading-icon-${i}`} style={{ color: item.color, opacity: 0.15 }}>
                  <i className={`fa-solid ${item.icon}`} />
                </div>
              ))}
            </div>
            <p style={{ margin: 0, color: 'var(--af-text)', fontSize: '14px', fontWeight: 500 }}>
              Organizing {itemCount} items{
                resolveOrganizeFormat(list) === 'aisle' ? ` for ${list.store.name}` : ' by category'
              }…
            </p>
          </div>
        )}

        {error && !loading && (
          <div style={{
            backgroundColor: 'var(--af-error-bg)',
            color: 'var(--af-error-text)',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '15px',
            fontSize: '12px',
            fontWeight: 500,
            border: '1px solid var(--af-error-border)',
          }}>
            {error}
            <button className="af-btn" style={{ display: 'block', marginTop: '10px' }} onClick={organize}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Progress bar */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--af-text)' }}>
                  {checkedCount}/{totalItems} items
                </span>
                {totalItems > 0 && checkedCount < totalItems && (
                  <button className="af-btn-sm af-btn-sm-green" onClick={() => setShowSummary(true)}>
                    Finish
                  </button>
                )}
              </div>
              <div style={{ height: '8px', backgroundColor: 'var(--af-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%`,
                  backgroundColor: 'var(--af-green)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {/* Single item quick lookup */}
            <div style={{
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: 'var(--af-highlight-bg)',
              borderRadius: '6px',
              border: '1px solid var(--af-highlight-border)',
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={singleItemQuery}
                  onChange={(e) => setSingleItemQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') lookupSingleItem(); }}
                  placeholder="Forgot something? Find its aisle"
                  className="af-input"
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    border: '2px solid var(--af-input-border)',
                    borderRadius: '6px',
                    outline: 'none',
                    transition: 'border-color 0.3s ease',
                    backgroundColor: 'var(--af-inset-bg)',
                    color: 'var(--af-text)',
                  }}
                />
                <button
                  onClick={lookupSingleItem}
                  disabled={singleItemLoading || !singleItemQuery.trim()}
                  className="af-btn"
                  style={{ padding: '6px 12px', fontSize: '11px' }}
                >
                  {singleItemLoading ? '…' : 'Find'}
                </button>
              </div>
              {singleItemError && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--af-error-text)', padding: '6px 8px', backgroundColor: 'var(--af-error-bg)', borderRadius: '4px' }}>
                  Couldn't find that item
                </div>
              )}
            </div>

            {/* Interactive checklist with drag-to-reorder */}
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="shop-category-list" type="GROUP">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {orderedGroups.map((group, index) => (
                      <ShopGroup
                        key={group.name}
                        group={group}
                        index={index}
                        collapsed={collapsedGroups[group.name] !== undefined
                          ? collapsedGroups[group.name]
                          : isGroupComplete(group)}
                        checkedItems={checkedItems}
                        overrides={overridesForStore}
                        onToggleCollapse={toggleGroupCollapse}
                        onToggleGroup={toggleGroup}
                        onToggleItem={toggleItem}
                        onShowItemInfo={setInfoItem}
                        onSetAisle={openAisleSheet}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </>
        )}
      </div>

      {/* Item help sheet — photo, description, and in-aisle location */}
      <ItemInfoSheet
        item={infoItem}
        store={list.store}
        onClose={() => setInfoItem(null)}
        onChangeAisle={openAisleSheet}
      />

      {/* Set or correct an item's aisle / category */}
      <AisleSheet
        item={aisleSheet ? aisleSheet.item : null}
        store={list.store}
        currentGroupName={aisleSheet ? aisleSheet.currentGroupName : null}
        override={aisleSheet ? (overridesForStore[itemKey(aisleSheet.item)] || null) : null}
        catalog={catalog}
        onSave={saveAisleOverride}
        onClear={clearCurrentOverride}
        onClose={() => setAisleSheet(null)}
      />

      {/* Output format popup */}
      {showSettingsPopup && (
        <CopyFormatPopup
          outputFormat={outputFormat}
          setOutputFormat={setOutputFormat}
          onClose={() => setShowSettingsPopup(false)}
        />
      )}
    </div>
  );
};

export default ShopScreen;

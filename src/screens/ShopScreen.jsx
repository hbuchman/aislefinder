import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import confetti from 'canvas-confetti';
import { processGroceryList, findItemAisle } from '../api';
import { newItem } from '../listsStore';
import ItemInfoSheet from '../components/ItemInfoSheet';
import {
  parseGroceryListToGroups,
  buildMarkdownFromGroups,
  formatGroceryListForCopy,
  applyCustomOrder,
  itemsHash,
} from '../listUtils';

// One draggable aisle/category group with its collapsible item checklist
const ShopGroup = ({ group, index, collapsed, checkedItems, onToggleCollapse, onToggleGroup, onToggleItem, onShowItemInfo }) => {
  const complete = group.items.every((item) => checkedItems[`${group.name}::${item}`]);
  const checkedInGroup = group.items.filter((item) => checkedItems[`${group.name}::${item}`]).length;

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
            <div style={{ paddingLeft: '12px', marginTop: '4px' }}>
              {group.items.map((item, idx) => {
                const checked = checkedItems[`${group.name}::${item}`];
                return (
                  <div
                    key={`${group.name}::${item}::${idx}`}
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
                      transition: 'all 0.2s ease',
                      borderRadius: '4px',
                    }}
                  >
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
                    <button
                      className="af-iteminfo"
                      title={`What is ${item}?`}
                      onClick={(e) => { e.stopPropagation(); onShowItemInfo(item); }}
                    >
                      <i className="fa-solid fa-circle-info" />
                    </button>
                  </div>
                );
              })}
            </div>
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

const ShopScreen = ({ list, updateList, completeList, outputFormat, setOutputFormat, onExit, onFinished }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [singleItemQuery, setSingleItemQuery] = useState('');
  const [singleItemError, setSingleItemError] = useState(false);
  const [singleItemLoading, setSingleItemLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [infoItem, setInfoItem] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const hasFiredConfetti = useRef(false);
  const confettiCanvasRef = useRef(null);
  const confettiInstance = useRef(null);
  const organizeStarted = useRef(false);

  const listId = list ? list.id : null;
  const itemCount = list ? list.items.length : 0;

  // Organize on entry when the list changed since the last organize
  const organize = useCallback(async () => {
    if (!list) return;
    const hash = itemsHash(list.items);
    setLoading(true);
    setError('');
    try {
      const format = list.store ? 'aisle' : 'category';
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
      setError('Error processing grocery list: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [list, updateList]);

  useEffect(() => {
    if (!list || organizeStarted.current) return;
    organizeStarted.current = true;
    const hash = itemsHash(list.items);
    if (!list.organized || list.organizedForHash !== hash) {
      organize();
    }
  }, [list, organize]);

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
    return applyCustomOrder(parseGroceryListToGroups(list.organized), list.customCategoryOrder);
  }, [list]);

  const totalItems = useMemo(
    () => orderedGroups.reduce((sum, g) => sum + g.items.length, 0),
    [orderedGroups]
  );
  const checkedCount = useMemo(
    () => Object.values(checkedItems).filter(Boolean).length,
    [checkedItems]
  );

  // Confetti when the last item is checked
  useEffect(() => {
    if (totalItems > 0 && checkedCount === totalItems && !hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      setShowCelebration(true);
      setTimeout(() => {
        const fire = confettiInstance.current;
        if (!fire) return;
        const duration = 3000;
        const end = Date.now() + duration;
        const frame = () => {
          fire({
            particleCount: 4,
            angle: 90,
            spread: 160,
            startVelocity: 25,
            origin: { x: Math.random(), y: 0 },
            colors: ['#27ae60', '#157a40', '#a3e9c2', '#ffc439'],
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      }, 0);
    }
    if (totalItems > 0 && checkedCount < totalItems) {
      hasFiredConfetti.current = false;
      setShowCelebration(false);
    }
  }, [checkedCount, totalItems]);

  const toggleItem = (groupName, itemName) => {
    const key = `${groupName}::${itemName}`;
    updateList(listId, (l) => ({
      checkedItems: { ...(l.checkedItems || {}), [key]: !(l.checkedItems || {})[key] },
    }));
  };

  const toggleGroup = (group) => {
    const allChecked = group.items.every((item) => checkedItems[`${group.name}::${item}`]);
    updateList(listId, (l) => {
      const updates = {};
      group.items.forEach((item) => { updates[`${group.name}::${item}`] = !allChecked; });
      return { checkedItems: { ...(l.checkedItems || {}), ...updates } };
    });
  };

  const toggleGroupCollapse = (groupName) => {
    updateList(listId, (l) => ({
      collapsedGroups: { ...(l.collapsedGroups || {}), [groupName]: !(l.collapsedGroups || {})[groupName] },
    }));
  };

  const isGroupComplete = (group) =>
    group.items.every((item) => checkedItems[`${group.name}::${item}`]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const reordered = Array.from(orderedGroups);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    updateList(listId, { customCategoryOrder: reordered.map((g) => g.name) });
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
        setShowCelebration(false);
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

  const copyToClipboard = async () => {
    try {
      const orderedMarkdown = buildMarkdownFromGroups(orderedGroups);
      await navigator.clipboard.writeText(formatGroceryListForCopy(orderedMarkdown, outputFormat));
      setCopyFeedback('Copied!');
    } catch {
      setCopyFeedback('Copy failed');
    }
    setTimeout(() => setCopyFeedback(''), 2000);
  };

  const finishShopping = () => {
    completeList(listId);
    onFinished();
  };

  if (!list) return null;

  const allDone = totalItems > 0 && checkedCount === totalItems;

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
            <button className="af-iconbtn" title="Copy list" onClick={copyToClipboard}>
              <i className="fa-solid fa-copy" />
            </button>
            <button className="af-iconbtn" title="Copy format" onClick={() => setShowSettingsPopup(!showSettingsPopup)}>
              <i className="fa-solid fa-cog" />
            </button>
            {copyFeedback && <span className="af-copy-toast">{copyFeedback}</span>}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '20px', fontSize: '24px' }}>
              {[
                { icon: 'fa-basket-shopping', color: 'var(--af-green-dark)' },
                { icon: 'fa-apple-whole', color: 'var(--af-green)' },
                { icon: 'fa-wheat-awn', color: 'var(--af-amber)' },
              ].map((item, i) => (
                <div key={i} className={`loading-icon-${i}`} style={{ color: item.color, opacity: 0.15 }}>
                  <i className={`fa-solid ${item.icon}`} />
                </div>
              ))}
            </div>
            <p style={{ margin: 0, color: 'var(--af-text)', fontSize: '14px', fontWeight: 500 }}>
              Organizing {itemCount} items{list.store ? ` for ${list.store.name}` : ' by category'}…
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
              <div style={{ marginBottom: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--af-text)' }}>
                  {checkedCount}/{totalItems} items
                </span>
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

            {/* Celebration banner */}
            {showCelebration && (
              <div style={{
                textAlign: 'center',
                padding: '20px',
                margin: '15px 0',
                background: 'var(--af-celebrate-bg)',
                borderRadius: '12px',
                border: '2px solid var(--af-green)',
                animation: 'celebrationFadeIn 0.5s ease-out',
              }}>
                <h3 style={{ margin: 0, color: 'var(--af-celebrate-text)', fontSize: '1.2rem' }}>
                  Shopping Complete!
                </h3>
              </div>
            )}

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
                  Could not find item
                </div>
              )}
            </div>

            {/* Interactive checklist with drag-to-reorder */}
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="shop-category-list">
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
                        onToggleCollapse={toggleGroupCollapse}
                        onToggleGroup={toggleGroup}
                        onToggleItem={toggleItem}
                        onShowItemInfo={setInfoItem}
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

      {/* Finish footer */}
      {!loading && !error && (
        <div style={{
          borderTop: '1px solid var(--af-border)',
          padding: '12px 16px calc(14px + var(--safe-area-inset-bottom))',
          background: 'var(--af-bg)',
        }}>
          <button
            className="af-btn-green"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '14px 24px',
              fontSize: '15px',
              borderRadius: '10px',
              opacity: allDone ? 1 : 0.85,
            }}
            onClick={finishShopping}
          >
            <i className="fa-solid fa-flag-checkered" />
            Finish
          </button>
        </div>
      )}

      {/* Item help sheet — photo, description, and in-aisle location */}
      <ItemInfoSheet item={infoItem} store={list.store} onClose={() => setInfoItem(null)} />

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

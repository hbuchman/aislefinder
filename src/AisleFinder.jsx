import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import confetti from 'canvas-confetti';

// localStorage helpers
const loadState = (key, fallback) => {
  try {
    const saved = localStorage.getItem(`af_${key}`);
    if (saved === null) return fallback;
    return JSON.parse(saved);
  } catch { return fallback; }
};

const saveState = (key, value) => {
  try { localStorage.setItem(`af_${key}`, JSON.stringify(value)); } catch {}
};

const AisleFinder = () => {
  // Persisted state (survives page refresh)
  const [textInput, setTextInput] = useState(() => loadState('textInput', ''));
  const [groceryList, setGroceryList] = useState(() => loadState('groceryList', ''));
  const [zipCode, setZipCode] = useState(() => loadState('zipCode', ''));
  const [stores, setStores] = useState(() => loadState('stores', []));
  const [selectedStore, setSelectedStore] = useState(() => loadState('selectedStore', null));
  const [organizeByCategory, setOrganizeByCategory] = useState(() => loadState('organizeByCategory', true));
  const [outputFormat, setOutputFormat] = useState(() => loadState('outputFormat', 'numbered'));
  const [shopMode, setShopMode] = useState(() => loadState('shopMode', false));
  const [checkedItems, setCheckedItems] = useState(() => loadState('checkedItems', {}));
  const [collapsedGroups, setCollapsedGroups] = useState(() => loadState('collapsedGroups', {}));
  const [customCategoryOrder, setCustomCategoryOrder] = useState(() => loadState('customCategoryOrder', null));

  // Transient state (resets on refresh)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storeSearchLoading, setStoreSearchLoading] = useState(false);
  const [hasSearchedStores, setHasSearchedStores] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [singleItemQuery, setSingleItemQuery] = useState('');
  const [singleItemResult, setSingleItemResult] = useState(null);
  const [singleItemLoading, setSingleItemLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const hasFiredConfetti = useRef(false);
  const confettiCanvasRef = useRef(null);
  const confettiInstance = useRef(null);
  const textareaRef = useRef(null);

  // Persist individual state values on change
  useEffect(() => { saveState('textInput', textInput); }, [textInput]);
  useEffect(() => { saveState('groceryList', groceryList); }, [groceryList]);
  useEffect(() => { saveState('zipCode', zipCode); }, [zipCode]);
  useEffect(() => { saveState('stores', stores); }, [stores]);
  useEffect(() => { saveState('selectedStore', selectedStore); }, [selectedStore]);
  useEffect(() => { saveState('organizeByCategory', organizeByCategory); }, [organizeByCategory]);
  useEffect(() => { saveState('outputFormat', outputFormat); }, [outputFormat]);
  useEffect(() => { saveState('shopMode', shopMode); }, [shopMode]);
  useEffect(() => { saveState('checkedItems', checkedItems); }, [checkedItems]);
  useEffect(() => { saveState('collapsedGroups', collapsedGroups); }, [collapsedGroups]);
  useEffect(() => { saveState('customCategoryOrder', customCategoryOrder); }, [customCategoryOrder]);

  // Lock body scroll when shop mode overlay is active
  useEffect(() => {
    if (shopMode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [shopMode]);

  // Create confetti instance bound to the overlay canvas
  useEffect(() => {
    if (confettiCanvasRef.current && !confettiInstance.current) {
      confettiInstance.current = confetti.create(confettiCanvasRef.current, { resize: true });
    }
  });

  // Clean up confetti instance when shop mode closes
  useEffect(() => {
    if (!shopMode && confettiInstance.current) {
      confettiInstance.current.reset();
      confettiInstance.current = null;
    }
  }, [shopMode]);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = window.innerHeight * 0.45;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, [textInput]);

  // Parse grocery list markdown into groups
  const parseGroceryListToGroups = useCallback((text) => {
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
  }, []);

  // Memoize total/checked counts
  const totalItems = useMemo(() => {
    return parseGroceryListToGroups(groceryList).reduce((sum, g) => sum + g.items.length, 0);
  }, [groceryList, parseGroceryListToGroups]);

  const checkedCount = useMemo(() => {
    return Object.values(checkedItems).filter(Boolean).length;
  }, [checkedItems]);

  // Confetti celebration when all items checked
  useEffect(() => {
    if (totalItems > 0 && checkedCount === totalItems && shopMode && !hasFiredConfetti.current) {
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
            colors: ['#5ae5e6', '#1E5F99', '#27ae60', '#ffc439']
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        };
        frame();
      }, 0);
    }

    if (totalItems > 0 && checkedCount < totalItems) {
      hasFiredConfetti.current = false;
      setShowCelebration(false);
    }
  }, [checkedItems, shopMode, totalItems, checkedCount]);

  const isValidZipCode = (zip) => /^\d{5}(-\d{4})?$/.test(zip.trim());

  const shouldShowZipError = (zip) => {
    const trimmed = zip.trim();
    if (!trimmed) return false;
    if (/^\d{1,5}$/.test(trimmed)) return false;
    if (/^\d{5}-\d{1,4}$/.test(trimmed)) return false;
    return !isValidZipCode(trimmed);
  };

  const searchStores = async () => {
    if (!zipCode.trim()) {
      setError('Please enter a zip code');
      return;
    }

    if (!isValidZipCode(zipCode)) {
      setHasSearchedStores(true);
      setStores([]);
      return;
    }

    setStoreSearchLoading(true);
    setError('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/find-stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ zipCode: zipCode.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to search stores');
      }

      const result = await response.json();
      setStores(result.stores || []);
      setHasSearchedStores(true);

      if (result.stores && result.stores.length > 0) {
        setSelectedStore(result.stores[0]);
      }
    } catch (err) {
      setError('Error searching stores: ' + err.message);
      setStores([]);
      setHasSearchedStores(true);
    } finally {
      setStoreSearchLoading(false);
    }
  };

  const processGroceryList = async (format) => {
    if (!textInput.trim()) {
      setError('Please enter grocery items');
      return;
    }

    setLoading(true);
    setError('');
    setGroceryList('');
    setShopMode(false);
    setCheckedItems({});
    setCollapsedGroups({});
    setSingleItemResult(null);
    setShowCelebration(false);
    hasFiredConfetti.current = false;

    try {
      const formData = new FormData();

      const blob = new Blob([textInput], { type: 'text/plain' });
      formData.append('file', blob, 'grocery-list.txt');

      formData.append('output_format', format);
      formData.append('store_id', selectedStore ? selectedStore.id : '01400943');
      formData.append('store', selectedStore ? selectedStore.name : '4500S Smiths');

      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/process-grocery-list`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process grocery list');
      }

      const result = await response.text();
      setGroceryList(result);
    } catch (err) {
      setError('Error processing grocery list: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getItemCount = () => {
    return textInput ? textInput.split(/[\n,]/).filter(item => item.trim()).length : 0;
  };

  // Apply user's custom category order to groups
  const applyCustomOrder = useCallback((groups) => {
    if (!customCategoryOrder || customCategoryOrder.length === 0) return groups;

    const orderMap = {};
    customCategoryOrder.forEach((name, index) => {
      orderMap[name] = index;
    });

    return [...groups].sort((a, b) => {
      const aIdx = orderMap[a.name] !== undefined ? orderMap[a.name] : customCategoryOrder.length;
      const bIdx = orderMap[b.name] !== undefined ? orderMap[b.name] : customCategoryOrder.length;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.name.localeCompare(b.name);
    });
  }, [customCategoryOrder]);

  // Memoize ordered groups
  const orderedGroups = useMemo(() => {
    if (!groceryList) return [];
    return applyCustomOrder(parseGroceryListToGroups(groceryList));
  }, [groceryList, customCategoryOrder, parseGroceryListToGroups, applyCustomOrder]);

  // Rebuild markdown from ordered groups (for clipboard)
  const buildMarkdownFromGroups = (groups) => {
    return groups.map(g => {
      const header = `## ${g.name}`;
      const items = g.items.map(i => `- ${i}`).join('\n');
      return `${header}\n${items}`;
    }).join('\n\n');
  };

  const copyToClipboard = async () => {
    try {
      const orderedMarkdown = buildMarkdownFromGroups(orderedGroups);
      const formattedList = formatGroceryListForCopy(orderedMarkdown);
      await navigator.clipboard.writeText(formattedList);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (err) {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  const formatGroceryListForCopy = (list) => {
    switch (outputFormat) {
      case 'plain':
        return list.replace(/^## /gm, '').replace(/^- /gm, '');
      case 'numbered':
        let counter = 1;
        return list.split('\n').map(line => {
          if (line.startsWith('## ')) return line.replace('## ', '');
          if (line.startsWith('- ')) return `${counter++}. ${line.replace('- ', '')}`;
          return line;
        }).join('\n');
      case 'checklist':
        return list.replace(/^## /gm, '').replace(/^- (.+)/gm, '- [ ] $1');
      default:
        return list;
    }
  };

  // Drag-and-drop handler
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const reordered = Array.from(orderedGroups);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    setCustomCategoryOrder(reordered.map(g => g.name));
  };

  const isGroupComplete = (group) => {
    return group.items.every(item => checkedItems[`${group.name}::${item}`]);
  };

  const toggleItem = (groupName, itemName) => {
    const key = `${groupName}::${itemName}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleGroup = (group) => {
    const allChecked = group.items.every(item => checkedItems[`${group.name}::${item}`]);
    const updates = {};
    group.items.forEach(item => {
      updates[`${group.name}::${item}`] = !allChecked;
    });
    setCheckedItems(prev => ({ ...prev, ...updates }));
  };

  const toggleGroupCollapse = (groupName) => {
    setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const addItemToList = (result) => {
    const groupName = result.aisle;
    const itemName = result.item;
    const groupHeader = `## ${groupName}`;
    const newItem = `- ${itemName}`;

    if (groceryList.includes(groupHeader)) {
      const lines = groceryList.split('\n');
      const headerIdx = lines.findIndex(line => line === groupHeader);
      let insertIdx = headerIdx + 1;
      while (insertIdx < lines.length && lines[insertIdx].startsWith('- ')) {
        insertIdx++;
      }
      lines.splice(insertIdx, 0, newItem);
      setGroceryList(lines.join('\n'));
    } else {
      setGroceryList(groceryList.trimEnd() + `\n\n${groupHeader}\n${newItem}`);
    }

    // Dismiss celebration when a new item is added
    setShowCelebration(false);
    hasFiredConfetti.current = false;

    setSingleItemQuery('');
    setSingleItemResult(null);
  };

  const lookupSingleItem = async () => {
    if (!singleItemQuery.trim()) return;
    setSingleItemLoading(true);
    setSingleItemResult(null);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/find-item-aisle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: singleItemQuery.trim(),
          store_id: selectedStore ? selectedStore.id : '01400943'
        })
      });
      if (!response.ok) throw new Error('Failed to look up item');
      const result = await response.json();
      if (result && !result.error) {
        addItemToList(result);
      } else {
        setSingleItemResult(result);
      }
    } catch (err) {
      setSingleItemResult({ error: err.message });
    } finally {
      setSingleItemLoading(false);
    }
  };

  // Render the interactive shop mode checklist content (used in overlay)
  const renderShopModeContent = () => (
    <>
      {/* Progress bar */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#2c3e50' }}>
            Progress: {checkedCount}/{totalItems} items
          </span>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0}%
          </span>
        </div>
        <div style={{
          height: '8px',
          backgroundColor: '#e9ecef',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%`,
            backgroundColor: '#27ae60',
            borderRadius: '4px',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Celebration banner */}
      {showCelebration && (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          margin: '15px 0',
          background: 'linear-gradient(135deg, #BCF0D3 0%, #f0f9ff 50%, #79E2A6 100%)',
          borderRadius: '12px',
          border: '2px solid #27ae60',
          animation: 'celebrationFadeIn 0.5s ease-out'
        }}>
          <h3 style={{ margin: '0', color: '#17893F', fontSize: '1.2rem' }}>
            Shopping Complete!
          </h3>
        </div>
      )}

      {/* Single Item Lookup */}
      <div style={{
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: '#f0f9ff',
        borderRadius: '6px',
        border: '1px solid #bee3f8'
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={singleItemQuery}
            onChange={(e) => setSingleItemQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') lookupSingleItem(); }}
            placeholder="Quick lookup: type an item to find its aisle"
            className="af-input"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '2px solid #e1e8ed',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              transition: 'border-color 0.3s ease'
            }}
          />
          <button
            onClick={lookupSingleItem}
            disabled={singleItemLoading || !singleItemQuery.trim()}
            className="af-btn"
            style={{
              padding: '6px 12px',
              fontSize: '11px'
            }}
          >
            {singleItemLoading ? '...' : 'Find'}
          </button>
        </div>
        {singleItemResult && singleItemResult.error && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#ff7730', padding: '6px 8px', backgroundColor: '#fff0e6', borderRadius: '4px' }}>
            Could not find item
          </div>
        )}
      </div>

      {/* Interactive checklist with drag-to-reorder */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="shop-category-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {orderedGroups.map((group, index) => {
                const complete = isGroupComplete(group);
                const collapsed = collapsedGroups[group.name] !== undefined
                  ? collapsedGroups[group.name]
                  : complete;

                return (
                  <Draggable key={group.name} draggableId={`shop-${group.name}`} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={{
                          ...provided.draggableProps.style,
                          marginBottom: '10px',
                          borderRadius: '6px',
                          border: snapshot.isDragging ? '1px dashed #0091AD' : '1px solid transparent',
                          backgroundColor: snapshot.isDragging ? '#f0f9ff' : 'transparent'
                        }}
                      >
                        <div
                          onClick={() => toggleGroupCollapse(group.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            backgroundColor: complete ? '#27ae60' : '#f8f9fa',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: complete ? 'white' : '#2c3e50',
                            transition: 'background-color 0.2s ease'
                          }}
                        >
                          <div
                            {...provided.dragHandleProps}
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center', cursor: 'grab', padding: '8px 4px 8px 0', margin: '-8px 0' }}
                          >
                            <i className="fa-solid fa-grip-vertical" style={{ color: complete ? 'rgba(255,255,255,0.6)' : '#bdc3c7', fontSize: '14px' }} />
                          </div>
                          <div
                            onClick={(e) => { e.stopPropagation(); toggleGroup(group); }}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              border: `2px solid ${complete ? 'rgba(255,255,255,0.6)' : '#bdc3c7'}`,
                              backgroundColor: complete ? 'rgba(255,255,255,0.25)' : 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {complete && (
                              <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '11px' }} />
                            )}
                          </div>
                          <i className={collapsed ? "fa-solid fa-chevron-right" : "fa-solid fa-chevron-down"}
                             style={{ fontSize: '10px', width: '12px' }} />
                          {group.name}
                          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '400', color: complete ? 'rgba(255,255,255,0.8)' : '#6c757d' }}>
                            {group.items.filter(item => checkedItems[`${group.name}::${item}`]).length}/{group.items.length}
                          </span>
                        </div>

                        {!collapsed && (
                          <div style={{ paddingLeft: '12px', marginTop: '4px' }}>
                            {group.items.map((item, idx) => (
                              <div
                                key={`${group.name}::${item}::${idx}`}
                                onClick={() => toggleItem(group.name, item)}
                                className="af-checklist-item"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  color: checkedItems[`${group.name}::${item}`] ? '#95a5a6' : '#2c3e50',
                                  textDecoration: checkedItems[`${group.name}::${item}`] ? 'line-through' : 'none',
                                  transition: 'all 0.2s ease',
                                  borderRadius: '4px'
                                }}
                              >
                                <div style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '4px',
                                  border: `2px solid ${checkedItems[`${group.name}::${item}`] ? '#27ae60' : '#bdc3c7'}`,
                                  backgroundColor: checkedItems[`${group.name}::${item}`] ? '#27ae60' : 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  transition: 'all 0.2s ease'
                                }}>
                                  {checkedItems[`${group.name}::${item}`] && (
                                    <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '10px' }} />
                                  )}
                                </div>
                                {item}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'white',
      padding: '10px',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      position: 'relative',
      colorScheme: 'light'
    }}>
      {/* Global styles for hover effects, animations, and mobile */}
      <style>{`
        .af-btn {
          background: #1E5F99;
          color: white;
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(110, 250, 251, 0.3);
        }
        .af-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(110, 250, 251, 0.4);
        }
        .af-btn:active:not(:disabled) {
          transform: translateY(0px);
        }
        .af-btn:disabled {
          background: #bdc3c7;
          cursor: not-allowed;
          box-shadow: none;
        }
        .af-btn-green {
          background: #27ae60;
          color: white;
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(110, 250, 251, 0.3);
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .af-btn-green:hover {
          background: linear-gradient(135deg, #2ecc71 0%, #1a9c4e 100%);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(39, 174, 96, 0.4);
        }
        .af-btn-green:active {
          transform: translateY(0px);
        }
        .af-link-paypal {
          display: inline-block;
          background: linear-gradient(135deg, #ffc439 0%, #ff7730 100%);
          color: white;
          padding: 3px 8px;
          border-radius: 3px;
          text-decoration: none;
          font-size: 9px;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 1px 3px rgba(255, 196, 57, 0.3);
        }
        .af-link-paypal:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(255, 196, 57, 0.4);
        }
        .af-link-bug {
          display: inline-block;
          background: linear-gradient(135deg, #ff4757 0%, #c44569 100%);
          color: white;
          padding: 3px 8px;
          border-radius: 3px;
          text-decoration: none;
          font-size: 9px;
          font-weight: 500;
          transition: all 0.3s ease;
          box-shadow: 0 1px 3px rgba(255, 71, 87, 0.3);
        }
        .af-link-bug:hover {
          background: linear-gradient(135deg, #ff3742 0%, #b03a5e 100%);
          box-shadow: 0 2px 6px rgba(255, 71, 87, 0.4);
          transform: translateY(-1px);
        }
        .af-input:focus {
          border-color: #0091AD !important;
        }
        .af-checklist-item:hover {
          background-color: #f8f9fa;
        }
        .af-settings-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.2);
          z-index: 999;
        }
        .af-copy-toast {
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          background: #2c3e50;
          color: white;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          pointer-events: none;
          animation: toastFade 2s ease-out forwards;
        }
        @keyframes toastFade {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes celebrationFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes iconPulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .loading-icon-0 { animation: iconPulse 2s ease-in-out 0.0s infinite; }
        .loading-icon-1 { animation: iconPulse 2s ease-in-out 0.4s infinite; }
        .loading-icon-2 { animation: iconPulse 2s ease-in-out 0.8s infinite; }
      `}</style>

      {/* Background shopping cart pattern — reduced count for mobile performance */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.08,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}>
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i % 5) * 20 + 5}%`,
              top: `${Math.floor(i / 5) * 25 + 5}%`,
              fontSize: '60px',
              color: '#6c757d',
              transform: `rotate(${(i % 4) * 15 - 22.5}deg)`,
              opacity: 0.6
            }}
          >
            <i className="fa-solid fa-cart-shopping"></i>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '15px',
          background: 'linear-gradient(135deg, #5ae5e6 0%, #1E5F99 100%)',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(46, 134, 171, 0.3)',
        }}>
          <h1 style={{
            color: 'white',
            margin: '0',
            fontSize: '1.5rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            <i className="fa-solid fa-list-check"></i>
            Aisle Finder
          </h1>
        </div>


        {/* Store Finder Section */}
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#2c3e50', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-map-location-dot"></i>
            Find my Kroger
          </h3>
          <p style={{ margin: '0 0 10px 0', fontSize: '10px', color: '#6c757d' }}>
            Includes Pick 'N Save, Harris Teeter, Ralphs, King Soopers, City Market, Dillons, Smith's, Fry's, QFC, and more
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="Enter ZIP code"
              className="af-input"
              style={{
                padding: '8px 12px',
                border: '2px solid #e1e8ed',
                borderRadius: '6px',
                fontSize: '13px',
                minWidth: '120px',
                flex: '1 1 150px',
                maxWidth: '200px',
                transition: 'border-color 0.3s ease',
                outline: 'none'
              }}
            />
            <button
              onClick={searchStores}
              disabled={storeSearchLoading}
              className="af-btn"
            >
              {storeSearchLoading ? 'Searching...' : 'Find Stores'}
            </button>
          </div>

          {stores.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#2c3e50' }}>
                Select Store:
              </label>
              <select
                value={selectedStore ? selectedStore.id : ''}
                onChange={(e) => {
                  const store = stores.find(s => s.id === e.target.value);
                  setSelectedStore(store);
                }}
                style={{
                  padding: '8px 12px',
                  border: '2px solid #0091AD',
                  borderRadius: '6px',
                  fontSize: '13px',
                  width: '100%',
                  backgroundColor: '#f0f9ff',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name} - {store.address} ({store.distance?.toFixed(1)} mi)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Show ZIP code validation error immediately */}
          {!storeSearchLoading && shouldShowZipError(zipCode) && (
            <div style={{
              marginTop: '10px',
              padding: '6px 8px',
              backgroundColor: '#fff0e6',
              borderRadius: '4px',
              border: '1px solid #ffd6b3'
            }}>
              <p style={{ margin: '0', fontSize: '10px', color: '#ff7730', fontWeight: '500' }}>
                Please enter a valid ZIP code (5 digits or 5 digits-4 digits)
              </p>
            </div>
          )}

          {/* Show no stores found message after search */}
          {!storeSearchLoading && hasSearchedStores && stores.length === 0 && zipCode && isValidZipCode(zipCode) && (
            <div style={{
              marginTop: '10px',
              padding: '6px 8px',
              backgroundColor: '#fff0e6',
              borderRadius: '4px',
              border: '1px solid #ffd6b3'
            }}>
              <p style={{ margin: '0', fontSize: '10px', color: '#ff7730', fontWeight: '500' }}>
                No stores found near ZIP code {zipCode}. Try a different ZIP code or organize by category.
              </p>
            </div>
          )}


        </div>

        {/* Grocery List Input Section */}
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-cart-shopping"></i>
            Your Grocery List
          </h3>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '13px', color: '#2c3e50' }}>
              Type or Paste Items:
            </label>
            <textarea
              ref={textareaRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter grocery items (one per line or comma-separated):&#10;milk, bread, eggs, apples"
              className="af-input"
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                border: '2px solid #e1e8ed',
                borderRadius: '6px',
                fontSize: '16px',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                resize: 'none',
                overflow: 'hidden',
                outline: 'none',
                transition: 'border-color 0.3s ease',
                backgroundColor: 'white',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Organization Buttons */}
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setOrganizeByCategory(true);
              processGroceryList('category');
            }}
            disabled={!textInput.trim() || loading}
            className="af-btn"
          >
            {loading && organizeByCategory ? 'Processing...' : 'Organize by Category'}
          </button>
          <button
            onClick={() => {
              if (!selectedStore) {
                setError('Please find and select a store for aisle organization');
                return;
              }
              setOrganizeByCategory(false);
              processGroceryList('aisle');
            }}
            disabled={!textInput.trim() || loading}
            className="af-btn"
          >
            {loading && !organizeByCategory ? 'Processing...' : 'Organize by Aisle'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#fff0e6',
            color: '#ff7730',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '15px',
            fontSize: '11px',
            fontWeight: '500',
            border: '1px solid #ffd6b3'
          }}>
            {error}
          </div>
        )}

        {/* Loading Animation */}
        {loading && (
          <div style={{
            marginTop: '15px',
            padding: '30px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            border: '1px solid #e9ecef',
            textAlign: 'center'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '20px',
              fontSize: '24px'
            }}>
              {[
                { icon: 'fa-basket-shopping', color: '#ff4757' },
                { icon: 'fa-apple-whole', color: '#2ecc71' },
                { icon: 'fa-wheat-awn', color: '#ffc439' }
              ].map((item, i) => (
                <div
                  key={i}
                  className={`loading-icon-${i}`}
                  style={{ color: item.color, opacity: 0.15 }}
                >
                  <i className={`fa-solid ${item.icon}`}></i>
                </div>
              ))}
            </div>

            <p style={{ margin: '0', color: '#2c3e50', fontSize: '14px', fontWeight: '500' }}>
              Processing {getItemCount()} items...
            </p>
          </div>
        )}

        {/* Results Section */}
        {groceryList && !loading && (
          <div style={{
            marginTop: '15px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: '0', color: '#2c3e50', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-list-check"></i>
                Your Organized Shopping List
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
                <button
                  onClick={copyToClipboard}
                  className="af-btn"
                >
                  Copy to Clipboard
                </button>
                {copyFeedback && (
                  <span className="af-copy-toast">{copyFeedback}</span>
                )}
                <button
                  onClick={() => setShowSettingsPopup(!showSettingsPopup)}
                  className="af-btn"
                  style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <i className="fa-solid fa-gear"></i>
                </button>
              </div>
            </div>

            {/* Draggable category groups */}
            <div style={{ textAlign: 'center', marginBottom: '15px' }}>
              <button
                onClick={() => setShopMode(true)}
                className="af-btn-green"
              >
                <i className="fa-solid fa-basket-shopping"></i>
                Shop
              </button>
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="category-list">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      backgroundColor: 'white',
                      padding: '15px',
                      borderRadius: '6px',
                      border: '2px solid #e9ecef',
                      minHeight: '300px',
                      color: '#2c3e50'
                    }}
                  >
                    {(() => {
                      let itemCounter = 0;
                      return orderedGroups.map((group, index) => (
                        <Draggable key={group.name} draggableId={group.name} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{
                                ...provided.draggableProps.style,
                                marginBottom: '12px',
                                backgroundColor: snapshot.isDragging ? '#f0f9ff' : 'transparent',
                                borderRadius: '6px',
                                border: snapshot.isDragging ? '1px dashed #0091AD' : '1px solid transparent',
                                padding: snapshot.isDragging ? '8px' : '0'
                              }}
                            >
                              <div
                                {...provided.dragHandleProps}
                                style={{
                                  fontWeight: 'bold',
                                  fontSize: '14px',
                                  color: '#2c3e50',
                                  margin: '12px 0 6px 0',
                                  padding: '4px 0',
                                  cursor: 'grab',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  userSelect: 'none'
                                }}
                              >
                                <i className="fa-solid fa-grip-vertical" style={{ color: '#bdc3c7', fontSize: '14px' }} />
                                {group.name}
                              </div>
                              {group.items.map((item, idx) => {
                                itemCounter++;
                                return (
                                  <div key={idx} style={{ margin: '2px 0', paddingLeft: '24px', fontSize: '12px', color: '#2c3e50' }}>
                                    {outputFormat === 'checklist' ? `\u2610 ${item}` :
                                     outputFormat === 'numbered' ? `${itemCounter}. ${item}` :
                                     item}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </Draggable>
                      ));
                    })()}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        )}

        {/* Footer with PayPal and Bug Report */}
        <div style={{
          marginTop: '10px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '8px',
          fontSize: '10px'
        }}>
          <a
            href="https://www.paypal.com/donate/?business=ECTSEQ2MFSE4Y&no_recurring=0&item_name=Thanks+for+supporting+Aisle+Finder%21+Your+donation+pays+for+development+and+hosting+costs.&currency_code=USD"
            target="_blank"
            rel="noopener noreferrer"
            className="af-link-paypal"
          >
            Support via PayPal
          </a>

          <a
            href="https://github.com/hbuchman/aislefinder/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="af-link-bug"
          >
            Report a Bug
          </a>
        </div>
      </div>

      {/* Settings Popup with backdrop */}
      {showSettingsPopup && (
        <>
          <div className="af-settings-backdrop" onClick={() => setShowSettingsPopup(false)} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: '220px',
            maxWidth: 'calc(100vw - 40px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: '0', fontSize: '14px', fontWeight: '600', color: '#2c3e50' }}>
                Output Format
              </h4>
              <button
                onClick={() => setShowSettingsPopup(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', fontSize: '16px', padding: '4px' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="outputFormat"
                  value="numbered"
                  checked={outputFormat === 'numbered'}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span>Numbered List (1. 2. 3.)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="outputFormat"
                  value="checklist"
                  checked={outputFormat === 'checklist'}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span>Checklist (- [ ] Items)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="outputFormat"
                  value="plain"
                  checked={outputFormat === 'plain'}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span>Plain Text</span>
              </label>
            </div>
          </div>
        </>
      )}

      {/* Shop Mode Fullscreen Overlay */}
      {shopMode && groceryList && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          backgroundColor: 'white',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        }}>
          {/* Confetti canvas - renders on top of the overlay */}
          <canvas
            ref={confettiCanvasRef}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 10000
            }}
          />
          {/* Sticky header */}
          <div style={{
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
            zIndex: 10,
            borderBottom: '2px solid #e9ecef',
            paddingTop: 'env(safe-area-inset-top, 0px)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              maxWidth: '900px',
              margin: '0 auto',
              padding: '12px 20px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: '600',
                color: '#2c3e50',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fa-solid fa-basket-shopping" style={{ color: '#27ae60' }}></i>
                Shop
              </h3>
              <button
                onClick={() => {
                  setShopMode(false);
                  setShowCelebration(false);
                  hasFiredConfetti.current = false;
                }}
                className="af-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="fa-solid fa-xmark"></i>
                Exit
              </button>
            </div>
          </div>

          {/* Scrollable shop mode content */}
          <div style={{
            maxWidth: '900px',
            margin: '0 auto',
            padding: '20px',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))'
          }}>
            {renderShopModeContent()}
          </div>
        </div>
      )}
    </div>
  );
};

export default AisleFinder;

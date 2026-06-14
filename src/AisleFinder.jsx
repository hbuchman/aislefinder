import React, { useState, useEffect, useRef } from 'react';

// localStorage helpers
const loadState = (key, fallback) => {
  try {
    const saved = localStorage.getItem(`af_${key}`);
    if (saved === null) return fallback;
    return JSON.parse(saved);
  } catch { return fallback; }
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

  // Transient state (resets on refresh)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storeSearchLoading, setStoreSearchLoading] = useState(false);
  const [hasSearchedStores, setHasSearchedStores] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [singleItemQuery, setSingleItemQuery] = useState('');
  const [singleItemResult, setSingleItemResult] = useState(null);
  const [singleItemLoading, setSingleItemLoading] = useState(false);
  const settingsRef = useRef(null);

  // Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('af_textInput', JSON.stringify(textInput));
      localStorage.setItem('af_groceryList', JSON.stringify(groceryList));
      localStorage.setItem('af_zipCode', JSON.stringify(zipCode));
      localStorage.setItem('af_stores', JSON.stringify(stores));
      localStorage.setItem('af_selectedStore', JSON.stringify(selectedStore));
      localStorage.setItem('af_organizeByCategory', JSON.stringify(organizeByCategory));
      localStorage.setItem('af_outputFormat', JSON.stringify(outputFormat));
      localStorage.setItem('af_shopMode', JSON.stringify(shopMode));
      localStorage.setItem('af_checkedItems', JSON.stringify(checkedItems));
      localStorage.setItem('af_collapsedGroups', JSON.stringify(collapsedGroups));
    } catch {}
  }, [textInput, groceryList, zipCode, stores, selectedStore, organizeByCategory, outputFormat, shopMode, checkedItems, collapsedGroups]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettingsPopup(false);
      }
    };

    if (showSettingsPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsPopup]);
  
  const isValidZipCode = (zip) => /^\d{5}(-\d{4})?$/.test(zip.trim());
  
  const shouldShowZipError = (zip) => {
    const trimmed = zip.trim();
    if (!trimmed) return false; // Don't show error for empty field
    if (/^\d{1,5}$/.test(trimmed)) return false; // Still typing valid digits (1-5 digits)
    if (/^\d{5}-\d{1,4}$/.test(trimmed)) return false; // Still typing extended format
    return !isValidZipCode(trimmed); // Show error for invalid formats
  };

  // Shared button style
  const buttonStyle = {
    background: '#1E5F99',
    color: 'white',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(110, 250, 251, 0.3)'
  };

  const disabledButtonStyle = {
    ...buttonStyle,
    background: '#bdc3c7',
    cursor: 'not-allowed',
    boxShadow: 'none'
  };

  const searchStores = async () => {
    if (!zipCode.trim()) {
      setError('Please enter a zip code');
      return;
    }

    // Validate ZIP code format
    if (!isValidZipCode(zipCode)) {
      // Don't call setError here, we'll handle this in the UI with hasSearchedStores
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
        setSelectedStore(result.stores[0]); // Auto-select first store
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
    setShopMode(false);
    setCheckedItems({});
    setCollapsedGroups({});
    setSingleItemResult(null);

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

  const copyToClipboard = async () => {
    try {
      const formattedList = formatGroceryListForCopy(groceryList);
      await navigator.clipboard.writeText(formattedList);
      alert('Grocery list copied to clipboard!');
    } catch (err) {
      setError('Failed to copy to clipboard');
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

  const formatGroceryList = (text) => {
    // First convert to the selected output format
    const formattedText = formatGroceryListForCopy(text);
    const lines = formattedText.split('\n');
    const formattedLines = [];
    
    for (let line of lines) {
      if (line.trim() === '') continue;
      
      if (outputFormat === 'numbered' && /^\d+\.\s/.test(line)) {
        // Numbered items
        formattedLines.push(
          <div key={formattedLines.length} style={{ 
            margin: '2px 0', 
            paddingLeft: '12px', 
            fontSize: '12px',
            color: '#2c3e50'
          }}>
            {line}
          </div>
        );
      } else if (outputFormat === 'checklist' && line.startsWith('- [ ] ')) {
        // Checklist items
        formattedLines.push(
          <div key={formattedLines.length} style={{ 
            margin: '2px 0', 
            paddingLeft: '12px', 
            fontSize: '12px',
            color: '#2c3e50'
          }}>
            ☐ {line.replace('- [ ] ', '')}
          </div>
        );
      } else if (outputFormat === 'checklist' && line.startsWith('## ')) {
        // Checklist category headers - make bold
        formattedLines.push(
          <div key={formattedLines.length} style={{ 
            fontWeight: 'bold', 
            margin: '12px 0 6px 0', 
            fontSize: '14px', 
            color: '#2c3e50' 
          }}>
            {line.replace('## ', '')}
          </div>
        );
      } else if (line.trim()) {
        // Headers in numbered format or other content
        const isHeader = (outputFormat === 'numbered' && !line.match(/^[\d\-•]/));
        const shouldBeBold = isHeader && outputFormat !== 'plain';
        formattedLines.push(
          <div key={formattedLines.length} style={{ 
            margin: '2px 0', 
            fontSize: '12px',
            color: '#2c3e50',
            fontWeight: shouldBeBold ? 'bold' : 'normal',
            marginTop: isHeader ? '12px' : '2px',
            marginBottom: isHeader ? '6px' : '2px'
          }}>
            {line.replace(/^## /, '')}
          </div>
        );
      }
    }

    return formattedLines;
  };

  // Shop Mode helpers
  const parseGroceryListToGroups = (text) => {
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

  const getTotalItems = () => {
    return parseGroceryListToGroups(groceryList).reduce((sum, g) => sum + g.items.length, 0);
  };

  const getCheckedCount = () => {
    return Object.values(checkedItems).filter(Boolean).length;
  };

  const isGroupComplete = (group) => {
    return group.items.every(item => checkedItems[`${group.name}::${item}`]);
  };

  const toggleItem = (groupName, itemName) => {
    const key = `${groupName}::${itemName}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
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
      // Group exists — insert item after the header line
      const lines = groceryList.split('\n');
      const headerIdx = lines.findIndex(line => line === groupHeader);
      // Find the last item in this group (lines starting with "- " after the header)
      let insertIdx = headerIdx + 1;
      while (insertIdx < lines.length && lines[insertIdx].startsWith('- ')) {
        insertIdx++;
      }
      lines.splice(insertIdx, 0, newItem);
      setGroceryList(lines.join('\n'));
    } else {
      // Group doesn't exist — append new section
      setGroceryList(groceryList.trimEnd() + `\n\n${groupHeader}\n${newItem}`);
    }

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
      setSingleItemResult(result);
    } catch (err) {
      setSingleItemResult({ error: err.message });
    } finally {
      setSingleItemLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: 'white',
      padding: '10px',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      position: 'relative'
    }}>
      {/* Background shopping cart pattern */}
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
        {Array.from({ length: 50 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i % 10) * 10}%`,
              top: `${Math.floor(i / 10) * 20}%`,
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
          background: 'linear-gradient(135deg, #6EFAFB 0%, #1E5F99 100%)',
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
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="Enter ZIP code"
              style={{
                padding: '8px 12px',
                border: '2px solid #e1e8ed',
                borderRadius: '6px',
                fontSize: '13px',
                minWidth: '150px',
                transition: 'border-color 0.3s ease',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0091AD'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
            />
            <button
              onClick={searchStores}
              disabled={storeSearchLoading}
              style={storeSearchLoading ? disabledButtonStyle : buttonStyle}
              onMouseEnter={(e) => {
                if (!e.target.disabled) {
                  e.target.style.background = 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(110, 250, 251, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.target.disabled) {
                  e.target.style.background = '#1E5F99';
                  e.target.style.transform = 'translateY(0px)';
                  e.target.style.boxShadow = '0 2px 8px rgba(110, 250, 251, 0.3)';
                }
              }}
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
                  border: selectedStore ? '2px solid #0091AD' : '2px solid #e1e8ed',
                  borderRadius: '6px',
                  fontSize: '13px',
                  width: '100%',
                  backgroundColor: selectedStore ? '#f0f9ff' : 'white',
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
              backgroundColor: '#ffe4cc', 
              borderRadius: '4px',
              border: '1px solid #ffcc99'
            }}>
              <p style={{ margin: '0', fontSize: '10px', color: '#cc6600', fontWeight: '500' }}>
                Please enter a valid ZIP code (5 digits or 5 digits-4 digits)
              </p>
            </div>
          )}

          {/* Show no stores found message after search */}
          {!storeSearchLoading && hasSearchedStores && stores.length === 0 && zipCode && isValidZipCode(zipCode) && (
            <div style={{ 
              marginTop: '10px', 
              padding: '6px 8px', 
              backgroundColor: '#ffe4cc', 
              borderRadius: '4px',
              border: '1px solid #ffcc99'
            }}>
              <p style={{ margin: '0', fontSize: '10px', color: '#cc6600', fontWeight: '500' }}>
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
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter grocery items (one per line or comma-separated):&#10;milk, bread, eggs, apples"
              style={{
                width: '100%',
                height: '80px',
                padding: '8px',
                border: '2px solid #e1e8ed',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                resize: 'vertical',
                overflowY: 'auto',
                outline: 'none',
                transition: 'border-color 0.3s ease',
                backgroundColor: 'white',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0091AD'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
            />
          </div>
        </div>

        {/* Organization Buttons */}
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '15px' }}>
          <button
            onClick={() => {
              setOrganizeByCategory(true);
              processGroceryList('category');
            }}
            disabled={!textInput.trim() || loading}
            style={!textInput.trim() || loading ? disabledButtonStyle : buttonStyle}
            onMouseEnter={(e) => {
              if (!e.target.disabled) {
                e.target.style.background = 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 4px 12px rgba(110, 250, 251, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!e.target.disabled) {
                e.target.style.background = '#1E5F99';
                e.target.style.transform = 'translateY(0px)';
                e.target.style.boxShadow = '0 2px 8px rgba(110, 250, 251, 0.3)';
              }
            }}
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
            style={!textInput.trim() || loading ? disabledButtonStyle : buttonStyle}
            onMouseEnter={(e) => {
              if (!e.target.disabled) {
                e.target.style.background = 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 4px 12px rgba(110, 250, 251, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!e.target.disabled) {
                e.target.style.background = '#1E5F99';
                e.target.style.transform = 'translateY(0px)';
                e.target.style.boxShadow = '0 2px 8px rgba(110, 250, 251, 0.3)';
              }
            }}
          >
            {loading && !organizeByCategory ? 'Processing...' : 'Organize by Aisle'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#ffe4cc',
            color: '#cc6600',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '15px',
            fontSize: '11px',
            fontWeight: '500',
            border: '1px solid #ffcc99'
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
              position: 'relative',
              width: '80px',
              height: '60px',
              margin: '0 auto 20px',
              display: 'inline-block'
            }}>
              {/* Shopping Cart Icon */}
              <div style={{
                position: 'absolute',
                bottom: '0',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '40px',
                color: '#0091AD'
              }}>
                <i className="fa-solid fa-basket-shopping"></i>
              </div>
              
              {/* Static Items in Cart - no more disappearing! */}
              <div style={{
                position: 'absolute',
                top: '28px',
                left: '32px',
                fontSize: '10px',
                color: '#FF0000',
                opacity: 0,
                animation: 'fadeInAndDrop 0.8s ease-out 0.5s forwards'
              }}>
                <i className="fa-solid fa-apple-whole"></i>
              </div>
              <div style={{
                position: 'absolute',
                top: '30px',
                left: '40px',
                fontSize: '11px',
                color: '#FF8C00',
                opacity: 0,
                animation: 'fadeInAndDrop 0.8s ease-out 1.0s forwards'
              }}>
                <i className="fa-solid fa-carrot"></i>
              </div>
              <div style={{
                position: 'absolute',
                top: '32px',
                left: '48px',
                fontSize: '10px',
                color: '#32CD32',
                opacity: 0,
                animation: 'fadeInAndDrop 0.8s ease-out 1.5s forwards'
              }}>
                <i className="fa-solid fa-apple-whole"></i>
              </div>
              <div style={{
                position: 'absolute',
                top: '34px',
                left: '36px',
                fontSize: '11px',
                color: '#FF7F00',
                opacity: 0,
                animation: 'fadeInAndDrop 0.8s ease-out 2.0s forwards'
              }}>
                <i className="fa-solid fa-carrot"></i>
              </div>
              <div style={{
                position: 'absolute',
                top: '36px',
                left: '44px',
                fontSize: '10px',
                color: '#FF6347',
                opacity: 0,
                animation: 'fadeInAndDrop 0.8s ease-out 2.5s forwards'
              }}>
                <i className="fa-solid fa-carrot"></i>
              </div>
            </div>
            
            <p style={{ margin: '0', color: '#2c3e50', fontSize: '14px', fontWeight: '500' }}>
              Processing {getItemCount()} items
              <span className="dot1">.</span>
              <span className="dot2">.</span>
              <span className="dot3">.</span>
            </p>
            
            <style>{`
              @keyframes fadeInAndDrop {
                0% {
                  transform: translateY(-15px);
                  opacity: 0;
                }
                100% {
                  transform: translateY(0px);
                  opacity: 1;
                }
              }
              
              .dot1, .dot2, .dot3 {
                animation: dotFade 1.5s infinite;
              }
              
              .dot1 {
                animation-delay: 0s;
              }
              
              .dot2 {
                animation-delay: 0.3s;
              }
              
              .dot3 {
                animation-delay: 0.6s;
              }
              
              @keyframes dotFade {
                0%, 60%, 100% {
                  opacity: 0;
                }
                30% {
                  opacity: 1;
                }
              }
            `}</style>
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
              <div ref={settingsRef} style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShopMode(!shopMode)}
                  style={{
                    ...buttonStyle,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: shopMode ? '#27ae60' : '#1E5F99'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = shopMode
                      ? 'linear-gradient(135deg, #2ecc71 0%, #1a9c4e 100%)'
                      : 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(110, 250, 251, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = shopMode ? '#27ae60' : '#1E5F99';
                    e.currentTarget.style.transform = 'translateY(0px)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(110, 250, 251, 0.3)';
                  }}
                >
                  <i className="fa-solid fa-basket-shopping"></i>
                  {shopMode ? 'Exit Shop Mode' : 'Shop Mode'}
                </button>
                <button
                  onClick={copyToClipboard}
                  style={buttonStyle}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(110, 250, 251, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#1E5F99';
                    e.target.style.transform = 'translateY(0px)';
                    e.target.style.boxShadow = '0 2px 8px rgba(110, 250, 251, 0.3)';
                  }}
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowSettingsPopup(!showSettingsPopup)}
                  style={{
                    ...buttonStyle,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(110, 250, 251, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#1E5F99';
                    e.currentTarget.style.transform = 'translateY(0px)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(110, 250, 251, 0.3)';
                  }}
                >
                  <i className="fa-solid fa-cog"></i>
                </button>
                
                {/* Settings Popup */}
                {showSettingsPopup && (
                  <div style={{
                    position: 'absolute',
                    top: '40px',
                    right: '0',
                    background: 'white',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    padding: '15px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    minWidth: '200px'
                  }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#2c3e50' }}>
                      Output Format
                    </h4>
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
                )}
              </div>
            </div>
            
            {shopMode ? (
              <div style={{
                backgroundColor: 'white',
                padding: '15px',
                borderRadius: '6px',
                border: '2px solid #e9ecef',
                minHeight: '300px'
              }}>
                {/* Progress bar */}
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#2c3e50' }}>
                      Progress: {getCheckedCount()}/{getTotalItems()} items
                    </span>
                    <span style={{ fontSize: '12px', color: '#6c757d' }}>
                      {getTotalItems() > 0 ? Math.round((getCheckedCount() / getTotalItems()) * 100) : 0}%
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
                      width: `${getTotalItems() > 0 ? (getCheckedCount() / getTotalItems()) * 100 : 0}%`,
                      backgroundColor: '#27ae60',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

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
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        border: '2px solid #e1e8ed',
                        borderRadius: '6px',
                        fontSize: '12px',
                        outline: 'none',
                        transition: 'border-color 0.3s ease'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#0091AD'}
                      onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
                    />
                    <button
                      onClick={lookupSingleItem}
                      disabled={singleItemLoading || !singleItemQuery.trim()}
                      style={{
                        ...(singleItemLoading || !singleItemQuery.trim() ? disabledButtonStyle : buttonStyle),
                        padding: '6px 12px',
                        fontSize: '11px'
                      }}
                      onMouseEnter={(e) => {
                        if (!e.target.disabled) {
                          e.target.style.background = 'linear-gradient(135deg, #5ae5e6 0%, #0f4d87 100%)';
                          e.target.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!e.target.disabled) {
                          e.target.style.background = '#1E5F99';
                          e.target.style.transform = 'translateY(0px)';
                        }
                      }}
                    >
                      {singleItemLoading ? '...' : 'Find Aisle'}
                    </button>
                  </div>
                  {singleItemResult && !singleItemResult.error && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#2c3e50', padding: '6px 8px', backgroundColor: '#e8f5e9', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span><strong>{singleItemResult.item}</strong> — {singleItemResult.aisle}</span>
                      <button
                        onClick={() => addItemToList(singleItemResult)}
                        style={{
                          ...buttonStyle,
                          padding: '4px 10px',
                          fontSize: '11px',
                          background: '#27ae60',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, #2ecc71 0%, #1a9c4e 100%)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#27ae60';
                          e.currentTarget.style.transform = 'translateY(0px)';
                        }}
                      >
                        <i className="fa-solid fa-plus"></i> Add to List
                      </button>
                    </div>
                  )}
                  {singleItemResult && singleItemResult.error && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#cc6600', padding: '6px 8px', backgroundColor: '#ffe4cc', borderRadius: '4px' }}>
                      Could not find item
                    </div>
                  )}
                </div>

                {/* Interactive checklist */}
                {parseGroceryListToGroups(groceryList).map((group) => {
                  const complete = isGroupComplete(group);
                  const collapsed = collapsedGroups[group.name] !== undefined
                    ? collapsedGroups[group.name]
                    : complete;

                  return (
                    <div key={group.name} style={{ marginBottom: '10px' }}>
                      <div
                        onClick={() => toggleGroupCollapse(group.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          backgroundColor: complete ? '#d4edda' : '#f8f9fa',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '13px',
                          color: complete ? '#155724' : '#2c3e50',
                          transition: 'background-color 0.2s ease'
                        }}
                      >
                        <i className={collapsed ? "fa-solid fa-chevron-right" : "fa-solid fa-chevron-down"}
                           style={{ fontSize: '10px', width: '12px' }} />
                        {group.name}
                        <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '400', color: '#6c757d' }}>
                          {group.items.filter(item => checkedItems[`${group.name}::${item}`]).length}/{group.items.length}
                        </span>
                        {complete && <i className="fa-solid fa-check" style={{ color: '#27ae60', fontSize: '12px' }} />}
                      </div>

                      {!collapsed && (
                        <div style={{ paddingLeft: '12px', marginTop: '4px' }}>
                          {group.items.map((item, idx) => (
                            <div
                              key={`${group.name}::${item}::${idx}`}
                              onClick={() => toggleItem(group.name, item)}
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
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'white',
                  padding: '15px',
                  borderRadius: '6px',
                  border: '2px solid #e9ecef',
                  minHeight: '300px',
                  color: '#2c3e50'
                }}
              >
                {formatGroceryList(groceryList)}
              </div>
            )}
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
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #ffc439 0%, #ff7730 100%)',
              color: 'white',
              padding: '3px 8px',
              borderRadius: '3px',
              textDecoration: 'none',
              fontSize: '9px',
              fontWeight: '600',
              transition: 'all 0.3s ease',
              boxShadow: '0 1px 3px rgba(255, 196, 57, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 2px 4px rgba(255, 196, 57, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0px)';
              e.target.style.boxShadow = '0 1px 3px rgba(255, 196, 57, 0.3)';
            }}
          >
            Support via PayPal
          </a>
          
          <a
            href="https://github.com/Soapsuds/aislefinder/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #ff4757 0%, #c44569 100%)',
              color: 'white',
              padding: '3px 8px',
              borderRadius: '3px',
              textDecoration: 'none',
              fontSize: '9px',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              boxShadow: '0 1px 3px rgba(255, 71, 87, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'linear-gradient(135deg, #ff3742 0%, #b03a5e 100%)';
              e.target.style.boxShadow = '0 2px 6px rgba(255, 71, 87, 0.4)';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'linear-gradient(135deg, #ff4757 0%, #c44569 100%)';
              e.target.style.boxShadow = '0 1px 3px rgba(255, 71, 87, 0.3)';
              e.target.style.transform = 'translateY(0px)';
            }}
          >
            Report a Bug
          </a>
        </div>
      </div>
    </div>
  );
};

export default AisleFinder;
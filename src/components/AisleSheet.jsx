import React, { useState, useEffect, useRef } from 'react';
import Sheet from './Sheet';
import { fetchItemDetails } from '../api';
import { placementFromGroupName, overrideGroupName, itemKey } from '../listUtils';

// Bottom sheet for setting or correcting where an item lives: a numbered aisle
// or a Kroger category. Reached from a Not Found row's "Set aisle" pill and
// from the item info sheet's "Change aisle". Writing lands in the store's
// override map so it survives the next re-organize.
const AisleSheet = ({ item, store, currentGroupName, override, catalog = [], onSave, onClear, onClose }) => {
  const hasStore = !!store;
  const [mode, setMode] = useState('aisle');
  const [aisleValue, setAisleValue] = useState(1);
  const [category, setCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const cache = useRef({});

  // (Re)initialize whenever a different item opens the sheet.
  useEffect(() => {
    if (!item) return;
    const start = override || placementFromGroupName(currentGroupName);
    if (!hasStore) {
      setMode('category');
    } else {
      setMode(start && start.kind === 'category' ? 'category' : 'aisle');
    }
    setAisleValue(start && start.kind === 'aisle' ? start.value : 1);
    setCategory(start && start.kind === 'category' ? start.value : null);
    setSearch('');
  }, [item, override, currentGroupName, hasStore]);

  // Pull the item's own Kroger categories as the primary suggestions — these
  // are guaranteed to match the organizer's headers.
  useEffect(() => {
    if (!item) { setSuggestions([]); return; }
    const key = `${store ? store.id : 'default'}::${itemKey(item)}`;
    if (key in cache.current) { setSuggestions(cache.current[key]); return; }
    let cancelled = false;
    fetchItemDetails({ item, store })
      .then((results) => {
        const seen = [];
        results.forEach((r) => { if (r.category && !seen.includes(r.category)) seen.push(r.category); });
        cache.current[key] = seen;
        if (!cancelled) setSuggestions(seen);
      })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [item, store]);

  if (!item) return null;

  const catalogNames = catalog.map((c) => c.name);
  const suggestionSet = new Set(suggestions);
  const q = search.trim().toLowerCase();
  const browseList = catalogNames
    .filter((name) => !suggestionSet.has(name))
    .filter((name) => !q || name.toLowerCase().includes(q));

  const currentLabel = override
    ? (override.kind === 'none' ? 'Not sold here' : overrideGroupName(override))
    : (currentGroupName === 'Not Found' ? 'Not found' : (currentGroupName || 'Not found'));

  const canSave = mode === 'aisle' ? aisleValue >= 1 : !!category;
  const saveLabel = mode === 'aisle' ? `Save to Aisle ${aisleValue}` : (category ? `Save to ${category}` : 'Pick a category');

  const save = () => {
    if (!canSave) return;
    onSave(mode === 'aisle' ? { kind: 'aisle', value: aisleValue } : { kind: 'category', value: category });
  };

  const seg = (m, label, disabled) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setMode(m)}
      style={{
        flex: 1,
        border: 0,
        background: mode === m ? 'var(--af-bg)' : 'transparent',
        color: disabled ? 'var(--af-text-faint)' : (mode === m ? 'var(--af-text)' : 'var(--af-text-muted)'),
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: 700,
        padding: '8px',
        borderRadius: '8px',
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      {label}
    </button>
  );

  const catRow = (name, tag) => {
    const selected = category === name;
    return (
      <button
        key={name}
        type="button"
        onClick={() => setCategory(name)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          textAlign: 'left',
          padding: '10px 12px',
          border: 0,
          borderRadius: '8px',
          background: selected ? 'var(--af-green)' : 'var(--af-inset-bg)',
          color: selected ? 'white' : 'var(--af-text)',
          fontFamily: 'inherit',
          fontSize: '13.5px',
          cursor: 'pointer',
        }}
      >
        <i className={selected ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} style={{ opacity: selected ? 1 : 0.4, width: '14px' }} />
        <span style={{ flex: 1 }}>{name}</span>
        {tag && <span style={{ fontSize: '11px', color: selected ? 'rgba(255,255,255,0.75)' : 'var(--af-text-muted)' }}>{tag}</span>}
      </button>
    );
  };

  return (
    <Sheet open={!!item} onClose={onClose}>
      <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>{item}</div>
      <div style={{ fontSize: '12.5px', color: 'var(--af-text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <i className="fa-solid fa-location-crosshairs" />
        Currently {currentLabel}{store ? ` · ${store.name}` : ''}
      </div>

      <div style={{ display: 'flex', background: 'var(--af-inset-bg)', border: '1px solid var(--af-border)', borderRadius: '10px', padding: '3px', gap: '3px', marginBottom: '16px' }}>
        {seg('aisle', 'Aisle number', !hasStore)}
        {seg('category', 'Category', false)}
      </div>

      {mode === 'aisle' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', margin: '4px 0 18px' }}>
          <button
            type="button"
            aria-label="Lower aisle"
            onClick={() => setAisleValue((v) => Math.max(1, v - 1))}
            style={{ width: '52px', height: '52px', borderRadius: '14px', border: '1px solid var(--af-border)', background: 'var(--af-inset-bg)', color: 'var(--af-green)', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-minus" />
          </button>
          <div style={{ minWidth: '110px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--af-text-muted)' }}>Aisle</div>
            <div style={{ fontSize: '46px', fontWeight: 700, lineHeight: 1, color: 'var(--af-text)', fontVariantNumeric: 'tabular-nums' }}>{aisleValue}</div>
          </div>
          <button
            type="button"
            aria-label="Raise aisle"
            onClick={() => setAisleValue((v) => v + 1)}
            style={{ width: '52px', height: '52px', borderRadius: '14px', border: '1px solid var(--af-border)', background: 'var(--af-inset-bg)', color: 'var(--af-green)', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-plus" />
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--af-inset-bg)', border: '1px solid var(--af-border)', borderRadius: '10px', padding: '9px 12px', marginBottom: '12px' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--af-text-faint)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all categories…"
              className="af-input"
              style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', color: 'var(--af-text)', fontFamily: 'inherit', fontSize: '13px' }}
            />
          </div>
          {suggestions.length > 0 && !q && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--af-text-muted)', margin: '4px 2px 8px' }}>Suggested for {item}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                {suggestions.map((name) => catRow(name, 'item lookup'))}
              </div>
            </>
          )}
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--af-text-muted)', margin: '4px 2px 8px' }}>
            {q ? 'Matching categories' : 'All Kroger categories'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '210px', overflowY: 'auto' }}>
            {/* A searched-for category the user picked but that's outside the catalog still shows as selected */}
            {category && !suggestionSet.has(category) && !browseList.includes(category) && catRow(category)}
            {browseList.length > 0
              ? browseList.map((name) => catRow(name))
              : <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', padding: '8px 2px' }}>No categories match “{search}”.</div>}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={save}
        style={{ width: '100%', border: 0, borderRadius: '10px', padding: '13px', fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, color: 'white', background: canSave ? 'var(--af-green)' : 'var(--af-border)', cursor: canSave ? 'pointer' : 'default', boxShadow: canSave ? '0 2px 8px -2px rgba(21,63,110,0.5)' : 'none' }}
      >
        {saveLabel}
      </button>

      {override ? (
        <button
          type="button"
          onClick={onClear}
          style={{ width: '100%', border: 0, background: 'transparent', color: 'var(--af-text-muted)', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, padding: '11px', marginTop: '8px', cursor: 'pointer' }}
        >
          Reset to the store’s aisle
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onSave({ kind: 'none' })}
          style={{ width: '100%', border: 0, background: 'transparent', color: 'var(--af-error-text)', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, padding: '11px', marginTop: '8px', cursor: 'pointer' }}
        >
          Not sold here — remove from route
        </button>
      )}
    </Sheet>
  );
};

export default AisleSheet;

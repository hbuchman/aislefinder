import React, { useState } from 'react';
import Sheet from './Sheet';
import { findStores } from '../api';
import { loadState, saveState } from '../storage';

const isValidZipCode = (zip) => /^\d{5}(-\d{4})?$/.test(zip.trim());

const StoreSheet = ({ open, onClose, list, updateList, toast }) => {
  const [zipCode, setZipCode] = useState(() => loadState('zipCode', ''));
  const [stores, setStores] = useState(() => loadState('stores', []));
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!isValidZipCode(zipCode)) {
      setError('Please enter a valid ZIP code (5 digits or 5 digits-4 digits)');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const found = await findStores(zipCode.trim());
      setStores(found);
      setHasSearched(true);
      saveState('zipCode', zipCode.trim());
      saveState('stores', found);
    } catch (err) {
      setError('Error searching stores: ' + err.message);
      setStores([]);
      setHasSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const selectStore = (store) => {
    updateList(list.id, { store, organized: null, organizedBy: null, organizedForHash: null });
    toast(`Store set to ${store.name}`);
    onClose();
  };

  const currentStoreId = list && list.store ? list.store.id : null;

  return (
    <Sheet open={open} onClose={onClose}>
      <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>
        <i className="fa-solid fa-map-location-dot" style={{ marginRight: '8px', color: 'var(--af-focus)' }} />
        Choose your store
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--af-text-muted)', margin: '0 0 14px' }}>
        Kroger family stores: Pick 'N Save, Ralphs, King Soopers, Smith's, Fry's, QFC, and more
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <input
          type="text"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder="Enter ZIP code"
          inputMode="numeric"
          className="af-input"
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '2px solid var(--af-input-border)',
            borderRadius: '10px',
            fontSize: '15px',
            backgroundColor: 'var(--af-inset-bg)',
            color: 'var(--af-text)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button className="af-btn" disabled={searching} onClick={search}>
          {searching ? 'Searching…' : 'Find Stores'}
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: 'var(--af-error-bg)',
          border: '1px solid var(--af-error-border)',
          color: 'var(--af-error-text)',
          borderRadius: '8px',
          padding: '8px 10px',
          fontSize: '12px',
          marginBottom: '12px',
        }}>
          {error}
        </div>
      )}

      {!searching && hasSearched && stores.length === 0 && !error && (
        <p style={{ fontSize: '12px', color: 'var(--af-error-text)' }}>
          No stores found near ZIP code {zipCode}. Try a different ZIP code or organize by category.
        </p>
      )}

      {stores.map((store) => {
        const selected = store.id === currentStoreId;
        return (
          <button
            key={store.id}
            onClick={() => selectStore(store)}
            className="af-storeoption"
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '12px 14px',
              marginBottom: '8px',
              border: `2px solid ${selected ? 'var(--af-focus)' : 'var(--af-border)'}`,
              borderRadius: '10px',
              backgroundColor: selected ? 'var(--af-highlight-bg)' : 'var(--af-inset-bg)',
              color: 'var(--af-text)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selected && <i className="fa-solid fa-check" style={{ color: 'var(--af-focus)' }} />}
              {store.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '2px' }}>
              {store.address}{store.distance != null ? ` (${store.distance.toFixed(1)} mi)` : ''}
            </div>
          </button>
        );
      })}
    </Sheet>
  );
};

export default StoreSheet;

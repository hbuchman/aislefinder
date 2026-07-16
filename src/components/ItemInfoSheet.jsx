import React, { useState, useEffect, useRef } from 'react';
import Sheet from './Sheet';
import { fetchItemDetails } from '../api';

const SIDE_LABEL = { L: 'Left side', R: 'Right side' };

// Bottom sheet showing what an item is (photo + description) and exactly
// where it sits within the aisle. Opened from the info icon in shop mode.
const ItemInfoSheet = ({ item, store, onClose }) => {
  const [state, setState] = useState({ status: 'idle' });
  const cache = useRef({});

  useEffect(() => {
    if (!item) return;
    const key = `${store ? store.id : 'default'}::${item.toLowerCase()}`;
    if (key in cache.current) {
      setState({ status: 'done', details: cache.current[key] });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchItemDetails({ item, store })
      .then((details) => {
        cache.current[key] = details;
        if (!cancelled) setState({ status: 'done', details });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [item, store]);

  if (!item) return null;

  const details = state.status === 'done' ? state.details : null;
  const location = details && details.location;
  const subtitle = details
    && [details.brand, details.size, details.category].filter(Boolean).join(' · ');
  const placement = location
    && [
      location.side && SIDE_LABEL[location.side],
      location.shelf && `Shelf ${location.shelf}`,
      location.bay && `Bay ${location.bay}`,
    ].filter(Boolean).join(' · ');

  return (
    <Sheet open={!!item} onClose={onClose}>
      <div style={{ textAlign: 'center', minHeight: '160px', paddingBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: 'var(--af-text-faint)', marginBottom: '12px' }}>
          {item}
        </div>

        {state.status === 'loading' && (
          <div style={{ padding: '30px 0', color: 'var(--af-text-muted)', fontSize: '13px' }}>
            <div className="loading-icon-0" style={{ fontSize: '22px', color: 'var(--af-green)', marginBottom: '10px' }}>
              <i className="fa-solid fa-magnifying-glass" />
            </div>
            Looking up {item}…
          </div>
        )}

        {state.status === 'error' && (
          <div style={{ padding: '30px 0', color: 'var(--af-error-text)', fontSize: '13px' }}>
            Couldn't load details — check your connection and try again.
          </div>
        )}

        {state.status === 'done' && !details && (
          <div style={{ padding: '30px 0', color: 'var(--af-text-muted)', fontSize: '13px' }}>
            No match for this item at {store ? store.name : 'this store'}.
          </div>
        )}

        {details && (
          <>
            {details.image && (
              <div style={{
                background: 'white',
                border: '1px solid var(--af-border)',
                borderRadius: '12px',
                padding: '10px',
                display: 'inline-block',
                marginBottom: '12px',
              }}>
                <img
                  src={details.image}
                  alt={details.name}
                  style={{ maxWidth: '140px', maxHeight: '140px', display: 'block' }}
                />
              </div>
            )}

            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--af-text)' }}>
              {details.name}
            </div>
            {subtitle && (
              <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '4px' }}>
                {subtitle}
              </div>
            )}

            <div style={{
              marginTop: '14px',
              padding: '12px',
              background: 'var(--af-highlight-bg)',
              border: '1px solid var(--af-highlight-border)',
              borderRadius: '10px',
            }}>
              {location ? (
                <>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--af-green-dark)' }}>
                    <i className="fa-solid fa-location-dot" style={{ marginRight: '6px' }} />
                    Aisle {location.aisle}
                  </div>
                  {placement && (
                    <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '5px' }}>
                      <i className="fa-solid fa-layer-group" style={{ marginRight: '5px', fontSize: '10px' }} />
                      {placement}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--af-text-muted)' }}>
                  No aisle location on file
                  {details.category ? ` — look in ${details.category}` : ''}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};

export default ItemInfoSheet;

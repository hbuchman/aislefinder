import React from 'react';

// Shown once the last item is checked off (confetti has already played over
// the checklist) or when shopping is finished early. Centered, single-column
// layout — deliberately not a stats-tile grid — with total time as the hero
// number and the single hardest-to-find item called out underneath it.
const ShopSummary = ({ totalItems, checkedCount, shopStartTime, hardestToFind, list, onDone }) => {
  const mins = shopStartTime ? Math.max(1, Math.round((Date.now() - shopStartTime) / 60000)) : null;
  const allDone = totalItems > 0 && checkedCount === totalItems;
  const hardestMinutes = hardestToFind ? Math.round(hardestToFind.gapMs / 60000) : 0;
  const showHardest = hardestToFind && hardestMinutes >= 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, backgroundColor: 'var(--af-bg)' }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 24px',
        paddingTop: 'calc(32px + var(--safe-area-inset-top))',
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: 'var(--af-green)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          boxShadow: '0 0 0 10px var(--af-green-soft)',
        }}>
          <i className="fa-solid fa-check" style={{ color: 'white', fontSize: 26 }} />
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--af-text)' }}>
          Shopping Complete!
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--af-text-muted)' }}>
          {allDone ? `All ${totalItems} items checked off` : `${checkedCount} of ${totalItems} items checked off`}
        </p>

        {list.store && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 10,
            fontSize: 12,
            color: 'var(--af-text-muted)',
            backgroundColor: 'var(--af-surface)',
            border: '1px solid var(--af-border)',
            borderRadius: 999,
            padding: '3px 10px',
          }}>
            <i className="fa-solid fa-location-dot" style={{ fontSize: 10 }} />
            {list.store.name}
          </div>
        )}

        {mins !== null && (
          <div style={{ margin: '36px 0 0' }}>
            <div style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '-1.5px',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--af-text)',
            }}>
              {mins}
            </div>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: 'var(--af-text-muted)',
              marginTop: 4,
            }}>
              minute{mins === 1 ? '' : 's'} shopping
            </div>
          </div>
        )}

        {showHardest && (
          <div style={{
            marginTop: 28,
            width: '100%',
            maxWidth: 340,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            backgroundColor: 'rgba(255,196,57,0.10)',
            border: '1px solid rgba(255,196,57,0.30)',
            borderRadius: 14,
            padding: '14px 16px',
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              backgroundColor: 'rgba(255,196,57,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 14, color: 'var(--af-amber-text)' }} />
            </div>
            <div>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                color: 'var(--af-amber-text)',
                marginBottom: 2,
              }}>
                Hardest to find
              </div>
              <div style={{ fontSize: 13, color: 'var(--af-text)' }}>
                <strong>{hardestToFind.item}</strong> — you spent {hardestMinutes} minute{hardestMinutes === 1 ? '' : 's'} looking for this
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{
        borderTop: '1px solid var(--af-border)',
        padding: '12px 16px calc(14px + var(--safe-area-inset-bottom))',
        background: 'var(--af-bg)',
        flexShrink: 0,
      }}>
        <button
          className="af-btn-green"
          style={{ width: '100%', justifyContent: 'center', padding: '14px 24px', fontSize: 15, borderRadius: 10 }}
          onClick={onDone}
        >
          <i className="fa-solid fa-check" />
          Done
        </button>
      </div>
    </div>
  );
};

export default ShopSummary;

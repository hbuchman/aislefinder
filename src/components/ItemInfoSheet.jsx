import React, { useState, useEffect, useRef } from 'react';
import { fetchItemDetails } from '../api';

// ---------------------------------------------------------------------------
// Hardcoded humane/organic brand recommendations.
// Certifications key: "Certified Humane" = Humane Farm Animal Care program;
// "USDA Organic" = no synthetic hormones/pesticides, higher welfare floors;
// "GAP Step 5+" = Global Animal Partnership highest tier.
// ---------------------------------------------------------------------------
const HUMANE_DB = {
  eggs: {
    label: 'Eggs',
    brand: "Pete & Gerry's Organic",
    certifications: ['Certified Humane', 'USDA Organic'],
    priceNote: '~$5–6/dozen',
    why: 'Best balance of certified humane welfare + organic standards at a mid-range price. Hens have genuine outdoor access.',
    alsoConsider: ['Happy Egg (Certified Humane, ~$4–5/doz)', 'Vital Farms (pasture-raised gold standard, ~$8–10/doz)'],
  },
  milk: {
    label: 'Milk',
    brand: 'Horizon Organic',
    certifications: ['USDA Organic'],
    priceNote: '~$4–5/half-gallon',
    why: 'Most affordable widely-available organic milk. USDA Organic rules require 120 grazing days/year and no synthetic hormones or antibiotics.',
    alsoConsider: ['Organic Valley (pasture-raised, higher welfare, ~$5–6)', 'Store-brand organic (same USDA standards, lowest price)'],
  },
  butter: {
    label: 'Butter',
    brand: 'Kerrygold',
    certifications: ['Grass-Fed'],
    priceNote: '~$4–5/8 oz',
    why: "Irish grass-fed cows spend most of the year on pasture — meaningfully better welfare than conventional. No US organic cert but consistently high standards.",
    alsoConsider: ['Organic Valley Pasture Butter (USDA Organic + Certified Humane, ~$6–7)'],
  },
  cheese: {
    label: 'Cheese',
    brand: 'Horizon Organic',
    certifications: ['USDA Organic'],
    priceNote: 'similar to conventional',
    why: 'Often priced near conventional cheese while still meeting USDA Organic welfare floors — no synthetic hormones, no antibiotics, pasture access required.',
    alsoConsider: ['Organic Valley (stricter co-op standards)', 'Tillamook (better-than-average conventional, transparent practices)'],
  },
  yogurt: {
    label: 'Yogurt',
    brand: 'Stonyfield Organic',
    certifications: ['USDA Organic', 'Non-GMO'],
    priceNote: '~$5–6/32 oz',
    why: 'Large-size containers bring the per-serving cost near conventional. No artificial hormones or antibiotics; strong pasture-access commitments.',
    alsoConsider: ['Maple Hill (100% grass-fed organic, premium)', 'Store-brand organic plain yogurt (same USDA standards, cheapest)'],
  },
  cream: {
    label: 'Cream',
    brand: 'Horizon Organic',
    certifications: ['USDA Organic'],
    priceNote: '~$4–5/pint',
    why: 'Usually the lowest-priced USDA Organic cream at mainstream grocery stores — same welfare floors as more expensive organic brands.',
    alsoConsider: ['Organic Valley (pasture-raised, ~$1–2 more per pint)'],
  },
  chicken: {
    label: 'Chicken',
    brand: 'Smart Chicken',
    certifications: ['Certified Humane', 'No Antibiotics Ever'],
    priceNote: '~$6–8/lb',
    why: 'Air-chilled and Certified Humane, typically $1–2/lb less than Bell & Evans. Wide distribution in Kroger-family stores.',
    alsoConsider: ['Bell & Evans (slightly more premium welfare standards, ~$8–10/lb)'],
  },
  beef: {
    label: 'Beef',
    brand: "Laura's Lean Beef",
    certifications: ['American Humane Certified', 'No Added Hormones'],
    priceNote: '~$5–6/lb (96% lean)',
    why: 'American Humane Certified and consistently the most affordable humane-labeled beef at Kroger. Extra-lean cuts.',
    alsoConsider: ['Niman Ranch (Certified Humane, all cuts, ~$7–9/lb)', 'Panorama Organic Grass-Fed (~$7–9/lb)'],
  },
  pork: {
    label: 'Pork',
    brand: 'Applegate Naturals',
    certifications: ['Certified Humane', 'No Antibiotics Ever'],
    priceNote: '~$6–8/lb (bacon/sausage)',
    why: 'Certified Humane with no gestation crates and no antibiotics. Best value among humane pork brands; widely stocked at Kroger.',
    alsoConsider: ['Niman Ranch (Certified Humane, whole cuts and ground pork)'],
  },
  turkey: {
    label: 'Turkey',
    brand: "Mary's Free Range",
    certifications: ['Certified Humane', 'No Antibiotics Ever'],
    priceNote: '~$5–7/lb',
    why: 'Certified Humane and air-chilled; one of the more accessible humane turkey options in mainstream grocery stores.',
    alsoConsider: ['Diestel (Certified Humane, pasture-raised option, similar price)'],
  },
  lamb: {
    label: 'Lamb',
    brand: 'Atkins Ranch',
    certifications: ['New Zealand Pasture-Raised'],
    priceNote: '~$10–12/lb',
    why: "New Zealand's year-round pasture system is the norm, not a premium add-on — you get high welfare standards at a lower price than US specialty lamb.",
    alsoConsider: ["Shepherd's Pride (US, Animal Welfare Certified)"],
  },
};

const HUMANE_KEYWORDS = [
  { key: 'eggs',    patterns: [/\beggs?\b/i] },
  { key: 'milk',    patterns: [/\bmilk\b/i, /\bhalf[- ]and[- ]half\b/i, /\bskim\b/i] },
  { key: 'butter',  patterns: [/\bbutter\b/i] },
  { key: 'cheese',  patterns: [/\bcheese\b/i, /\bcheddar\b/i, /\bmozzarella\b/i, /\bparmesan\b/i, /\bgouda\b/i, /\bbrie\b/i] },
  { key: 'yogurt',  patterns: [/\byogh?urt\b/i] },
  { key: 'cream',   patterns: [/\bcream\b/i] },
  { key: 'chicken', patterns: [/\bchicken\b/i] },
  { key: 'beef',    patterns: [/\bbeef\b/i, /\bsteak\b/i, /\bbrisket\b/i] },
  { key: 'pork',    patterns: [/\bpork\b/i, /\bbacon\b/i, /\bham\b/i, /\bsausage\b/i] },
  { key: 'turkey',  patterns: [/\bturkey\b/i] },
  { key: 'lamb',    patterns: [/\blamb\b/i] },
];

function getHumanePick(itemName) {
  if (!itemName) return null;
  for (const { key, patterns } of HUMANE_KEYWORDS) {
    if (patterns.some(rx => rx.test(itemName))) return HUMANE_DB[key];
  }
  return null;
}

const CertBadge = ({ label }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    background: 'rgba(39,174,96,0.13)',
    color: 'var(--af-green-dark)',
    border: '1px solid rgba(39,174,96,0.28)',
    marginRight: '4px',
    marginBottom: '4px',
  }}>
    {label}
  </span>
);

const HumanePick = ({ pick }) => (
  <div style={{
    marginTop: '14px',
    padding: '13px 14px 11px',
    background: 'var(--af-highlight-bg)',
    border: '1px solid var(--af-highlight-border)',
    borderRadius: '10px',
    textAlign: 'left',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
      <i className="fa-solid fa-leaf" style={{ color: 'var(--af-green)', fontSize: '13px' }} />
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', color: 'var(--af-green-dark)', textTransform: 'uppercase' }}>
        Humane Pick — {pick.label}
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--af-text)' }}>
        {pick.brand}
      </span>
      {pick.priceNote && (
        <span style={{ fontSize: '12px', color: 'var(--af-green-dark)', fontWeight: 600 }}>
          {pick.priceNote}
        </span>
      )}
    </div>
    <div style={{ marginBottom: '7px' }}>
      {pick.certifications.map(c => <CertBadge key={c} label={c} />)}
    </div>
    <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', lineHeight: 1.5, marginBottom: pick.alsoConsider?.length ? '8px' : '0' }}>
      {pick.why}
    </div>
    {pick.alsoConsider?.length > 0 && (
      <div style={{ fontSize: '11px', color: 'var(--af-text-faint)', lineHeight: 1.6 }}>
        <span style={{ fontWeight: 600 }}>Also good: </span>
        {pick.alsoConsider.join(', ')}
      </div>
    )}
  </div>
);

const SHELF_ROWS = 5;
const BAY_COLS = 5;

// Grid diagram: rows = shelf levels, columns = bay positions.
// The target cell is highlighted; the intersecting row+col are lightly tinted.
const AisleDiagram = ({ location }) => {
  const targetShelf = location.shelf ? parseInt(location.shelf, 10) : null;
  const targetBay = location.bay ? parseInt(location.bay, 10) : null;
  const isLeft = location.side === 'L';
  const isRight = location.side === 'R';
  const sideLabel = isLeft ? 'Left side' : isRight ? 'Right side' : null;

  // Keep target bay visible; center the window around it when possible
  let bayStart = 1;
  if (targetBay) {
    bayStart = Math.max(1, targetBay - Math.floor(BAY_COLS / 2));
  }
  const bays = Array.from({ length: BAY_COLS }, (_, i) => bayStart + i);
  const shelves = Array.from({ length: SHELF_ROWS }, (_, i) => i + 1);

  return (
    <div style={{
      marginTop: '14px',
      padding: '12px 14px',
      background: 'var(--af-highlight-bg)',
      border: '1px solid var(--af-highlight-border)',
      borderRadius: '10px',
    }}>
      {/* Aisle + side header */}
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        {location.aisle && (
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--af-green-dark)' }}>
            <i className="fa-solid fa-location-dot" style={{ marginRight: '6px' }} />
            Aisle {location.aisle}
          </span>
        )}
        {sideLabel && (
          <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--af-text-muted)', fontWeight: 500 }}>
            · {sideLabel}
          </span>
        )}
      </div>

      {/* Column (bay) header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `20px repeat(${BAY_COLS}, 1fr)`,
        gap: '3px',
        marginBottom: '3px',
      }}>
        <div style={{ fontSize: '8px', color: 'var(--af-text-faint)', display: 'flex', alignItems: 'flex-end', paddingBottom: '1px' }}>
          Sh
        </div>
        {bays.map((bay) => (
          <div key={bay} style={{
            textAlign: 'center',
            fontSize: '9px',
            fontWeight: bay === targetBay ? 700 : 400,
            color: bay === targetBay ? 'var(--af-green-dark)' : 'var(--af-text-faint)',
          }}>
            {bay}
          </div>
        ))}
      </div>

      {/* Shelf rows × bay columns */}
      {shelves.map((shelf) => (
        <div key={shelf} style={{
          display: 'grid',
          gridTemplateColumns: `20px repeat(${BAY_COLS}, 1fr)`,
          gap: '3px',
          marginBottom: '3px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '3px',
            fontSize: '9px',
            fontWeight: shelf === targetShelf ? 700 : 400,
            color: shelf === targetShelf ? 'var(--af-green-dark)' : 'var(--af-text-faint)',
          }}>
            {shelf}
          </div>
          {bays.map((bay) => {
            const isTarget = shelf === targetShelf && bay === targetBay;
            return (
              <div key={bay} style={{
                height: '24px',
                borderRadius: '4px',
                backgroundColor: isTarget ? 'var(--af-green)' : 'var(--af-inset-bg)',
                border: `1px solid ${isTarget ? 'var(--af-green)' : 'var(--af-border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isTarget && (
                  <i className="fa-solid fa-location-dot" style={{ color: 'white', fontSize: '12px' }} />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Bay range axis label */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '4px',
        fontSize: '9px',
        color: 'var(--af-text-faint)',
        paddingLeft: '23px',
      }}>
        <span>
          <i className="fa-solid fa-chevron-left" style={{ fontSize: '7px', marginRight: '2px' }} />
          Bay {bayStart}
        </span>
        <span>
          Bay {bayStart + BAY_COLS - 1}
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '7px', marginLeft: '2px' }} />
        </span>
      </div>

      {location.description && (
        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--af-text-faint)', fontStyle: 'italic' }}>
          {location.description}
        </div>
      )}
    </div>
  );
};

// Centered popup (not a bottom sheet) showing product photo, full name/brand/size,
// and an in-aisle shelf×bay grid. Opened from the info icon in shop mode.
const ItemInfoSheet = ({ item, store, onClose }) => {
  const [state, setState] = useState({ status: 'idle' });
  const [resultIndex, setResultIndex] = useState(0);
  const cache = useRef({});

  useEffect(() => {
    setResultIndex(0);
    if (!item) return;
    const key = `${store ? store.id : 'default'}::${item.toLowerCase()}`;
    if (key in cache.current) {
      setState({ status: 'done', results: cache.current[key] });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchItemDetails({ item, store })
      .then((results) => {
        cache.current[key] = results;
        if (!cancelled) setState({ status: 'done', results });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [item, store]);

  if (!item) return null;

  const results = state.status === 'done' ? state.results : [];
  const details = results[resultIndex] || null;
  const location = details && details.location;
  const subtitle = details
    && [details.brand, details.size, details.category].filter(Boolean).join(' · ');
  const humanePick = getHumanePick(item);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--af-backdrop)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        background: 'var(--af-popup-bg)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: 'var(--af-shadow-lg)',
        width: '100%',
        maxWidth: '340px',
        maxHeight: '85vh',
        overflowY: 'auto',
        position: 'relative',
        animation: 'popupZoomIn 0.18s ease',
        color: 'var(--af-text)',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--af-text-muted)',
            fontSize: '16px',
            padding: '4px 6px',
            borderRadius: '6px',
            lineHeight: 1,
          }}
        >
          <i className="fa-solid fa-xmark" />
        </button>

        <div style={{ textAlign: 'center', minHeight: '120px', paddingRight: '20px' }}>
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

          {state.status === 'done' && results.length === 0 && (
            <>
              <div style={{ padding: '30px 0 14px', color: 'var(--af-text-muted)', fontSize: '13px' }}>
                No match for this item at {store ? store.name : 'this store'}.
              </div>
              {humanePick && <HumanePick pick={humanePick} />}
            </>
          )}

          {details && (
            <>
              {humanePick && <HumanePick pick={humanePick} />}

              {details.image && (
                <div style={{
                  background: 'white',
                  border: '1px solid var(--af-border)',
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'inline-block',
                  marginBottom: '14px',
                  marginTop: humanePick ? '14px' : '0',
                }}>
                  <img
                    src={details.image}
                    alt={details.name}
                    style={{ maxWidth: '160px', maxHeight: '160px', display: 'block' }}
                  />
                </div>
              )}

              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--af-text)', lineHeight: 1.3 }}>
                {details.name}
              </div>
              {subtitle && (
                <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '5px' }}>
                  {subtitle}
                </div>
              )}

              {location ? (
                <AisleDiagram location={location} />
              ) : (
                <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--af-text-muted)' }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: '5px' }} />
                  Exact location unavailable
                  {details.category ? ` — look in ${details.category}` : ''}
                </div>
              )}

              {results.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '14px' }}>
                  <button
                    onClick={() => setResultIndex((i) => i - 1)}
                    disabled={resultIndex === 0}
                    style={{ background: 'none', border: 'none', cursor: resultIndex === 0 ? 'default' : 'pointer', color: resultIndex === 0 ? 'var(--af-text-faint)' : 'var(--af-text-muted)', fontSize: '16px', padding: '4px 8px' }}
                  >
                    <i className="fa-solid fa-chevron-left" />
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--af-text-muted)', minWidth: '40px', textAlign: 'center' }}>
                    {resultIndex + 1} / {results.length}
                  </span>
                  <button
                    onClick={() => setResultIndex((i) => i + 1)}
                    disabled={resultIndex === results.length - 1}
                    style={{ background: 'none', border: 'none', cursor: resultIndex === results.length - 1 ? 'default' : 'pointer', color: resultIndex === results.length - 1 ? 'var(--af-text-faint)' : 'var(--af-text-muted)', fontSize: '16px', padding: '4px 8px' }}
                  >
                    <i className="fa-solid fa-chevron-right" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemInfoSheet;

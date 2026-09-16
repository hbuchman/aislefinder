import React, { useState, useMemo } from 'react';
import { daysAgoLabel } from '../listsStore';
import { itemKey } from '../listUtils';

const previewText = (items) => {
  const top = [...items].sort((a, b) => b.count - a.count).slice(0, 4).map((it) => it.name);
  const more = items.length - top.length;
  return top.join(', ') + (more > 0 ? ` +${more} more` : '');
};

const sortItems = (items, sort) => {
  const copy = [...items];
  if (sort === 'count') copy.sort((a, b) => b.count - a.count);
  else if (sort === 'recent') copy.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  else copy.sort((a, b) => a.name.localeCompare(b.name));
  return copy;
};

// A single list's full purchase roster: search, sort, multi-select, and a
// bulk "add to current list". Reached by opening a group on the root screen.
const ListDetail = ({ group, currentList, addItems, toast, onBack }) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('count');
  const [selected, setSelected] = useState({});

  const onCurrentList = useMemo(() => {
    const names = new Set((currentList ? currentList.items : []).map((it) => it.name));
    return names;
  }, [currentList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? group.items.filter((it) => it.name.includes(q)) : group.items;
    return sortItems(matches, sort);
  }, [group, query, sort]);

  const toggleItem = (name) => {
    if (onCurrentList.has(name)) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[name]) delete next[name];
      else next[name] = true;
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) => {
      const next = { ...prev };
      filtered.forEach((it) => { if (!onCurrentList.has(it.name)) next[it.name] = true; });
      return next;
    });
  };

  const selectedNames = Object.keys(selected);
  const targetName = currentList ? currentList.name : 'your list';

  const handleAdd = () => {
    if (!currentList || selectedNames.length === 0) return;
    const added = addItems(currentList.id, selectedNames);
    setSelected({});
    toast(added > 0
      ? `Added ${added} item${added === 1 ? '' : 's'} to ${targetName}`
      : 'Everything is already on your list');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 4px' }}>
        <button className="af-backbtn" onClick={onBack}>
          <i className="fa-solid fa-chevron-left" style={{ marginRight: '5px', fontSize: '12px' }} />
          History
        </button>
      </div>
      <div style={{ padding: '2px 16px 0' }}>
        <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 700 }}>{group.name}</h2>
        <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '4px' }}>
          {group.items.length} item{group.items.length === 1 ? '' : 's'} ever bought &middot; {group.trips} trip{group.trips === 1 ? '' : 's'} &middot; last {daysAgoLabel(group.lastAt)}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 8px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${group.name}'s history`}
          className="af-input"
          style={{
            width: '100%',
            padding: '9px 12px',
            border: '2px solid var(--af-input-border)',
            borderRadius: '8px',
            outline: 'none',
            backgroundColor: 'var(--af-inset-bg)',
            color: 'var(--af-text)',
            fontFamily: 'inherit',
            marginBottom: '10px',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: 'var(--af-text-faint)' }}>
            {filtered.length} ITEM{filtered.length === 1 ? '' : 'S'}
          </span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {filtered.some((it) => !onCurrentList.has(it.name)) && (
              <button
                onClick={selectAll}
                style={{ background: 'none', border: 0, color: 'var(--af-green)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
              >
                Select all
              </button>
            )}
            {['count', 'recent', 'az'].map((opt) => (
              <button
                key={opt}
                className={sort === opt ? 'af-btn-sm af-btn-sm-green' : 'af-btn-sm'}
                style={{ padding: '4px 9px', fontSize: '11px' }}
                onClick={() => setSort(opt)}
              >
                {opt === 'count' ? 'Most bought' : opt === 'recent' ? 'Recent' : 'A–Z'}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--af-text-faint)' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '26px', marginBottom: '10px', display: 'block' }} />
            <p style={{ fontSize: '13px', margin: 0 }}>No items match &ldquo;{query}&rdquo;.</p>
          </div>
        ) : (
          filtered.map((it) => {
            const onList = onCurrentList.has(it.name);
            const checked = !!selected[it.name];
            return (
              <div
                key={itemKey(it.name)}
                className="af-checklist-item"
                onClick={() => toggleItem(it.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 6px',
                  borderBottom: '1px solid var(--af-border)',
                  cursor: onList ? 'default' : 'pointer',
                  borderRadius: '6px',
                }}
              >
                <div style={{
                  width: '19px',
                  height: '19px',
                  borderRadius: '5px',
                  flexShrink: 0,
                  border: `2px solid ${checked ? 'var(--af-green)' : 'var(--af-text-muted)'}`,
                  backgroundColor: checked ? 'var(--af-green)' : 'var(--af-inset-bg)',
                  opacity: onList ? 0.4 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {checked && <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '10px' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14.5px' }}>{it.name}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--af-text-muted)', marginTop: '2px' }}>
                    Bought {it.count}&times; here &middot; {daysAgoLabel(it.lastAt)}{it.lastStore ? ` at ${it.lastStore}` : ''}
                  </div>
                </div>
                {onList && <span className="af-badge">On list</span>}
              </div>
            );
          })
        )}
      </div>

      {selectedNames.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px calc(10px + var(--safe-area-inset-bottom))',
          borderTop: '1px solid var(--af-border)',
          backgroundColor: 'var(--af-surface)',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--af-text-muted)', flex: 1 }}>
            {selectedNames.length} selected
          </span>
          <button className="af-btn-sm" onClick={() => setSelected({})}>Cancel</button>
          <button className="af-btn" onClick={handleAdd}>
            <i className="fa-solid fa-basket-shopping" style={{ marginRight: '6px' }} />
            Add {selectedNames.length} to {targetName}
          </button>
        </div>
      )}
    </div>
  );
};

const HistoryScreen = ({ purchaseHistory, currentList, addItems, onDeleteGroup, user, toast, onBack }) => {
  const [activeGroupName, setActiveGroupName] = useState(null);

  const activeGroup = activeGroupName
    ? purchaseHistory.find((g) => g.name === activeGroupName)
    : null;

  if (activeGroup) {
    return (
      <ListDetail
        group={activeGroup}
        currentList={currentList}
        addItems={addItems}
        toast={toast}
        onBack={() => setActiveGroupName(null)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 4px' }}>
        <button className="af-backbtn" onClick={onBack}>
          <i className="fa-solid fa-chevron-left" style={{ marginRight: '5px', fontSize: '12px' }} />
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>History</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px' }}>
        {purchaseHistory.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--af-text-faint)' }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              No shopping history yet. Finish a trip and it&rsquo;ll show up here, grouped by list.
            </p>
          </div>
        )}

        {purchaseHistory.map((group) => (
          <div key={group.name} className="af-card" onClick={() => setActiveGroupName(group.name)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, flex: 1 }}>
                {group.name}
                {currentList && group.name === currentList.name && (
                  <span className="af-badge" style={{ marginLeft: '8px' }}>Active</span>
                )}
              </span>
              <button
                className="af-itemremove"
                style={{ opacity: 1 }}
                title="Delete this list's history"
                onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.name); }}
              >
                <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
              </button>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: '12px', color: 'var(--af-text-faint)' }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '5px' }}>
              {group.items.length} item{group.items.length === 1 ? '' : 's'} &middot; {group.trips} trip{group.trips === 1 ? '' : 's'} &middot; last {daysAgoLabel(group.lastAt)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--af-text-faint)', marginTop: '6px', lineHeight: 1.5 }}>
              {previewText(group.items)}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        textAlign: 'center',
        fontSize: '11px',
        color: 'var(--af-text-faint)',
        padding: '8px 16px calc(14px + var(--safe-area-inset-bottom))',
      }}>
        {user
          ? 'Your history syncs with your account.'
          : 'History is saved on this device — sign in to keep it safe.'}
      </div>
    </div>
  );
};

export default HistoryScreen;

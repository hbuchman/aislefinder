import React, { useState, useMemo } from 'react';
import { groupPurchaseHistory, daysAgoLabel } from '../listsStore';
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
// bulk "add to current list". Reached by expanding a card in My Lists.
const HistoryDetail = ({ group, currentList, addItems, toast, user, onBack }) => {
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
          My Lists
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

      {selectedNames.length > 0 ? (
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
      ) : (
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
      )}
    </div>
  );
};

const MyListsScreen = ({
  activeLists,
  completedLists,
  currentList,
  onOpenList,
  onCreateList,
  onDeleteList,
  onDeleteHistory,
  onStartFromHistory,
  addItems,
  toast,
  user,
  onBack,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [expandedName, setExpandedName] = useState(null);

  const currentListId = currentList ? currentList.id : null;

  const historyGroups = useMemo(() => groupPurchaseHistory(completedLists), [completedLists]);

  const listCards = useMemo(() => {
    const byName = new Map();
    activeLists.forEach((list) => {
      byName.set(list.name, { name: list.name, active: list, history: null });
    });
    historyGroups.forEach((group) => {
      const existing = byName.get(group.name);
      if (existing) existing.history = group;
      else byName.set(group.name, { name: group.name, active: null, history: group });
    });
    return [...byName.values()];
  }, [activeLists, historyGroups]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreateList(name);
    setNewName('');
    setCreating(false);
  };

  const expandedGroup = expandedName ? historyGroups.find((g) => g.name === expandedName) : null;

  if (expandedGroup) {
    return (
      <HistoryDetail
        group={expandedGroup}
        currentList={currentList}
        addItems={addItems}
        toast={toast}
        user={user}
        onBack={() => setExpandedName(null)}
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
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>My Lists</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px' }}>
        {listCards.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--af-text-faint)' }}>
            <i className="fa-solid fa-rectangle-list" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              No lists yet. Create one to get started.
            </p>
          </div>
        )}

        {listCards.map((card) => {
          const { name, active, history } = card;
          if (active) {
            return (
              <div key={name} className="af-card" onClick={() => onOpenList(active.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>
                    {name}
                    {active.id === currentListId && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--af-focus)', marginLeft: '8px' }}>
                        CURRENT
                      </span>
                    )}
                  </span>
                  {active.members && active.members.length > 1 && (
                    <span className="af-badge">
                      <i className="fa-solid fa-user-group" style={{ fontSize: '9px', marginRight: '4px' }} />
                      Shared
                    </span>
                  )}
                  {activeLists.length > 1 && (
                    <button
                      className="af-itemremove"
                      style={{ opacity: 1 }}
                      title="Delete list"
                      onClick={(e) => { e.stopPropagation(); onDeleteList(active); }}
                    >
                      <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '4px' }}>
                  {active.items.length} item{active.items.length === 1 ? '' : 's'}
                  {active.store ? ` · ${active.store.name}` : ''}
                </div>
                {history && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedName(name); }}
                    style={{ background: 'none', border: 0, color: 'var(--af-green)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: '8px', fontFamily: 'inherit' }}
                  >
                    <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '5px' }} />
                    History &middot; {history.items.length} item{history.items.length === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            );
          }

          return (
            <div key={name} className="af-card" onClick={() => setExpandedName(name)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>{name}</span>
                <button
                  className="af-itemremove"
                  style={{ opacity: 1 }}
                  title="Delete this list's history"
                  onClick={(e) => { e.stopPropagation(); onDeleteHistory(name); }}
                >
                  <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
                </button>
                <i className="fa-solid fa-chevron-right" style={{ fontSize: '12px', color: 'var(--af-text-faint)' }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '5px' }}>
                {history.items.length} item{history.items.length === 1 ? '' : 's'} &middot; {history.trips} trip{history.trips === 1 ? '' : 's'} &middot; last {daysAgoLabel(history.lastAt)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--af-text-faint)', marginTop: '6px', lineHeight: 1.5 }}>
                {previewText(history.items)}
              </div>
              <button
                className="af-btn-sm af-btn-sm-green"
                style={{ marginTop: '10px' }}
                onClick={(e) => { e.stopPropagation(); onStartFromHistory(name); }}
              >
                <i className="fa-solid fa-basket-shopping" style={{ marginRight: '6px' }} />
                Shop again
              </button>
            </div>
          );
        })}

        {creating ? (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="List name (e.g. Costco Run)"
              className="af-input"
              style={{
                flex: 1,
                padding: '11px 12px',
                border: '2px solid var(--af-input-border)',
                borderRadius: '10px',
                backgroundColor: 'var(--af-inset-bg)',
                color: 'var(--af-text)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button className="af-btn" disabled={!newName.trim()} onClick={handleCreate}>Create</button>
          </div>
        ) : (
          <button className="af-newlistbtn" onClick={() => setCreating(true)}>
            <i className="fa-solid fa-plus" style={{ marginRight: '8px' }} />
            New List
          </button>
        )}
      </div>
    </div>
  );
};

export default MyListsScreen;

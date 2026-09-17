import React, { useMemo, useState } from 'react';
import Sheet from './Sheet';

// Switch between lists, or create a new one. Every list you've ever used
// shows up here the same way, whether it's currently active or not — a past
// list just starts out with no items when you tap back into it.
const ListsSheet = ({
  open,
  onClose,
  activeLists,
  historyOnlyGroups,
  currentListId,
  onSelectList,
  onCreateList,
  onDeleteList,
  onDeleteHistory,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const rows = useMemo(() => [
    ...activeLists.map((list) => ({ isActive: true, id: list.id, name: list.name, items: list.items, store: list.store, members: list.members })),
    ...historyOnlyGroups.map((group) => ({ isActive: false, id: null, name: group.name, items: [], store: null, members: [] })),
  ], [activeLists, historyOnlyGroups]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreateList(name);
    setNewName('');
    setCreating(false);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>
        <i className="fa-solid fa-rectangle-list" style={{ marginRight: '8px', color: 'var(--af-focus)' }} />
        Your Lists
      </h3>

      {rows.map((row) => (
        <div
          key={row.isActive ? row.id : `history-${row.name}`}
          className="af-card"
          onClick={() => (row.isActive ? onSelectList(row.id) : onCreateList(row.name))}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>
              {row.name}
              {row.id === currentListId && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--af-focus)', marginLeft: '8px' }}>
                  CURRENT
                </span>
              )}
            </span>
            {row.members && row.members.length > 1 && (
              <span className="af-badge">
                <i className="fa-solid fa-user-group" style={{ fontSize: '9px', marginRight: '4px' }} />
                Shared
              </span>
            )}
            {(row.isActive ? activeLists.length > 1 : true) && (
              <button
                className="af-itemremove"
                style={{ opacity: 1 }}
                title="Delete list"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.isActive) onDeleteList({ id: row.id, name: row.name, status: 'active' });
                  else onDeleteHistory(row.name);
                }}
              >
                <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
              </button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '4px' }}>
            {row.items.length} item{row.items.length === 1 ? '' : 's'}
            {row.store ? ` · ${row.store.name}` : ''}
          </div>
        </div>
      ))}

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
    </Sheet>
  );
};

export default ListsSheet;

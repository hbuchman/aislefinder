import React, { useState } from 'react';
import Sheet from './Sheet';

// Switch between lists, one row per unique name (active or, if none is
// active under that name, the most recently completed trip), or create a
// new list. Per-item purchase history lives inline on the current list
// screen ("Bought before"), not here — this is just list-level switching.
const ListsSheet = ({
  open,
  onClose,
  listGroups = [],
  currentListId,
  onSelectList,
  onReopenList,
  onCreateList,
  onDeleteList,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

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

      {listGroups.map(({ name, list, isActive }) => (
        <div
          key={name}
          className="af-card"
          onClick={() => (isActive ? onSelectList(list.id) : onReopenList(list.id))}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>
              {name}
              {isActive && list.id === currentListId && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--af-focus)', marginLeft: '8px' }}>
                  CURRENT
                </span>
              )}
            </span>
            {isActive && list.members && list.members.length > 1 && (
              <span className="af-badge">
                <i className="fa-solid fa-user-group" style={{ fontSize: '9px', marginRight: '4px' }} />
                Shared
              </span>
            )}
            {listGroups.length > 1 && (
              <button
                className="af-itemremove"
                title="Delete list"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteList(name);
                }}
              >
                <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
              </button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '4px' }}>
            {list.items.length} item{list.items.length === 1 ? '' : 's'}
            {list.store ? ` · ${list.store.name}` : ''}
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

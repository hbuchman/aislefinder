import React, { useState } from 'react';
import Sheet from './Sheet';
import { daysAgoLabel } from '../listsStore';

// Switch between active lists, create a new one, delete one, or start a
// fresh list from a past one that isn't active anymore. This is the only
// place list-level management happens now — the per-list purchase history
// itself lives inline on the current list screen.
const ListsSheet = ({
  open,
  onClose,
  activeLists,
  historyOnlyGroups,
  currentListId,
  onSelectList,
  onCreateList,
  onDeleteList,
  onStartFromHistory,
  onDeleteHistory,
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

      {activeLists.map((list) => (
        <div key={list.id} className="af-card" onClick={() => onSelectList(list.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>
              {list.name}
              {list.id === currentListId && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--af-focus)', marginLeft: '8px' }}>
                  CURRENT
                </span>
              )}
            </span>
            {list.members && list.members.length > 1 && (
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
                onClick={(e) => { e.stopPropagation(); onDeleteList(list); }}
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

      {historyOnlyGroups.length > 0 && (
        <>
          <div className="af-sectionlabel">Past lists</div>
          {historyOnlyGroups.map((group) => (
            <div key={group.name} className="af-card" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>{group.name}</span>
                <button
                  className="af-itemremove"
                  style={{ opacity: 1 }}
                  title="Delete this list's history"
                  onClick={() => onDeleteHistory(group.name)}
                >
                  <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '5px' }}>
                {group.items.length} item{group.items.length === 1 ? '' : 's'} &middot; {group.trips} trip{group.trips === 1 ? '' : 's'} &middot; last {daysAgoLabel(group.lastAt)}
              </div>
              <button
                className="af-btn-sm af-btn-sm-green"
                style={{ marginTop: '10px' }}
                onClick={() => onStartFromHistory(group.name)}
              >
                <i className="fa-solid fa-basket-shopping" style={{ marginRight: '6px' }} />
                Shop again
              </button>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
};

export default ListsSheet;

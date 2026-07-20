import React, { useState } from 'react';
import { completedLabel } from '../listsStore';

const MyListsScreen = ({
  activeLists,
  completedLists,
  currentListId,
  onOpenList,
  onCreateList,
  onDeleteList,
  onMerge,
  onReshop,
  onBack,
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

  const recentCompleted = completedLists.slice(0, 3);

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
        <div className="af-sectionlabel">Active</div>
        {activeLists.map((list) => (
          <div key={list.id} className="af-card" onClick={() => onOpenList(list.id)}>
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

        {recentCompleted.length > 0 && (
          <>
            <div className="af-sectionlabel">Recently completed</div>
            {recentCompleted.map((list) => (
              <div key={list.id} className="af-card" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>{list.name}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--af-green)' }}>
                    {list.items.length} <i className="fa-solid fa-check" style={{ fontSize: '11px' }} />
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '4px' }}>
                  Shopped {completedLabel(list.completedAt)}{list.store ? ` · ${list.store.name}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button className="af-btn-sm" onClick={() => onMerge(list.id)}>
                    <i className="fa-solid fa-arrow-rotate-left" style={{ marginRight: '6px' }} />
                    Add to list
                  </button>
                  <button className="af-btn-sm af-btn-sm-green" onClick={() => onReshop(list.id)}>
                    <i className="fa-solid fa-basket-shopping" style={{ marginRight: '6px' }} />
                    Shop again
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default MyListsScreen;

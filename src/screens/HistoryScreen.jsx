import React from 'react';
import { completedLabel } from '../listsStore';

const monthLabel = (iso) => {
  if (!iso) return 'Earlier';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const HistoryScreen = ({ completedLists, user, onMerge, onReshop, onDeleteList, onBack }) => {
  // Group completed shops by month, newest first (already sorted by store)
  const groups = [];
  completedLists.forEach((list) => {
    const label = monthLabel(list.completedAt);
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, lists: [] };
      groups.push(group);
    }
    group.lists.push(list);
  });

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
        {completedLists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--af-text-faint)' }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              No completed shops yet. Finished trips are saved here.
            </p>
          </div>
        )}

        {groups.map((group) => (
          <React.Fragment key={group.label}>
            <div className="af-sectionlabel">{group.label}</div>
            {group.lists.map((list) => {
              const preview = list.items.slice(0, 6).map((it) => it.name).join(', ');
              const more = list.items.length - 6;
              return (
                <div key={list.id} className="af-card" style={{ cursor: 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>
                      {completedLabel(list.completedAt)}{list.store ? ` · ${list.store.name}` : ` · ${list.name}`}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--af-green)' }}>
                      {list.items.length} <i className="fa-solid fa-check" style={{ fontSize: '11px' }} />
                    </span>
                    <button
                      className="af-itemremove"
                      style={{ opacity: 1 }}
                      title="Delete from history"
                      onClick={() => onDeleteList(list)}
                    >
                      <i className="fa-solid fa-trash-can" style={{ fontSize: '12px' }} />
                    </button>
                  </div>
                  {preview && (
                    <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                      {preview}{more > 0 ? ` +${more} more` : ''}
                    </div>
                  )}
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
              );
            })}
          </React.Fragment>
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

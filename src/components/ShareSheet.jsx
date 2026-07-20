import React, { useState } from 'react';
import Sheet from './Sheet';
import { shareList, joinList, pushList } from '../api';
import { getAccessToken } from '../auth';

const ShareSheet = ({ open, onClose, list, user, updateList, adoptRemoteList, onNeedAccount, toast }) => {
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  const close = () => { setError(''); setJoinCode(''); onClose(); };

  const createShareCode = async () => {
    setBusy(true);
    setError('');
    try {
      const token = await getAccessToken();
      // The list must exist server-side before it can be shared; pushing here
      // avoids a race with the debounced background sync right after sign-in
      await pushList(token, list);
      const result = await shareList(token, list.id);
      updateList(list.id, { shareCode: result.code });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setError('');
    try {
      const token = await getAccessToken();
      const joined = await joinList(token, joinCode.trim().toUpperCase());
      adoptRemoteList(joined);
      toast(`Joined "${joined.name}"`);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(list.shareCode);
      toast('Share code copied');
    } catch {
      toast('Copy failed');
    }
  };

  return (
    <Sheet open={open} onClose={close}>
      {!user ? (
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>
            <i className="fa-solid fa-user-group" style={{ marginRight: '8px', color: 'var(--af-focus)' }} />
            Share your list
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Sharing needs a free account so everyone can reach your list. Guests
            keep full use of everything else.
          </p>
          <button className="af-btn-primary" onClick={() => { close(); onNeedAccount(); }}>
            <i className="fa-solid fa-right-to-bracket" style={{ marginRight: '8px' }} />
            Sign in to share
          </button>
          <button className="af-btn-ghost" style={{ border: 'none' }} onClick={close}>Not now</button>
        </>
      ) : (
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>
            <i className="fa-solid fa-user-group" style={{ marginRight: '8px', color: 'var(--af-focus)' }} />
            Share “{list ? list.name : ''}”
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Anyone with this code can add and check off items. Changes sync for
            everyone.
          </p>

          {list && list.shareCode ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <div style={{
                flex: 1,
                padding: '11px 12px',
                border: '2px solid var(--af-input-border)',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '3px',
                textAlign: 'center',
                backgroundColor: 'var(--af-inset-bg)',
              }}>
                {list.shareCode}
              </div>
              <button className="af-btn" style={{ padding: '0 16px' }} onClick={copyCode}>
                <i className="fa-solid fa-copy" />
              </button>
            </div>
          ) : (
            <button className="af-btn-primary" disabled={busy} onClick={createShareCode}>
              <i className="fa-solid fa-share-nodes" style={{ marginRight: '8px' }} />
              {busy ? 'Creating…' : 'Create share code'}
            </button>
          )}

          {list && list.members && list.members.length > 0 && (
            <div style={{ margin: '4px 0 14px' }}>
              {list.members.map((m) => (
                <div key={m.sub || m.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '14px' }}>
                  <span style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: 'var(--af-amber)',
                    color: '#6b4e00', fontSize: '11px', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {(m.name || '?').charAt(0).toUpperCase()}
                  </span>
                  <span style={{ flex: 1 }}>{m.name}{m.sub === user.sub ? ' (you)' : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--af-border)', paddingTop: '14px', marginTop: '4px' }}>
            <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 10px' }}>
              Have a code from someone else?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Enter share code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                className="af-input"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: '2px solid var(--af-input-border)',
                  borderRadius: '10px',
                  backgroundColor: 'var(--af-inset-bg)',
                  color: 'var(--af-text)',
                  outline: 'none',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              />
              <button className="af-btn" disabled={busy || !joinCode.trim()} onClick={handleJoin}>
                Join
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              backgroundColor: 'var(--af-error-bg)',
              border: '1px solid var(--af-error-border)',
              color: 'var(--af-error-text)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '12px',
              marginTop: '12px',
            }}>
              {error}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
};

export default ShareSheet;

import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { photoToItems } from '../api';
import { resolveOrganizeFormat } from '../listUtils';
import FormatToggle from '../components/FormatToggle';

// The Claude API caps images at 5MB and gains nothing above ~1568px on the
// long edge, so photos are downscaled and re-encoded as JPEG before upload
const PHOTO_MAX_DIMENSION = 1568;

const downscalePhoto = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo — try again"))),
      'image/jpeg',
      0.85,
    );
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("Couldn't read that photo — try again"));
  };
  img.src = url;
});

const CurrentListScreen = ({
  list,
  user,
  addItem,
  removeItem,
  frequentItems,
  updateList,
  onShowLists,
  onShowShare,
  onShowStore,
  onShop,
  toast,
}) => {
  const [input, setInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef(null);
  const photoInputRef = useRef(null);

  // The add bar is the whole point of the home screen — focus it on load.
  // Skip on native apps, where autofocus pops the keyboard over half the
  // screen every time the app opens.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) inputRef.current?.focus();
  }, []);

  if (!list) return null;

  const handleAdd = () => {
    const value = input.trim();
    if (!value) return;
    // Comma-separated entry adds several items at once
    const names = value.split(',').map((s) => s.trim()).filter(Boolean);
    let added = 0;
    names.forEach((name) => { if (addItem(list.id, name)) added++; });
    if (added === 0 && names.length === 1) toast(`${names[0]} is already on the list`);
    setInput('');
    inputRef.current?.focus();
  };

  const handlePhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-taking the same photo
    if (!file) return;
    setScanning(true);
    try {
      // Fall back to the original file if the browser can't decode it
      const blob = await downscalePhoto(file).catch(() => file);
      const items = await photoToItems(blob);
      if (items.length === 0) {
        toast("Couldn't find any list items in that photo");
        return;
      }
      let added = 0;
      items.forEach((name) => { if (addItem(list.id, name)) added++; });
      toast(added > 0
        ? `Added ${added} item${added === 1 ? '' : 's'} from your photo`
        : 'Everything in the photo is already on the list');
    } catch (err) {
      toast(err.message || "Couldn't read that photo — try again");
    } finally {
      setScanning(false);
    }
  };

  const setFormat = (format) => {
    if (format === 'aisle' && !list.store) return;
    if (format === resolveOrganizeFormat(list)) return;
    updateList(list.id, { formatPreference: format, customCategoryOrder: null });
  };

  const isShared = list.members && list.members.length > 1;
  const otherMembers = isShared && user
    ? list.members.filter((m) => m.sub !== user.sub).map((m) => m.name)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* List title + share */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px 2px' }}>
        <button
          onClick={onShowLists}
          title="Switch list"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--af-text)',
            fontSize: '21px',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'inherit',
            letterSpacing: '-0.3px',
          }}
        >
          {list.name}
          <i className="fa-solid fa-chevron-down" style={{ fontSize: '11px', color: 'var(--af-text-faint)' }} />
        </button>
        <div style={{ flex: 1 }} />
        <button className="af-iconbtn" title="Share this list" onClick={onShowShare}>
          <i className="fa-solid fa-user-group" />
        </button>
      </div>
      {isShared && (
        <div style={{ fontSize: '12px', color: 'var(--af-text-muted)', padding: '0 16px 4px' }}>
          <i className="fa-solid fa-user-group" style={{ fontSize: '10px', marginRight: '5px' }} />
          Shared with {otherMembers.length > 0 ? otherMembers.join(', ') : 'others'}
        </div>
      )}

      {/* Quick add */}
      <div style={{ display: 'flex', gap: '8px', margin: '10px 16px 4px' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Add an item…"
          className="af-input"
          style={{
            flex: 1,
            padding: '12px 14px',
            border: '2px solid var(--af-input-border)',
            borderRadius: '10px',
            backgroundColor: 'var(--af-inset-bg)',
            color: 'var(--af-text)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleAdd}
          className="af-btn"
          title="Add item"
          style={{ width: '46px', fontSize: '18px', borderRadius: '10px', padding: 0 }}
        >
          <i className="fa-solid fa-plus" />
        </button>
        <button
          onClick={() => photoInputRef.current?.click()}
          className="af-btn"
          title="Add items from a photo of your list"
          disabled={scanning}
          style={{ width: '46px', fontSize: '18px', borderRadius: '10px', padding: 0 }}
        >
          <i className={scanning ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-camera'} />
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />
      </div>

      {/* Frequent-item suggestions from history */}
      {frequentItems.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 16px 4px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--af-text-faint)' }}>You often buy:</span>
          {frequentItems.map((name) => (
            <button key={name} className="af-freqchip" onClick={() => addItem(list.id, name)}>
              <i className="fa-solid fa-plus" style={{ fontSize: '9px', marginRight: '5px' }} />
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
        {list.items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--af-text-faint)' }}>
            <i className="fa-solid fa-basket-shopping" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            <p style={{ fontSize: '14px', margin: 0 }}>
              Your list is empty. Add items as you think of them.
            </p>
          </div>
        )}
        {list.items.map((item) => (
          <div key={item.id} className="af-listitem">
            <button
              className="af-itemcircle"
              title="Remove item"
              onClick={() => removeItem(list.id, item.id)}
            />
            <span style={{ flex: 1, fontSize: '15px' }}>{item.name}</span>
            <span style={{ fontSize: '11px', color: 'var(--af-text-faint)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              {item.addedBy && (!user || item.addedBy !== user.displayName) && (
                <span style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: 'var(--af-amber)',
                  color: '#6b4e00', fontSize: '8px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.addedBy.charAt(0).toUpperCase()}
                </span>
              )}
              {item.fromList && `from ${item.fromList}`}
            </span>
            <button
              className="af-itemremove"
              title="Remove item"
              onClick={() => removeItem(list.id, item.id)}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ))}
      </div>

      {/* Store + shop footer */}
      <div style={{
        borderTop: '1px solid var(--af-border)',
        padding: '12px 16px calc(14px + var(--safe-area-inset-bottom))',
        background: 'var(--af-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--af-text-muted)' }}>
          <i className="fa-solid fa-location-dot" />
          {list.store ? list.store.name : 'No store selected'}
          <button
            onClick={onShowStore}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--af-focus)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {list.store ? 'Change' : 'Choose store'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--af-text-muted)' }}>Organize by</span>
          <FormatToggle format={resolveOrganizeFormat(list)} onChange={setFormat} aisleDisabled={!list.store} />
        </div>
        <button
          className="af-btn-green"
          style={{ justifyContent: 'center', padding: '14px 24px', fontSize: '16px', borderRadius: '10px' }}
          disabled={list.items.length === 0}
          onClick={onShop}
        >
          <i className="fa-solid fa-basket-shopping" />
          Shop{list.items.length > 0 ? ` (${list.items.length})` : ''}
        </button>
      </div>
    </div>
  );
};

export default CurrentListScreen;

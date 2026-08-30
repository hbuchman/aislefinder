import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { photoToItems } from '../api';
import { parseListItems } from '../listUtils';

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
  onComposingChange,
  toast,
}) => {
  const [input, setInput] = useState('');
  const [scanning, setScanning] = useState(false);
  // True while the add-item input is focused (keyboard open on mobile). Hides
  // the title row and footer so the item list — the thing you're looking at
  // while typing — isn't squeezed down to a couple of rows.
  const [composing, setComposing] = useState(false);
  const inputRef = useRef(null);
  const photoInputRef = useRef(null);

  useEffect(() => { onComposingChange?.(composing); }, [composing, onComposingChange]);
  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);

  // Only collapse chrome on phone-width viewports — desktop has plenty of
  // vertical space and autofocuses this input on load, so gating on focus
  // alone would hide the footer for desktop users on every page load.
  const isNarrowViewport = () => window.matchMedia('(max-width: 640px)').matches;

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
    // Comma- or newline-separated entry adds several items at once
    const names = parseListItems(value);
    let added = 0;
    names.forEach((name) => { if (addItem(list.id, name)) added++; });
    if (added === 0 && names.length === 1) toast(`${names[0]} is already on the list`);
    setInput('');
    inputRef.current?.focus();
  };

  // Pasting a whole grocery list into the box adds every line/comma-separated
  // item at once instead of dumping unparsed text into the single-line field
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text');
    if (!/[\n,]/.test(text)) return;
    const names = parseListItems(text);
    if (names.length === 0) return;
    e.preventDefault();
    let added = 0;
    names.forEach((name) => { if (addItem(list.id, name)) added++; });
    toast(added > 0
      ? `Added ${added} item${added === 1 ? '' : 's'} from your paste`
      : 'Everything pasted is already on the list');
    setInput('');
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

  // Suggestions stay up while typing (that's when they're most useful) and
  // narrow to whatever matches what's been typed so far
  const query = input.trim().toLowerCase();
  const suggestions = query
    ? frequentItems.filter((name) => name.toLowerCase().includes(query))
    : frequentItems;

  const addSuggestion = (name) => {
    addItem(list.id, name);
    setInput('');
    inputRef.current?.focus();
  };

  const isShared = list.members && list.members.length > 1;
  const otherMembers = isShared && user
    ? list.members.filter((m) => m.sub !== user.sub).map((m) => m.name)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* List title stays put while typing so you always know which list
          you're adding to; only the share button swaps for a Done button
          that closes the keyboard, since sharing doesn't apply mid-type */}
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
        {composing ? (
          <button className="af-btn-sm af-btn-sm-green" onClick={() => inputRef.current?.blur()}>
            Done
          </button>
        ) : (
          <button className="af-iconbtn" title="Share this list" onClick={onShowShare}>
            <i className="fa-solid fa-user-group" />
          </button>
        )}
      </div>
      {!composing && isShared && (
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
          onPaste={handlePaste}
          onFocus={() => { if (isNarrowViewport()) setComposing(true); }}
          onBlur={() => setComposing(false)}
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
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />
      </div>

      {/* Frequent-item suggestions from history — stay visible while typing
          and narrow to matches, since that's the moment they help most */}
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 16px 4px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--af-text-faint)' }}>
            {query ? 'Matches:' : 'You often buy:'}
          </span>
          {suggestions.map((name) => (
            <button key={name} className="af-freqchip" onClick={() => addSuggestion(name)}>
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
    </div>
  );
};

export default CurrentListScreen;

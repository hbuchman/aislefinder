import React from 'react';
import Logo from './Logo';

const TopBar = ({ user, onShowLists, onShowChat, onShowAccount, onShowStore, onShop, shopCount, shopDisabled }) => (
  <div className="af-topbar" style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px 10px',
    borderBottom: '1px solid var(--af-chrome-border)',
    background: 'var(--af-chrome)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    paddingTop: 'calc(12px + var(--safe-area-inset-top))',
  }}>
    {/* tile background from CSS var: white in light mode, near-transparent in dark so brighter wall colors carry the logo */}
    <span title="AisleFinder" style={{
      display: 'inline-flex',
      padding: '3px',
      borderRadius: '7px',
      background: 'var(--af-logo-tile)',
      flexShrink: 0,
    }}>
      <Logo size={20} />
    </span>
    <div style={{ flex: 1, minWidth: '8px' }} />
    {/* Scrolls internally instead of overflowing af-shell's clipped edge
        when these don't all fit a narrow phone width */}
    <div className="af-topbar-actions">
      <button className="af-iconbtn" title="Ask AisleFinder" onClick={onShowChat} style={{ flexShrink: 0 }}>
        <i className="fa-solid fa-comment-dots" />
      </button>
      <button className="af-iconbtn" title="My Lists" onClick={onShowLists} style={{ flexShrink: 0 }}>
        <i className="fa-solid fa-rectangle-list" />
      </button>
      {onShowStore && (
        <button className="af-iconbtn" title="Store & organize" onClick={onShowStore} style={{ flexShrink: 0 }}>
          <i className="fa-solid fa-location-dot" />
        </button>
      )}
      {onShop && (
        <button
          className="af-btn-sm af-btn-sm-green"
          title="Start shopping"
          onClick={onShop}
          disabled={shopDisabled}
          style={{ flexShrink: 0 }}
        >
          <i className="fa-solid fa-basket-shopping" style={{ marginRight: '6px' }} />
          Shop{shopCount > 0 ? ` (${shopCount})` : ''}
        </button>
      )}
      <button className="af-chipbtn" title={user ? user.email : 'Account'} onClick={onShowAccount} style={{ flexShrink: 0 }}>
        <span style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: user
            ? 'var(--af-green)'
            : 'var(--af-border)',
          color: user ? 'white' : 'var(--af-text-muted)',
          fontSize: '11px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {user ? user.displayName.charAt(0).toUpperCase() : <i className="fa-solid fa-user" style={{ fontSize: '10px' }} />}
        </span>
        {user ? user.displayName : 'Guest'}
      </button>
    </div>
  </div>
);

export default TopBar;

import React from 'react';
import Logo from './Logo';

const TopBar = ({ user, onShowHistory, onShowLists, onShowAccount }) => (
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
    paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
  }}>
    <div style={{ fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--af-chrome-text)', letterSpacing: '-0.2px' }}>
      {/* white tile keeps the green logo art legible on the green chrome */}
      <span style={{
        display: 'inline-flex',
        padding: '3px',
        borderRadius: '7px',
        background: '#ffffff',
      }}>
        <Logo size={20} />
      </span>
      <span>
        <span style={{ fontWeight: 700 }}>Aisle</span>
        <span style={{ fontWeight: 400 }}>Finder</span>
      </span>
    </div>
    <div style={{ flex: 1 }} />
    <button className="af-iconbtn" title="History" onClick={onShowHistory}>
      <i className="fa-solid fa-clock-rotate-left" />
    </button>
    <button className="af-iconbtn" title="My Lists" onClick={onShowLists}>
      <i className="fa-solid fa-rectangle-list" />
    </button>
    <button className="af-chipbtn" title={user ? user.email : 'Account'} onClick={onShowAccount}>
      <span style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: user
          ? 'var(--af-green)'
          : 'rgba(255, 255, 255, 0.28)',
        color: 'white',
        fontSize: '11px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {user ? user.displayName.charAt(0).toUpperCase() : <i className="fa-solid fa-user" style={{ fontSize: '10px' }} />}
      </span>
      {user ? user.displayName : 'Guest'}
    </button>
  </div>
);

export default TopBar;

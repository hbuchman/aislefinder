import React from 'react';

// Bottom sheet used for account, share, and store pickers
const Sheet = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--af-backdrop)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--af-popup-bg)',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '85vh',
        overflowY: 'auto',
        borderRadius: '18px 18px 0 0',
        padding: '16px 20px calc(24px + var(--safe-area-inset-bottom))',
        boxShadow: 'var(--af-shadow-lg)',
        color: 'var(--af-text)',
        animation: 'sheetSlideUp 0.22s ease',
      }}>
        <div style={{
          width: '36px',
          height: '4px',
          borderRadius: '999px',
          background: 'var(--af-border)',
          margin: '0 auto 14px',
        }} />
        {children}
      </div>
    </div>
  );
};

export default Sheet;

import React from 'react';

// Segmented aisle/category switch, shared by the home screen (set a
// preference before shopping) and shop mode (change it mid-trip).
// Aisle needs a store picked first (aisle numbers are store-specific), so it
// can be disabled independently of the other option.
const FormatToggle = ({ format, onChange, disabled, aisleDisabled }) => (
  <div style={{
    display: 'inline-flex',
    border: '1px solid var(--af-border)',
    borderRadius: '999px',
    padding: '2px',
    flexShrink: 0,
  }}>
    {['aisle', 'category'].map((option) => {
      const active = option === format;
      const optionDisabled = disabled || (option === 'aisle' && aisleDisabled);
      return (
        <button
          key={option}
          onClick={() => onChange(option)}
          disabled={optionDisabled}
          title={option === 'aisle'
            ? (aisleDisabled ? 'Choose a store first to organize by aisle' : 'Organize by store aisle')
            : 'Organize by category'}
          style={{
            border: 'none',
            borderRadius: '999px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: optionDisabled ? 'not-allowed' : 'pointer',
            background: active ? 'var(--af-green)' : 'none',
            color: active ? 'white' : (option === 'aisle' && aisleDisabled ? 'var(--af-text-faint)' : 'var(--af-text-muted)'),
            opacity: option === 'aisle' && aisleDisabled ? 0.55 : 1,
            transition: 'all 0.2s ease',
          }}
        >
          {option === 'aisle' ? 'Aisle' : 'Category'}
        </button>
      );
    })}
  </div>
);

export default FormatToggle;

import React from 'react';

// AisleFinder logo: two shelves receding down an aisle form an "A", with a
// checked shelf as the crossbar. All-green mark; legs slightly darker than
// the crossbar. Same artwork as public/logo.svg — keep the two in sync.
const Logo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-label="AisleFinder logo" role="img">
    <defs>
      <linearGradient id="afLogoLegs" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#229955" />
        <stop offset="1" stopColor="#157a40" />
      </linearGradient>
      <linearGradient id="afLogoShelf" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2ecc71" />
        <stop offset="1" stopColor="#1a9c4e" />
      </linearGradient>
    </defs>
    <path d="M6 58 L24 6 h9 L18 58 z" fill="url(#afLogoLegs)" />
    <path d="M58 58 L40 6 h-9 L46 58 z" fill="url(#afLogoLegs)" />
    <rect x="19" y="38" width="26" height="7" rx="3.5" fill="url(#afLogoShelf)" />
    <path d="M27 27l4 4 7-8" fill="none" stroke="#27ae60" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="6" y="60" width="16" height="3.5" rx="1.75" fill="#95a5a6" opacity="0.4" />
    <rect x="42" y="60" width="16" height="3.5" rx="1.75" fill="#95a5a6" opacity="0.4" />
  </svg>
);

export default Logo;

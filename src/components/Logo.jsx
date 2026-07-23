import React from 'react';

// AisleFinder logo: perspective aisle with a dashed route curving to an amber pin
// on the right wall, and a single mint shelf on the right wall.
// Same artwork as public/logo.svg — keep the two in sync.
const Logo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-label="AisleFinder logo" role="img">
    <path className="af-logo-wall-l" d="M4 58 L28 12 L32 12 L14 58 Z" fill="#1a9c4e"/>
    <path className="af-logo-wall-r" d="M60 58 L36 12 L32 12 L50 58 Z" fill="#157a40"/>
    <path d="M44 28 L38 28" stroke="#aaf0ce" strokeWidth="3.5" strokeLinecap="round"/>
    <path d="M32 56 C32 42 40 28 46 19" fill="none" stroke="#f5a623" strokeWidth="2.5" strokeDasharray="2 6.5" strokeLinecap="round"/>
    <path d="M46 2 c4.2 0 6.8 3.1 6.8 6.5 C52.8 14 46 19 46 19 S39.2 14 39.2 8.5 C39.2 5.1 41.8 2 46 2 Z" fill="#f5a623"/>
    <circle cx="46" cy="8" r="2.5" fill="#fff"/>
  </svg>
);

export default Logo;

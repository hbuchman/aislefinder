import React from 'react';
import ReactDOM from 'react-dom/client';
import AisleFinder from './AisleFinder';
import { hydrateStorage } from './storage';

// On iOS/Android, restore durable native storage into localStorage before the
// app reads any state; on web this resolves immediately.
hydrateStorage().finally(() => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <AisleFinder />
    </React.StrictMode>
  );
});

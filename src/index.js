import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundled locally (not the CDN kit) so icons render offline in the native
// apps. Only the solid set is imported — the app uses fa-solid exclusively.
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth';
import { useLists } from './listsStore';
import { loadState, saveState } from './storage';
import { onNetworkChange } from './network';
import { applySystemBars } from './systemBars';
import TopBar from './components/TopBar';
import AccountSheet from './components/AccountSheet';
import ShareSheet from './components/ShareSheet';
import StoreSheet from './components/StoreSheet';
import ListsSheet from './components/ListsSheet';
import CurrentListScreen from './screens/CurrentListScreen';
import ShopScreen from './screens/ShopScreen';
import ChatScreen from './screens/ChatScreen';

const AisleFinder = () => {
  const auth = useAuth();
  const store = useLists(auth.user);

  // screen: 'list' (home) | 'shop' | 'chat'
  const [screen, setScreen] = useState('list');
  // sheet: null | 'account' | 'share' | 'store' | 'lists'
  const [sheet, setSheet] = useState(null);
  const [outputFormat, setOutputFormat] = useState(() => loadState('outputFormat', 'numbered'));
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => { saveState('outputFormat', outputFormat); }, [outputFormat]);

  // Native status/gesture bar icon colors follow the color scheme; Android
  // also resets them on rotation and theme changes, so re-apply on those
  // events too.
  useEffect(() => {
    applySystemBars();
    const reapply = () => applySystemBars();
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener('change', reapply);
    window.addEventListener('orientationchange', reapply);
    return () => {
      mq?.removeEventListener('change', reapply);
      window.removeEventListener('orientationchange', reapply);
    };
  }, [screen]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
  }, []);

  // Lists are cached on-device, so offline mode keeps working; let the user
  // know their edits are safe and will sync when they reconnect.
  useEffect(() => onNetworkChange((connected) => {
    toast(connected ? 'Back online — syncing' : 'Offline — changes saved on this device');
  }), [toast]);

  const openList = (id) => {
    store.setCurrentListId(id);
    setScreen('list');
    setSheet(null);
  };

  const handleReopenList = (id) => {
    store.reopenList(id);
    setScreen('list');
    setSheet(null);
    toast('Trip reopened');
  };

  const handleCreateList = (name) => {
    store.createList(name);
    setScreen('list');
    setSheet(null);
  };

  const handleDeleteListGroup = (name) => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) {
      store.lists.filter((l) => l.name === name).forEach((l) => store.deleteList(l.id));
      toast('Deleted');
    }
  };

  const handleDeleteHistoryGroup = (name) => {
    if (window.confirm(`Delete all shopping history for "${name}"? This can't be undone.`)) {
      store.completedLists.filter((l) => l.name === name).forEach((l) => store.deleteList(l.id));
      toast('Deleted');
    }
  };

  return (
    <div className="af-shell" style={{
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--af-bg)',
      fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Global styles for theme, hover effects, animations, and mobile */}
      <style>{`
        /* Theme palette ("Ocean Fresh — Amber Nav"). CORE COLORS ONLY — six
           neutrals, one navy pair, one amber, one error tone per scheme.
           There is no separate chrome color in this scheme — the top bar
           sits flush on --af-bg, so --af-chrome* alias the body neutrals.
           Everything below the "derived" line is an alias or an alpha tint
           of a core color; add new colors to the core set only as a last
           resort. Dark values keep adjacent surfaces apart and text/background
           pairs at WCAG AA (4.5:1). */
        :root {
          color-scheme: light dark;
          /* Safe-area insets that work on BOTH platforms: iOS resolves env()
             here; Capacitor 8 on Android leaves env() at 0 and instead injects
             --safe-area-inset-* as inline styles on <html>, which override
             these fallbacks. Always pad with var(--safe-area-inset-*). */
          --safe-area-inset-top: env(safe-area-inset-top, 0px);
          --safe-area-inset-right: env(safe-area-inset-right, 0px);
          --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
          --safe-area-inset-left: env(safe-area-inset-left, 0px);
          /* core neutrals */
          --af-bg: #ffffff;
          --af-inset-bg: #eff5fb;
          --af-surface: #e4edf6;
          --af-border: #d9e7f2;
          --af-text: #1c2a3a;
          --af-text-muted: #5f7183;
          /* core accents */
          --af-green: #1f5fa0;
          --af-green-dark: #153f6e;
          --af-chrome: var(--af-bg);
          --af-amber: #ffb52e;
          --af-amber-text: #8a5f0e;
          --af-error-text: #b3541e;
          /* derived — aliases and tints of the core colors */
          --af-chrome-text: var(--af-text);
          --af-chrome-muted: var(--af-text-muted);
          --af-chrome-border: var(--af-border);
          --af-popup-bg: var(--af-inset-bg);
          --af-input-border: var(--af-border);
          --af-text-faint: var(--af-text-muted);
          --af-focus: var(--af-green);
          --af-highlight-bg: rgba(31, 95, 160, 0.07);
          --af-highlight-border: rgba(31, 95, 160, 0.35);
          --af-error-bg: rgba(179, 84, 30, 0.08);
          --af-error-border: rgba(179, 84, 30, 0.35);
          --af-disabled-bg: var(--af-border);
          --af-disabled-text: var(--af-text-muted);
          --af-toast-bg: var(--af-text);
          --af-toast-text: var(--af-bg);
          --af-celebrate-bg: rgba(31, 95, 160, 0.12);
          --af-celebrate-text: var(--af-green-dark);
          --af-green-soft: rgba(31, 95, 160, 0.15);
          --af-amber-soft-bg: rgba(255, 181, 46, 0.10);
          --af-amber-soft-border: rgba(255, 181, 46, 0.30);
          --af-amber-soft-tile: rgba(255, 181, 46, 0.22);
          --af-btn-hover-bg: var(--af-green-dark);
          --af-btn-shadow: 0 2px 8px rgba(31, 95, 160, 0.3);
          --af-btn-shadow-hover: 0 4px 12px rgba(31, 95, 160, 0.4);
          --af-backdrop: rgba(0, 0, 0, 0.2);
          --af-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          --af-shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.15);
          --af-logo-tile: var(--af-inset-bg);
        }
        .af-logo-aisle { fill: #1f5fa0; }
        .af-logo-route { stroke: var(--af-amber); }
        .af-logo-pin { fill: var(--af-amber); }
        @media (prefers-color-scheme: dark) {
          :root {
            /* core neutrals — deep navy, not neutral black */
            --af-bg: #0d1420;
            --af-inset-bg: #141f2e;
            --af-surface: #1a2636;
            --af-border: #28405c;
            --af-text: #e1e7ee;
            --af-text-muted: #8fa0b3;
            /* core accents — navy desaturated so it doesn't glow on dark */
            --af-green: #3f7fc4;
            --af-green-dark: #96bee6;
            --af-amber: #d99a2b;
            --af-error-text: #ffab70;
            --af-amber-text: var(--af-amber);
            /* derived */
            --af-popup-bg: var(--af-surface);
            --af-highlight-bg: rgba(63, 127, 196, 0.12);
            --af-highlight-border: rgba(63, 127, 196, 0.35);
            --af-error-bg: rgba(255, 171, 112, 0.10);
            --af-error-border: rgba(255, 171, 112, 0.35);
            --af-green-soft: rgba(63, 127, 196, 0.15);
            --af-amber-soft-bg: rgba(217, 154, 43, 0.10);
            --af-amber-soft-border: rgba(217, 154, 43, 0.30);
            --af-amber-soft-tile: rgba(217, 154, 43, 0.22);
            --af-btn-hover-bg: #2f68a8;
            --af-btn-shadow: 0 2px 8px rgba(63, 127, 196, 0.25);
            --af-btn-shadow-hover: 0 4px 12px rgba(63, 127, 196, 0.35);
            --af-backdrop: rgba(0, 0, 0, 0.55);
            --af-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
            --af-shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.6);
          }
          .af-logo-aisle { fill: #96bee6; }
        }
        html, body {
          background-color: var(--af-bg);
          overscroll-behavior: none;
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
        /* 16px+ keeps iOS Safari/WebView from auto-zooming a focused input */
        input, textarea, select {
          font-size: 16px;
        }
        /* dvh with a vh fallback for older WebViews (inline styles can't
           declare the same property twice) */
        .af-shell {
          height: 100vh;
          height: 100dvh;
        }
        /* Same dvh-with-vh-fallback treatment for sheets/popups that cap
           their height at a viewport fraction: plain vh is measured against
           the browser's largest viewport (address bar hidden), so with the
           address bar showing — or the keyboard open, which these sheets'
           text inputs trigger constantly — the real visible area is
           smaller and content (often the submit button) renders below the
           fold. dvh tracks the actual visible viewport instead. */
        .af-sheet-panel {
          max-height: 85vh;
          max-height: 85dvh;
        }
        /* The top bar's action buttons (chat/history/lists/store/shop/account)
           can outgrow narrow phone widths, especially with store+shop shown
           on the home screen. overflow-x here (rather than visible) makes
           this flex item's automatic minimum width 0 instead of its content
           width, so it shrinks first and scrolls internally instead of
           pushing content past af-shell's clipping edge and off-screen. */
        .af-topbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .af-topbar-actions::-webkit-scrollbar {
          display: none;
        }
        /* Touch screens have no hover: keep per-item controls visible */
        @media (hover: none) {
          .af-iteminfo { opacity: 0.55; }
        }
        .af-input::placeholder {
          color: var(--af-text-muted);
          opacity: 0.8;
        }
        .af-input:focus {
          border-color: var(--af-focus) !important;
        }
        .af-btn {
          background: var(--af-green);
          color: white;
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.3s ease;
          box-shadow: var(--af-btn-shadow);
        }
        .af-btn:hover:not(:disabled) {
          background: var(--af-btn-hover-bg);
          transform: translateY(-2px);
          box-shadow: var(--af-btn-shadow-hover);
        }
        .af-btn:active:not(:disabled) {
          transform: translateY(0px);
        }
        .af-btn:disabled {
          background: var(--af-disabled-bg);
          color: var(--af-disabled-text);
          cursor: not-allowed;
          box-shadow: none;
        }
        .af-btn-green {
          background: var(--af-green);
          color: white;
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.3s ease;
          box-shadow: var(--af-btn-shadow);
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .af-btn-green:hover:not(:disabled) {
          background: var(--af-btn-hover-bg);
          transform: translateY(-2px);
          box-shadow: var(--af-btn-shadow-hover);
        }
        .af-btn-green:active:not(:disabled) {
          transform: translateY(0px);
        }
        .af-btn-green:disabled {
          background: var(--af-disabled-bg);
          color: var(--af-disabled-text);
          cursor: not-allowed;
          box-shadow: none;
        }
        .af-btn-primary {
          width: 100%;
          background: var(--af-green);
          color: white;
          padding: 13px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.3s ease;
          box-shadow: var(--af-btn-shadow);
          margin-bottom: 10px;
        }
        .af-btn-primary:hover:not(:disabled) {
          background: var(--af-btn-hover-bg);
          transform: translateY(-1px);
        }
        .af-btn-primary:disabled {
          background: var(--af-disabled-bg);
          color: var(--af-disabled-text);
          cursor: not-allowed;
          box-shadow: none;
        }
        .af-btn-ghost {
          width: 100%;
          background: none;
          color: var(--af-text-muted);
          padding: 13px;
          border: 1px solid var(--af-border);
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.2s ease;
          margin-bottom: 10px;
        }
        .af-btn-ghost:hover {
          border-color: var(--af-focus);
          color: var(--af-focus);
        }
        .af-btn-sm {
          border: 1px solid var(--af-border);
          background: none;
          color: var(--af-text-muted);
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          transition: all 0.2s ease;
        }
        .af-btn-sm:hover:not(:disabled) {
          border-color: var(--af-focus);
          color: var(--af-focus);
        }
        .af-btn-sm:disabled {
          color: var(--af-disabled-text);
          cursor: not-allowed;
        }
        .af-btn-sm-green {
          border-color: var(--af-green);
          color: var(--af-green);
        }
        .af-btn-sm-green:hover:not(:disabled) {
          background: var(--af-green);
          border-color: var(--af-green);
          color: white;
        }
        .af-iconbtn {
          background: none;
          border: 1px solid var(--af-border);
          color: var(--af-text-muted);
          border-radius: 8px;
          width: 34px;
          height: 34px;
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .af-iconbtn:hover {
          border-color: var(--af-focus);
          color: var(--af-focus);
        }
        .af-chipbtn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--af-border);
          border-radius: 999px;
          padding: 5px 10px 5px 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--af-text-muted);
          cursor: pointer;
          background: none;
          font-family: inherit;
          transition: all 0.2s ease;
          max-width: 130px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .af-chipbtn:hover {
          border-color: var(--af-focus);
          color: var(--af-focus);
        }
        .af-backbtn {
          background: none;
          border: none;
          color: var(--af-focus);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 0;
          font-family: inherit;
        }
        .af-sectionlabel {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.8px;
          color: var(--af-text-faint);
          text-transform: uppercase;
          margin: 18px 0 8px;
        }
        .af-card {
          background: var(--af-inset-bg);
          border: 1px solid var(--af-border);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 10px;
          box-shadow: var(--af-shadow);
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--af-text);
        }
        .af-card:hover {
          border-color: var(--af-focus);
        }
        .af-badge {
          font-size: 10px;
          font-weight: 700;
          color: var(--af-focus);
          background: var(--af-highlight-bg);
          border: 1px solid var(--af-highlight-border);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .af-newlistbtn {
          width: 100%;
          margin-top: 10px;
          border: 2px dashed var(--af-input-border);
          background: none;
          color: var(--af-text-muted);
          border-radius: 12px;
          padding: 14px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
        }
        .af-newlistbtn:hover {
          border-color: var(--af-focus);
          color: var(--af-focus);
        }
        .af-freqchip {
          display: inline-flex;
          align-items: center;
          border: 1px dashed var(--af-input-border);
          border-radius: 999px;
          font-size: 12px;
          transition: all 0.2s ease;
          overflow: hidden;
        }
        .af-freqchip:hover {
          border-color: var(--af-focus);
        }
        .af-freqchip-add {
          border: 0;
          background: none;
          color: var(--af-text-muted);
          padding: 4px 4px 4px 12px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .af-freqchip:hover .af-freqchip-add {
          color: var(--af-focus);
        }
        .af-freqchip-remove {
          border: 0;
          background: none;
          color: var(--af-text-faint);
          padding: 4px 10px 4px 4px;
          font-size: 11px;
          cursor: pointer;
          font-family: inherit;
        }
        .af-freqchip-remove:hover {
          color: var(--af-error-text);
        }
        .af-listitem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 10px;
          border-radius: 8px;
          color: var(--af-text);
          animation: itemPopIn 0.18s ease;
        }
        .af-listitem:hover {
          background: var(--af-surface);
        }
        .af-itemlead {
          width: 4px;
          align-self: stretch;
          border-radius: 3px;
          flex-shrink: 0;
          background: var(--af-green);
          opacity: 0.5;
        }
        .af-itemlead-past {
          background: var(--af-amber);
        }
        .af-itemremove {
          background: none;
          border: none;
          color: var(--af-text-faint);
          font-size: 14px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 6px;
          transition: all 0.15s ease;
        }
        .af-itemremove:hover {
          color: var(--af-error-text);
        }
        .af-checklist-item:hover {
          background-color: var(--af-surface);
        }
        .af-iteminfo {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--af-text-faint);
          font-size: 13px;
          cursor: pointer;
          padding: 2px 4px;
          opacity: 0.4;
          transition: all 0.15s ease;
        }
        .af-checklist-item:hover .af-iteminfo,
        .af-iteminfo:hover {
          opacity: 1;
          color: var(--af-focus);
        }
        .af-settings-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--af-backdrop);
          z-index: 999;
        }
        .af-toast {
          position: fixed;
          /* Sits above the footer CTA so it never hides the primary button */
          bottom: calc(92px + var(--safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          background: var(--af-toast-bg);
          color: var(--af-toast-text);
          padding: 10px 18px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          /* Toast text embeds user-given list/category names, which can run
             long. nowrap with no width limit let those messages render past
             both edges of a narrow phone with no way to read the rest; wrap
             instead, capped so the pill never spans past the screen. */
          max-width: calc(100vw - 32px);
          text-align: center;
          z-index: 3000;
          box-shadow: var(--af-shadow-lg);
          animation: toastFade 2.5s ease-out forwards;
        }
        @keyframes toastFade {
          0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
          10%, 80% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; }
        }
        @keyframes celebrationFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes itemPopIn {
          from { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes sheetSlideUp {
          from { transform: translateY(40px); opacity: 0; }
        }
        @keyframes popupZoomIn {
          from { opacity: 0; transform: scale(0.92) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes iconPulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .loading-icon-0 { animation: iconPulse 2s ease-in-out 0.0s infinite; }
        .loading-icon-1 { animation: iconPulse 2s ease-in-out 0.4s infinite; }
        .loading-icon-2 { animation: iconPulse 2s ease-in-out 0.8s infinite; }
      `}</style>

      {/* Background shopping cart pattern */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.05,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i % 5) * 20 + 5}%`,
              top: `${Math.floor(i / 5) * 25 + 5}%`,
              fontSize: 'min(60px, 8vw)',
              color: 'var(--af-text-muted)',
              transform: `rotate(${(i % 4) * 15 - 22.5}deg)`,
              opacity: 0.6,
            }}
          >
            <i className="fa-solid fa-cart-shopping"></i>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        maxWidth: '640px',
        width: '100%',
        margin: '0 auto',
        position: 'relative',
        zIndex: 2,
        // Keep content clear of the notch when the phone is in landscape
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
      }}>
        {screen !== 'shop' && (
          <TopBar
            user={auth.user}
            onShowLists={() => setSheet('lists')}
            onShowChat={() => setScreen('chat')}
            onShowAccount={() => setSheet('account')}
            onShowStore={screen === 'list' ? () => setSheet('store') : undefined}
            onShop={screen === 'list' ? () => setScreen('shop') : undefined}
            shopCount={store.currentList ? store.currentList.items.length : 0}
            shopDisabled={!store.currentList || store.currentList.items.length === 0}
          />
        )}

        {screen === 'list' && (
          <CurrentListScreen
            list={store.currentList}
            user={auth.user}
            addItem={store.addItem}
            removeItem={store.removeItem}
            editItem={store.editItem}
            frequentItems={store.frequentItems}
            hideFrequentItem={store.hideFrequentItem}
            historyGroup={store.currentList
              ? store.purchaseHistory.find((g) => g.name === store.currentList.name) || null
              : null}
            onDeleteHistory={handleDeleteHistoryGroup}
            onDeleteHistoryItem={store.deleteHistoryItem}
            updateList={store.updateList}
            onShowLists={() => setSheet('lists')}
            onShowShare={() => setSheet('share')}
            toast={toast}
          />
        )}

        {screen === 'chat' && (
          <ChatScreen
            currentList={store.currentList}
            completedLists={store.completedLists}
            onBack={() => setScreen('list')}
          />
        )}

        {screen === 'shop' && (
          <ShopScreen
            list={store.currentList}
            updateList={store.updateList}
            completeList={store.completeList}
            outputFormat={outputFormat}
            setOutputFormat={setOutputFormat}
            onExit={() => setScreen('list')}
            onFinished={(finishedEarly) => {
              setScreen('list');
              toast(finishedEarly ? 'Trip saved — unbought items kept on your list' : 'Trip saved to your lists');
            }}
            onShowStore={() => setSheet('store')}
            toast={toast}
            aisleOverrides={store.aisleOverrides}
            setAisleOverride={store.setAisleOverride}
            clearAisleOverride={store.clearAisleOverride}
            syncAisleOverrides={store.syncAisleOverrides}
            itemHistory={store.itemHistory}
            recordItemHistory={store.recordItemHistory}
          />
        )}
      </div>

      {/* Sheets */}
      <AccountSheet
        open={sheet === 'account'}
        onClose={() => setSheet(null)}
        auth={auth}
        toast={toast}
      />
      <ShareSheet
        open={sheet === 'share'}
        onClose={() => setSheet(null)}
        list={store.currentList}
        user={auth.user}
        updateList={store.updateList}
        adoptRemoteList={store.adoptRemoteList}
        onNeedAccount={() => setSheet('account')}
        toast={toast}
      />
      <StoreSheet
        open={sheet === 'store'}
        onClose={() => setSheet(null)}
        list={store.currentList}
        updateList={store.updateList}
        toast={toast}
      />
      <ListsSheet
        open={sheet === 'lists'}
        onClose={() => setSheet(null)}
        listGroups={store.listGroups}
        currentListId={store.currentList ? store.currentList.id : null}
        onSelectList={openList}
        onReopenList={handleReopenList}
        onCreateList={handleCreateList}
        onDeleteList={handleDeleteListGroup}
      />

      {toastMsg && <div className="af-toast">{toastMsg}</div>}
    </div>
  );
};

export default AisleFinder;

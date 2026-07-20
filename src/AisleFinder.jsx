import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth';
import { useLists } from './listsStore';
import { loadState, saveState } from './storage';
import { applySystemBars } from './systemBars';
import TopBar from './components/TopBar';
import AccountSheet from './components/AccountSheet';
import ShareSheet from './components/ShareSheet';
import StoreSheet from './components/StoreSheet';
import CurrentListScreen from './screens/CurrentListScreen';
import MyListsScreen from './screens/MyListsScreen';
import HistoryScreen from './screens/HistoryScreen';
import ShopScreen from './screens/ShopScreen';

const AisleFinder = () => {
  const auth = useAuth();
  const store = useLists(auth.user);

  // screen: 'list' (home) | 'lists' | 'history' | 'shop'
  const [screen, setScreen] = useState('list');
  // sheet: null | 'account' | 'share' | 'store'
  const [sheet, setSheet] = useState(null);
  const [outputFormat, setOutputFormat] = useState(() => loadState('outputFormat', 'numbered'));
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => { saveState('outputFormat', outputFormat); }, [outputFormat]);

  // Native status/gesture bar icon colors depend on which screen is up (green
  // chrome vs. plain background) and the color scheme; Android also resets
  // them on rotation and theme changes, so re-apply on those events.
  useEffect(() => {
    applySystemBars(screen);
    const reapply = () => applySystemBars(screen);
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
  useEffect(() => {
    const onOffline = () => toast('Offline — changes saved on this device');
    const onOnline = () => toast('Back online — syncing');
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [toast]);

  const openList = (id) => {
    store.setCurrentListId(id);
    setScreen('list');
  };

  const handleMerge = (sourceId) => {
    const added = store.mergeIntoCurrent(sourceId);
    toast(added > 0 ? `Added ${added} item${added === 1 ? '' : 's'} to ${store.currentList?.name || 'your list'}` : 'Everything is already on your list');
    setScreen('list');
  };

  const handleReshop = (sourceId) => {
    const copy = store.reshopList(sourceId);
    if (copy) setScreen('shop');
  };

  const handleDeleteList = (list) => {
    const label = list.status === 'completed' ? 'this trip from history' : `"${list.name}"`;
    if (window.confirm(`Delete ${label}? This can't be undone.`)) {
      store.deleteList(list.id);
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
        /* Theme palette ("Evergreen Chrome"). CORE COLORS ONLY — six neutrals,
           one green pair, one chrome green, one amber, one error tone per
           scheme. Everything below the "derived" line is an alias or an alpha
           tint of a core color; add new colors to the core set only as a last
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
          --af-bg: #f6faf6;
          --af-inset-bg: #ffffff;
          --af-surface: #e9f0e9;
          --af-border: #dfe8df;
          --af-text: #22332a;
          --af-text-muted: #6e7c71;
          /* core accents */
          --af-green: #27ae60;
          --af-green-dark: #175c3d;
          --af-chrome: #1d5c40;
          --af-amber: #ffc439;
          --af-error-text: #b3541e;
          /* derived — aliases and tints of the core colors */
          --af-chrome-text: #f2f8f2;
          --af-chrome-muted: rgba(242, 248, 242, 0.65);
          --af-chrome-border: rgba(255, 255, 255, 0.16);
          --af-popup-bg: var(--af-inset-bg);
          --af-input-border: var(--af-border);
          --af-text-faint: var(--af-text-muted);
          --af-focus: var(--af-green);
          --af-highlight-bg: rgba(39, 174, 96, 0.07);
          --af-highlight-border: rgba(39, 174, 96, 0.35);
          --af-error-bg: rgba(179, 84, 30, 0.08);
          --af-error-border: rgba(179, 84, 30, 0.35);
          --af-disabled-bg: var(--af-border);
          --af-disabled-text: var(--af-text-muted);
          --af-toast-bg: var(--af-text);
          --af-toast-text: var(--af-bg);
          --af-celebrate-bg: rgba(39, 174, 96, 0.12);
          --af-celebrate-text: var(--af-green-dark);
          --af-green-soft: rgba(39, 174, 96, 0.15);
          --af-btn-hover-bg: var(--af-green-dark);
          --af-btn-shadow: 0 2px 8px rgba(39, 174, 96, 0.3);
          --af-btn-shadow-hover: 0 4px 12px rgba(39, 174, 96, 0.4);
          --af-backdrop: rgba(0, 0, 0, 0.2);
          --af-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          --af-shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.15);
        }
        @media (prefers-color-scheme: dark) {
          :root {
            /* core neutrals — deep forest, not neutral black */
            --af-bg: #131816;
            --af-inset-bg: #1b2320;
            --af-surface: #232c27;
            --af-border: #33403a;
            --af-text: #e6ebe6;
            --af-text-muted: #9cab9f;
            /* core accents — green desaturated so it doesn't glow on dark */
            --af-green: #4cb782;
            --af-green-dark: #9ecfb2;
            --af-chrome: #16382a;
            --af-error-text: #ffab70;
            /* derived */
            --af-popup-bg: var(--af-surface);
            --af-highlight-bg: rgba(76, 183, 130, 0.12);
            --af-highlight-border: rgba(76, 183, 130, 0.35);
            --af-error-bg: rgba(255, 171, 112, 0.10);
            --af-error-border: rgba(255, 171, 112, 0.35);
            --af-green-soft: rgba(76, 183, 130, 0.15);
            --af-btn-hover-bg: #3da06f;
            --af-btn-shadow: 0 2px 8px rgba(76, 183, 130, 0.25);
            --af-btn-shadow-hover: 0 4px 12px rgba(76, 183, 130, 0.35);
            --af-backdrop: rgba(0, 0, 0, 0.55);
            --af-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
            --af-shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.6);
          }
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
        /* Touch screens have no hover: keep per-item controls visible */
        @media (hover: none) {
          .af-itemremove { opacity: 1; }
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
        .af-btn-sm:hover {
          border-color: var(--af-focus);
          color: var(--af-focus);
        }
        .af-btn-sm-green {
          border-color: var(--af-green);
          color: var(--af-green);
        }
        .af-btn-sm-green:hover {
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
        /* Controls inside the green chrome (top bar) sit on --af-chrome,
           so they use the white-alpha chrome tones instead of body tones */
        .af-topbar .af-iconbtn,
        .af-topbar .af-chipbtn {
          border-color: var(--af-chrome-border);
          color: var(--af-chrome-muted);
        }
        .af-topbar .af-iconbtn:hover,
        .af-topbar .af-chipbtn:hover {
          border-color: var(--af-chrome-text);
          color: var(--af-chrome-text);
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
          border: 1px dashed var(--af-input-border);
          background: none;
          color: var(--af-text-muted);
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
        }
        .af-freqchip:hover {
          border-color: var(--af-focus);
          color: var(--af-focus);
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
        .af-itemcircle {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          border: 2px solid var(--af-input-border);
          border-radius: 50%;
          cursor: pointer;
          background: none;
          transition: all 0.15s ease;
          padding: 0;
        }
        .af-itemcircle:hover {
          border-color: var(--af-green);
          background: var(--af-green-soft);
        }
        .af-itemremove {
          background: none;
          border: none;
          color: var(--af-text-faint);
          font-size: 14px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 6px;
          opacity: 0;
          transition: all 0.15s ease;
        }
        .af-listitem:hover .af-itemremove {
          opacity: 1;
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
        .af-copy-toast {
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--af-toast-bg);
          color: var(--af-toast-text);
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          pointer-events: none;
          animation: toastFade 2s ease-out forwards;
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
          white-space: nowrap;
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
              fontSize: '60px',
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
            onShowHistory={() => setScreen('history')}
            onShowLists={() => setScreen('lists')}
            onShowAccount={() => setSheet('account')}
          />
        )}

        {screen === 'list' && (
          <CurrentListScreen
            list={store.currentList}
            user={auth.user}
            addItem={store.addItem}
            removeItem={store.removeItem}
            frequentItems={store.frequentItems}
            onShowLists={() => setScreen('lists')}
            onShowShare={() => setSheet('share')}
            onShowStore={() => setSheet('store')}
            onShop={() => setScreen('shop')}
            toast={toast}
          />
        )}

        {screen === 'lists' && (
          <MyListsScreen
            activeLists={store.activeLists}
            completedLists={store.completedLists}
            currentListId={store.currentList ? store.currentList.id : null}
            onOpenList={openList}
            onCreateList={(name) => { store.createList(name); setScreen('list'); }}
            onDeleteList={handleDeleteList}
            onMerge={handleMerge}
            onReshop={handleReshop}
            onBack={() => setScreen('list')}
          />
        )}

        {screen === 'history' && (
          <HistoryScreen
            completedLists={store.completedLists}
            user={auth.user}
            onMerge={handleMerge}
            onReshop={handleReshop}
            onDeleteList={handleDeleteList}
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
            onFinished={() => { setScreen('history'); toast('Trip saved to History'); }}
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

      {toastMsg && <div className="af-toast">{toastMsg}</div>}
    </div>
  );
};

export default AisleFinder;

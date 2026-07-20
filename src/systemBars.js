import { Capacitor, registerPlugin } from '@capacitor/core';

// SystemBars ships inside Capacitor 8 itself (no separate npm plugin):
// style 'DARK' means light icons for dark backgrounds, 'LIGHT' the reverse.
const SystemBars = Capacitor.isNativePlatform() ? registerPlugin('SystemBars') : null;

const prefersDark = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// The status bar sits over the dark-green chrome on every screen except Shop,
// whose header uses --af-bg; the Android gesture bar always sits over --af-bg.
// Android resets both bars to the theme default on rotation/theme changes, so
// callers should re-apply on those events too.
export function applySystemBars(screen) {
  if (!SystemBars) return;
  const bgStyle = prefersDark() ? 'DARK' : 'LIGHT';
  const statusStyle = screen === 'shop' ? bgStyle : 'DARK';
  SystemBars.setStyle({ style: statusStyle, bar: 'StatusBar' }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') {
    // iOS ignores the bar argument (setStyle always targets the status bar),
    // so only Android gets a NavigationBar call
    SystemBars.setStyle({ style: bgStyle, bar: 'NavigationBar' }).catch(() => {});
  }
}

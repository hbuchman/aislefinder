// Reliable connectivity detection. Wraps @capacitor/network, which has a web
// fallback (navigator.onLine under the hood) so this works the same on web
// and native — but on iOS WKWebView, navigator.onLine and the browser
// online/offline events are known to lag or misreport real reachability; the
// native-bridged plugin doesn't have that problem. A synchronous cached flag
// mirrors the plugin's async status so call sites that used to check
// `navigator.onLine` can swap in `isOnline()` without going async themselves.
import { Network } from '@capacitor/network';

let online = true;
const listeners = new Set();

Network.getStatus().then((status) => { online = status.connected; }).catch(() => {});

Network.addListener('networkStatusChange', (status) => {
  const was = online;
  online = status.connected;
  if (was !== online) listeners.forEach((fn) => fn(online));
});

export const isOnline = () => online;

// Subscribe to connectivity transitions (fires with the new `connected`
// value on every change, not just becoming-online). Returns an unsubscribe
// function.
export const onNetworkChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

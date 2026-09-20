// Receives text shared into the app from other apps (e.g. selecting text in
// Apple Notes or Google Keep and using the OS "Share" action). Backed by the
// custom native ShareReceiver plugin (android/.../ShareReceiverPlugin.java,
// ios/App/App/ShareReceiver/ShareReceiverPlugin.swift) — there's no web
// implementation, so every call below no-ops outside a native shell.
import { Capacitor, registerPlugin } from '@capacitor/core';

const ShareReceiver = Capacitor.isNativePlatform() ? registerPlugin('ShareReceiver') : null;

// Pending text left over from a share that launched or was delivered to the
// app (cold start or already-running). Clears itself on the native side once
// read, so this only ever returns a given share once.
export async function getPendingSharedText() {
  if (!ShareReceiver) return '';
  try {
    const { text } = await ShareReceiver.getSharedText();
    return text || '';
  } catch {
    return '';
  }
}

// Android only: fires while the app is already in the foreground and a new
// share arrives (onNewIntent). iOS has no equivalent push channel from a
// share extension to a running host app, so callers must also poll
// getPendingSharedText() on resume. Returns an unsubscribe function.
export function onShareReceived(fn) {
  if (!ShareReceiver) return () => {};
  const handle = ShareReceiver.addListener('shareReceived', (data) => fn(data.text || ''));
  return () => handle.remove();
}

package com.aislefinder.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives text shared into the app from other apps (e.g. Apple Notes-style
 * "Share" actions on Android, such as Google Keep). MainActivity forwards the
 * launch intent (cold start) and any onNewIntent calls (already running) here;
 * JS polls getSharedText() on launch/resume and listens for "shareReceived"
 * when a share arrives while the app is already in the foreground.
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private String pendingText;

    @Override
    public void load() {
        consumeIntent(getActivity().getIntent());
    }

    @PluginMethod
    public void getSharedText(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pendingText != null ? pendingText : "");
        pendingText = null;
        call.resolve(result);
    }

    void handleNewIntent(Intent intent) {
        if (consumeIntent(intent)) {
            JSObject data = new JSObject();
            data.put("text", pendingText);
            notifyListeners("shareReceived", data);
        }
    }

    private boolean consumeIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return false;
        }
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) {
            return false;
        }
        pendingText = text;
        // Clear the action so re-reading the activity's intent (e.g. another
        // load()) doesn't replay the same share.
        intent.setAction(null);
        return true;
    }
}

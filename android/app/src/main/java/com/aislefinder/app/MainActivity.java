package com.aislefinder.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ShareReceiverPlugin plugin = (ShareReceiverPlugin) getBridge().getPlugin("ShareReceiver").getInstance();
        if (plugin != null) {
            plugin.handleNewIntent(intent);
        }
    }
}

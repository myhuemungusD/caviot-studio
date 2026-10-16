package com.caviot.studio;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CaviotNativePlugin.class);
        // Edge to edge like the Capacitor 8 SystemBars docs recommend; the page pads itself with
        // env(safe-area-inset-*) / --safe-area-inset-* (insetsHandling "css").
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            // The studio is one full-screen canvas; overscroll glow fights pinch and orbit gestures.
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        }
        OpenedFiles.receive(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        OpenedFiles.receive(this, intent);
    }
}

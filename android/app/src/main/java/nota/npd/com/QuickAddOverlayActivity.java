package nota.npd.com;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Translucent overlay activity launched by the Quick-Add home-screen widget.
 *
 * Hosts a Capacitor WebView loading the React app at "/quick-add", which
 * renders the SAME <TaskInputSheet/> the in-app "Add Task" flow uses.
 *
 * The theme + explicit transparent Window / WebView background make sure the
 * launcher home screen shows through behind the floating sheet — no white
 * flash while the JS bundle boots.
 */
public class QuickAddOverlayActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the tiny native close-bridge BEFORE super.onCreate so the
        // web layer can call QuickAddOverlay.close() the instant it mounts.
        registerPlugin(QuickAddOverlayPlugin.class);
        super.onCreate(savedInstanceState);

        // Force the whole window chain to TRANSPARENT. Any single opaque
        // layer here produces the white flash users report during hydration.
        try {
            getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            getWindow().getDecorView().setBackgroundColor(Color.TRANSPARENT);
        } catch (Throwable ignored) {}

        // BridgeActivity's default load points the WebView at "/" which briefly
        // renders the full app (AppContent) before React Router can redirect —
        // producing the "opens full app instead of overlay" flash users see.
        // Stop the in-flight default load and immediately swap in "/quick-add"
        // so App.tsx's `isQuickAddBoot` branch renders QuickAddShell from the
        // very first paint. `post()` guarantees this runs on the WebView's
        // handler thread after the bridge finishes its own setup.
        try {
            final android.webkit.WebView wv = getBridge().getWebView();

            // Transparent WebView + parent container so no white paint bleeds
            // through before the React sheet mounts.
            wv.setBackgroundColor(Color.TRANSPARENT);
            try {
                android.view.ViewParent p = wv.getParent();
                if (p instanceof android.view.View) {
                    ((android.view.View) p).setBackgroundColor(Color.TRANSPARENT);
                }
            } catch (Throwable ignored) {}

            String base = getBridge().getLocalUrl();
            if (base == null || base.isEmpty()) base = "https://localhost";
            final String target = base + "/quick-add";
            wv.stopLoading();
            wv.post(new Runnable() {
                @Override public void run() { wv.loadUrl(target); }
            });
        } catch (Throwable ignored) {
            // If anything goes wrong we fall back to the default page — the
            // React RootRedirect will still show something, never a crash.
        }
    }
}

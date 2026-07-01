package nota.npd.com;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Translucent overlay activity launched by the Quick-Add home-screen widget.
 *
 * Instead of building a hand-rolled native UI, this hosts a full Capacitor
 * WebView loading the real React app at the dedicated "/quick-add" route,
 * which renders the SAME <TaskInputSheet/> component the in-app "Add Task"
 * flow uses — with the full provider tree (Subscription, i18n, GlobalTags,
 * IndexedDB) and the same task-persistence path.
 *
 * The theme (AppTheme.QuickAddOverlay) makes the window translucent so the
 * launcher home screen shows through behind the sheet. excludeFromRecents +
 * empty taskAffinity keep this out of the recents stack and prevent it from
 * resurrecting MainActivity.
 */
public class QuickAddOverlayActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the tiny native close-bridge BEFORE super.onCreate so the
        // web layer can call QuickAddOverlay.close() the instant it mounts.
        registerPlugin(QuickAddOverlayPlugin.class);
        super.onCreate(savedInstanceState);

        // Navigate directly to the dedicated lightweight route. The React
        // Router is already initialized at "/" by Capacitor; replace it with
        // "/quick-add" so the overlay doesn't flash the main app first.
        try {
            String base = getBridge().getLocalUrl(); // e.g. https://localhost
            if (base == null || base.isEmpty()) base = "https://localhost";
            getBridge().getWebView().loadUrl(base + "/quick-add");
        } catch (Throwable ignored) {
            // If anything goes wrong we fall back to the default page — the
            // React RootRedirect will still show something, never a crash.
        }
    }
}

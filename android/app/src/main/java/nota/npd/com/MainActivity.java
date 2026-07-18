package nota.npd.com;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

/**
 * Main Activity for Flowist App
 * - Google + Apple Sign-In via @capgo/capacitor-social-login (auto-registered)
 * - Edge-to-edge layout (Android 15+ / API 35)
 * - Backend: Supabase (no Firebase)
 * - Receives deep-link path from home screen widgets via "widget_path" intent extra
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // FocusTimerPlugin removed on Android to avoid foreground-service permissions.
        registerPlugin(FlowistShareIntentPlugin.class);
        storeWidgetPath(getIntent());
        // Store the widget target BEFORE BridgeActivity boots the WebView so
        // cold-start taps are available to JS on the first read.
        super.onCreate(savedInstanceState);
        storeWidgetPath(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        storeWidgetPath(intent);
        super.onNewIntent(intent);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required by @capgo/capacitor-social-login before requesting Google scopes.
    }

    /** Persist widget deep-link path so the web app can pick it up via Capacitor Preferences. */
    private void storeWidgetPath(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra("widget_path");
        // Quick-Add widget shortcut: force the canonical route even if
        // `widget_path` was dropped by the launcher. This ensures the Task
        // Input Sheet opens on the very first paint with no main-screen flash.
        boolean quickAdd = intent.getBooleanExtra("openQuickAdd", false);
        if (quickAdd && (path == null || path.isEmpty())) {
            path = "/todo/today?add=1";
        }
        Uri data = intent.getData();
        if ((path == null || path.isEmpty()) && data != null
                && ("flowist".equals(data.getScheme()) || "codaib".equals(data.getScheme()))
                && "widget".equals(data.getHost())) {
            path = data.getPath();
            String query = data.getEncodedQuery();
            if (path != null && query != null && !query.isEmpty()) path = path + "?" + query;
        }
        if (path == null || path.isEmpty()) return;
        SharedPreferences sp = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        sp.edit()
                .putString("widget_pending_path", path)
                .putLong("widget_pending_path_ts", System.currentTimeMillis())
                .commit();
    }
}
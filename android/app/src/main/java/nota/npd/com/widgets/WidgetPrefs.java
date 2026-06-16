package nota.npd.com.widgets;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reads data written by Capacitor Preferences plugin.
 * Capacitor stores values in SharedPreferences "CapacitorStorage".
 */
public class WidgetPrefs {
    public static final String GROUP = "CapacitorStorage";

    public static String getString(Context ctx, String key, String def) {
        SharedPreferences sp = ctx.getSharedPreferences(GROUP, Context.MODE_PRIVATE);
        return sp.getString(key, def);
    }

    public static JSONObject getJson(Context ctx, String key) {
        try {
            String s = getString(ctx, key, null);
            if (s == null) return null;
            return new JSONObject(s);
        } catch (Exception e) { return null; }
    }

    public static JSONArray getJsonArray(Context ctx, String key) {
        try {
            String s = getString(ctx, key, null);
            if (s == null) return null;
            return new JSONArray(s);
        } catch (Exception e) { return null; }
    }
}
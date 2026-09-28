package nota.npd.com;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONObject;
import java.util.Map;

/** Device-local alarm registry; survives process death and device reboot. */
final class FlowistAlarm {
    static final String STORE = "flowist_exact_alarms";
    static final String CHANNEL = "flowist-ringing-alarms-v1";
    static final String ACTION_FIRE = "nota.npd.com.ALARM_FIRE";
    static final String ACTION_DISMISS = "nota.npd.com.ALARM_DISMISS";
    static final String ACTION_SNOOZE = "nota.npd.com.ALARM_SNOOZE";
    private FlowistAlarm() {}

    static PendingIntent pending(Context ctx, String key) {
        Intent intent = new Intent(ctx, FlowistAlarmReceiver.class).setAction(ACTION_FIRE).setData(android.net.Uri.parse("flowist-alarm://" + android.net.Uri.encode(key)));
        return PendingIntent.getBroadcast(ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context ctx, JSONObject data) throws Exception {
        String key = data.getString("key");
        long when = data.getLong("when");
        if (when <= System.currentTimeMillis()) return;
        AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) throw new IllegalStateException("Alarm service unavailable");
        // setAlarmClock is a user-visible alarm and is allowed through Doze.
        Intent show = new Intent(ctx, FlowistAlarmActivity.class).putExtra("key", key);
        PendingIntent showIntent = PendingIntent.getActivity(ctx, key.hashCode(), show, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.setAlarmClock(new AlarmManager.AlarmClockInfo(when, showIntent), pending(ctx, key));
        ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putString(key, data.toString()).apply();
    }

    static JSONObject get(Context ctx, String key) {
        try {
            String raw = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE).getString(key, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception ignored) { return null; }
    }

    static void cancel(Context ctx, String key) {
        AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(pending(ctx, key));
        ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().remove(key).apply();
    }

    static void restore(Context ctx) {
        SharedPreferences store = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        for (Map.Entry<String, ?> entry : store.getAll().entrySet()) {
            try {
                JSONObject data = new JSONObject((String) entry.getValue());
                if (data.getLong("when") > System.currentTimeMillis()) schedule(ctx, data);
                else store.edit().remove(entry.getKey()).apply();
            } catch (Exception ignored) { store.edit().remove(entry.getKey()).apply(); }
        }
    }
}

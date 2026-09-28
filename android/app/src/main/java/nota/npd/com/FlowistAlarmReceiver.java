package nota.npd.com;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;
import java.util.Calendar;

public class FlowistAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            FlowistAlarm.restore(context);
            return;
        }
        String key = intent.getStringExtra("key");
        if (key == null && intent.getData() != null) key = intent.getData().getLastPathSegment();
        if (key == null) return;
        if (FlowistAlarm.ACTION_DISMISS.equals(action) || FlowistAlarm.ACTION_SNOOZE.equals(action)) {
            JSONObject data = FlowistAlarm.get(context, key);
            context.stopService(new Intent(context, FlowistAlarmService.class));
            if (FlowistAlarm.ACTION_SNOOZE.equals(action) && data != null) {
                try { data.put("when", System.currentTimeMillis() + 5 * 60_000L); data.put("repeatDays", 0); FlowistAlarm.schedule(context, data); } catch (Exception ignored) {}
            } else if (data != null && data.optInt("repeatDays", 0) == 0) {
                FlowistAlarm.cancel(context, key);
            }
            return;
        }
        if (!FlowistAlarm.ACTION_FIRE.equals(action)) return;
        JSONObject data = FlowistAlarm.get(context, key);
        if (data == null) return;
        try {
            int repeatDays = data.optInt("repeatDays", 0);
            if (repeatDays > 0) {
                Calendar next = Calendar.getInstance();
                next.setTimeInMillis(data.getLong("when"));
                do { next.add(Calendar.DAY_OF_YEAR, repeatDays); } while (next.getTimeInMillis() <= System.currentTimeMillis());
                data.put("when", next.getTimeInMillis());
                FlowistAlarm.schedule(context, data);
            }
            Intent service = new Intent(context, FlowistAlarmService.class).putExtra("key", key)
                .putExtra("title", data.optString("title", "Reminder"))
                .putExtra("priority", data.optString("priority", "None"));
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
            else context.startService(service);
        } catch (Exception ignored) { }
    }
}

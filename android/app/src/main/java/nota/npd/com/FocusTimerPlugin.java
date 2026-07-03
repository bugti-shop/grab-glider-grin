package nota.npd.com;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FocusTimerNative")
public class FocusTimerPlugin extends Plugin {
    private static FocusTimerPlugin instance;

    @Override public void load() { instance = this; }

    /** Called by FocusForegroundService when the user taps a notification action. */
    public static void emit(String action, boolean running, boolean muted, float volume) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("running", running);
        data.put("muted", muted);
        data.put("volume", (double) volume);
        instance.notifyListeners("focusQuickControl", data);
    }

    @PluginMethod public void start(PluginCall call) {
        Intent i = new Intent(getContext(), FocusForegroundService.class);
        i.setAction(FocusForegroundService.ACTION_START);
        i.putExtra("taskTitle", call.getString("taskTitle", ""));
        i.putExtra("remainingSec", call.getInt("remainingSec", 0));
        Double end = call.getDouble("endAtMs");
        if (end != null) i.putExtra("endAtMs", end.longValue());
        i.putExtra("running", call.getBoolean("running", true));
        i.putExtra("soundUrl", call.getString("soundUrl", ""));
        Double vol = call.getDouble("soundVolume");
        if (vol != null) i.putExtra("soundVolume", vol.doubleValue());
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod public void stop(PluginCall call) {
        Intent i = new Intent(getContext(), FocusForegroundService.class);
        i.setAction(FocusForegroundService.ACTION_STOP);
        getContext().startService(i);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod public void setPaused(PluginCall call) {
        forward(Boolean.TRUE.equals(call.getBoolean("paused", false))
            ? FocusForegroundService.ACTION_PAUSE : FocusForegroundService.ACTION_RESUME);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod public void setMuted(PluginCall call) {
        forward(Boolean.TRUE.equals(call.getBoolean("muted", false))
            ? FocusForegroundService.ACTION_MUTE : FocusForegroundService.ACTION_UNMUTE);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod public void setVolume(PluginCall call) {
        // Approximated as step up/down calls — kept for JS symmetry with iOS.
        Double v = call.getDouble("volume");
        if (v != null) {
            // No direct absolute-volume action; consumers should push through start()
            // to update precisely. We still nudge in the requested direction.
            forward(v >= 0.5 ? FocusForegroundService.ACTION_VOL_UP : FocusForegroundService.ACTION_VOL_DN);
        }
        call.resolve(new JSObject().put("ok", true));
    }

    private void forward(String action) {
        Intent i = new Intent(getContext(), FocusForegroundService.class);
        i.setAction(action);
        getContext().startService(i);
    }
}

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
    @PluginMethod public void start(PluginCall call) {
        Intent i = new Intent(getContext(), FocusForegroundService.class);
        i.setAction(FocusForegroundService.ACTION_START);
        i.putExtra("taskTitle", call.getString("taskTitle", ""));
        i.putExtra("remainingSec", call.getInt("remainingSec", 0));
        Double end = call.getDouble("endAtMs");
        if (end != null) i.putExtra("endAtMs", end.longValue());
        i.putExtra("running", call.getBoolean("running", true));
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
        call.resolve(new JSObject().put("ok", true));
    }
    @PluginMethod public void stop(PluginCall call) {
        Intent i = new Intent(getContext(), FocusForegroundService.class);
        i.setAction(FocusForegroundService.ACTION_STOP);
        getContext().startService(i);
        call.resolve(new JSObject().put("ok", true));
    }
}
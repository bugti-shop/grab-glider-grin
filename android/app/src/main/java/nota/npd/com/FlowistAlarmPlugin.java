package nota.npd.com;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "FlowistAlarm")
public class FlowistAlarmPlugin extends Plugin {
    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            JSONObject data = new JSONObject();
            data.put("key", call.getString("key"));
            data.put("title", call.getString("title", "Reminder"));
            data.put("priority", call.getString("priority", "None"));
            data.put("when", call.getLong("when", 0L));
            data.put("repeatDays", call.getInteger("repeatDays", 0));
            FlowistAlarm.schedule(getContext(), data);
            call.resolve();
        } catch (Exception e) { call.reject("Could not schedule alarm", e); }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("Missing alarm key"); return; }
        FlowistAlarm.cancel(getContext(), key);
        call.resolve();
    }
}

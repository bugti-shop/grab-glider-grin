package nota.npd.com;

import android.app.Activity;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FlowistShareIntent")
public class FlowistShareIntentPlugin extends Plugin {
    @PluginMethod
    public void markConsumed(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(new JSObject().put("ok", true));
            return;
        }

        Intent current = activity.getIntent();
        String action = current != null ? current.getAction() : null;
        boolean isShareIntent = Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
        if (isShareIntent) {
            Intent clean = new Intent(activity, activity.getClass());
            clean.setAction(Intent.ACTION_MAIN);
            clean.addCategory(Intent.CATEGORY_LAUNCHER);
            clean.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            activity.setIntent(clean);
        }

        call.resolve(new JSObject().put("ok", true));
    }
}
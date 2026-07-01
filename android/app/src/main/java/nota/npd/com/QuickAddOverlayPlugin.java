package nota.npd.com;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Minimal Capacitor bridge for the Quick-Add overlay WebView.
 * The web layer calls QuickAddOverlay.close() from the TaskInputSheet's
 * onClose handler; we simply finish() the hosting Activity so the launcher
 * comes back into focus.
 */
@CapacitorPlugin(name = "QuickAddOverlay")
public class QuickAddOverlayPlugin extends Plugin {
    @PluginMethod
    public void close(PluginCall call) {
        try {
            if (getActivity() != null) getActivity().finish();
        } catch (Throwable ignored) {}
        call.resolve(new JSObject().put("ok", true));
    }
}

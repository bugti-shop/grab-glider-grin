package nota.npd.com.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import nota.npd.com.MainActivity;
import nota.npd.com.R;

/**
 * "Quick Add" home-screen widget.
 *
 * Goal: tapping the widget must show the Task Input Sheet INSTANTLY, the
 * way Todoist's quick-add widget does — no visible flash of the main
 * screen, no in-app navigation transition.
 *
 * How we achieve that:
 *  1. The PendingIntent targets MainActivity directly with the route
 *     "/todo/today?add=1" stored in both `widget_path` and the Uri data.
 *     MainActivity persists this synchronously in SharedPreferences BEFORE
 *     the WebView boots (see MainActivity.storeWidgetPath), so the React
 *     bootstrap can replaceState() to the correct URL before the first
 *     render — Today.tsx then initializes `isInputOpen` to true on the
 *     very first paint.
 *  2. We use FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_SINGLE_TOP. Combined
 *     with MainActivity's `singleTask` launch mode (AndroidManifest.xml),
 *     this guarantees the existing Activity is reused via onNewIntent()
 *     instead of being recreated — no cold-start splash flicker when the
 *     app is already in memory.
 *  3. We also pass an `openQuickAdd` boolean extra so MainActivity can
 *     short-circuit any other deep-link handling and treat this tap as a
 *     dedicated quick-add request.
 */
public class AddTaskWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_add_task);
            // Land directly on Today with the auto-open flag — skip any
            // intermediate /w/add-task redirect route which previously
            // caused a brief main-screen flash.
            String path = "/todo/today?add=1";
            Intent open = new Intent(ctx, MainActivity.class);
            open.setAction("nota.npd.com.widgets.QUICK_ADD_" + id);
            open.setData(Uri.parse("flowist://widget" + path));
            open.putExtra("widget_path", path);
            open.putExtra("openQuickAdd", true);
            // singleTask launch mode + NEW_TASK | SINGLE_TOP => reuse the
            // existing Activity via onNewIntent when possible, so the
            // current React tree (and its router state) stays alive.
            open.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            PendingIntent pi = PendingIntent.getActivity(
                ctx,
                ("quickadd-" + id).hashCode(),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            rv.setOnClickPendingIntent(R.id.widget_root, pi);
            mgr.updateAppWidget(id, rv);
        }
    }
}

package nota.npd.com.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import nota.npd.com.QuickAddOverlayActivity;
import nota.npd.com.R;


/**
 * "Quick Add Task" home-screen widget.
 *
 * Tapping the widget fires a dedicated deep-link intent
 * (flowist://quick-add?src=widget) routed EXCLUSIVELY to
 * {@link QuickAddActivity}, which is a translucent launcher overlay.
 * The main app is never opened for this flow.
 *
 * We use ACTION_VIEW with an explicit ComponentName + unique data URI so:
 *   - Android never falls back to MainActivity's LAUNCHER intent-filter.
 *   - PendingIntent equality is per-widget-id (widgets stay independent).
 *   - The activity can detect "opened from widget" via Intent data.
 */
public class AddTaskWidget extends AppWidgetProvider {
    public static final String ACTION_QUICK_ADD = "nota.npd.com.action.QUICK_ADD";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_add_task);

            Intent open = new Intent(ACTION_QUICK_ADD, Uri.parse("flowist://quick-add?src=widget&wid=" + id));
            open.setComponent(new ComponentName(ctx, QuickAddOverlayActivity.class));
            open.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_MULTIPLE_TASK
                | Intent.FLAG_ACTIVITY_NO_HISTORY
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
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

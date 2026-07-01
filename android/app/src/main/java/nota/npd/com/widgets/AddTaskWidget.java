package nota.npd.com.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import nota.npd.com.R;

/**
 * "Quick Add" home-screen widget.
 *
 * Tapping the widget opens {@link QuickAddActivity}, a translucent dialog
 * that floats directly over the user's launcher — the main Flowist app is
 * NOT launched. The typed task is queued into Capacitor Preferences and
 * hydrated into IndexedDB the next time the app opens.
 */
public class AddTaskWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_add_task);
            Intent open = new Intent(ctx, QuickAddActivity.class);
            open.setAction("nota.npd.com.widgets.QUICK_ADD_" + id);
            open.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
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

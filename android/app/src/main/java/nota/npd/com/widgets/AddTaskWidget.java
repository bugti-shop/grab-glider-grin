package nota.npd.com.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import nota.npd.com.QuickAddActivity;
import nota.npd.com.R;

/**
 * "Quick Add Task" home-screen widget.
 *
 * Tapping the widget opens Flowist and lands directly on the ORIGINAL
 * Task Input Sheet (Today.tsx auto-opens when it sees ?add=1). This is
 * the real React sheet — with NL parsing, priority chips, AI extract,
 * dates, etc. — so tasks entered here sync to the cloud immediately via
 * the app's normal write path (no waiting for the next launch).
 *
 * We use singleTask + SINGLE_TOP so a warm app is reused via
 * onNewIntent() and there's no visible main-screen flash before the
 * sheet appears.
 */
public class AddTaskWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_add_task);
            Intent open = new Intent(ctx, QuickAddActivity.class);
            open.setAction("nota.npd.com.widgets.QUICK_ADD_" + id);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
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

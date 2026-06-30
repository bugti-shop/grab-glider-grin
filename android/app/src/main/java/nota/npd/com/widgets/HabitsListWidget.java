package nota.npd.com.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import nota.npd.com.MainActivity;
import nota.npd.com.R;

/**
 * Scrollable habits list widget with today's progress header.
 * - Header shows "DONE / TOTAL" for habits due today.
 * - Tapping the header opens /todo/habits.
 * - Tapping a row opens /todo/habits?check=<id>, which the Habits page
 *   reads to cycle that habit's check-in status without an extra tap.
 * Data is supplied by HabitsListRemoteViewsFactory which reads the
 * `flowist_widget_habits` Capacitor Preferences key written from the
 * web layer by widgetDataSync.syncHabits().
 */
public class HabitsListWidget extends AppWidgetProvider {
    public static final String ACTION_REFRESH = "nota.npd.com.widgets.HABITS_LIST_REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_habits_list);

            // RemoteViewsService adapter for the ListView
            Intent svc = new Intent(ctx, HabitsListRemoteViewsService.class);
            svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
            rv.setRemoteAdapter(R.id.widget_habits_list, svc);
            rv.setEmptyView(R.id.widget_habits_list, R.id.widget_habits_empty);

            // Header title -> open Habits
            rv.setOnClickPendingIntent(R.id.widget_habits_title, buildOpenIntent(ctx, "/todo/habits", id, "TITLE"));
            rv.setOnClickPendingIntent(R.id.widget_habits_progress, buildOpenIntent(ctx, "/todo/habits", id, "PROG"));

            // Today's progress label from synced summary
            String summary = HabitsListRemoteViewsFactory.readTodaySummary(ctx);
            rv.setTextViewText(R.id.widget_habits_progress, summary);

            // Template intent for list rows (each row supplies its own fillInIntent)
            Intent rowOpen = new Intent(ctx, MainActivity.class);
            rowOpen.setAction("nota.npd.com.widgets.HABIT_ROW_" + id);
            rowOpen.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent rowPi = PendingIntent.getActivity(
                    ctx, ("hrow" + id).hashCode(), rowOpen,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            rv.setPendingIntentTemplate(R.id.widget_habits_list, rowPi);

            mgr.updateAppWidget(id, rv);
            mgr.notifyAppWidgetViewDataChanged(id, R.id.widget_habits_list);
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, HabitsListWidget.class));
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_habits_list);
            onUpdate(ctx, mgr, ids);
        }
    }

    private PendingIntent buildOpenIntent(Context ctx, String path, int widgetId, String tag) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction("nota.npd.com.widgets.HABITS_LIST_" + tag + "_" + widgetId);
        open.setData(Uri.parse("codaib://widget" + path));
        open.putExtra("widget_path", path);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, (tag + path + widgetId).hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}

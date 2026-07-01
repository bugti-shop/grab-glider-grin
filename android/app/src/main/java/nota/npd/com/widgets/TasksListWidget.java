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
import nota.npd.com.QuickAddActivity;
import nota.npd.com.R;

/**
 * Scrollable tasks list widget with a quick-add button.
 * - Header "+" opens the add-task sheet via the WidgetEntry route.
 * - Tapping a task row opens Today page.
 * - List rows are filled via TasksListRemoteViewsService.
 */
public class TasksListWidget extends AppWidgetProvider {
    public static final String ACTION_REFRESH = "nota.npd.com.widgets.TASKS_LIST_REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_tasks_list);

            // RemoteViewsService adapter for the ListView
            Intent svc = new Intent(ctx, TasksListRemoteViewsService.class);
            svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
            rv.setRemoteAdapter(R.id.widget_tasks_list, svc);
            rv.setEmptyView(R.id.widget_tasks_list, R.id.widget_empty);

            // Header title -> open Today
            rv.setOnClickPendingIntent(R.id.widget_title, buildOpenIntent(ctx, "/todo/today", id, "TITLE"));

            // Quick-add button -> open add-task sheet
            rv.setOnClickPendingIntent(R.id.widget_quick_add, buildQuickAddIntent(ctx, id));

            // Template intent for list rows (each row supplies its own fillInIntent)
            Intent rowOpen = new Intent(ctx, MainActivity.class);
            rowOpen.setAction("nota.npd.com.widgets.TASK_ROW_" + id);
            rowOpen.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent rowPi = PendingIntent.getActivity(
                    ctx, ("row" + id).hashCode(), rowOpen,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            rv.setPendingIntentTemplate(R.id.widget_tasks_list, rowPi);

            mgr.updateAppWidget(id, rv);
            mgr.notifyAppWidgetViewDataChanged(id, R.id.widget_tasks_list);
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TasksListWidget.class));
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_tasks_list);
            onUpdate(ctx, mgr, ids);
        }
    }

    private PendingIntent buildOpenIntent(Context ctx, String path, int widgetId, String tag) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction("nota.npd.com.widgets.TASKS_LIST_" + tag + "_" + widgetId);
        open.setData(Uri.parse("codaib://widget" + path));
        open.putExtra("widget_path", path);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, (tag + path + widgetId).hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent buildQuickAddIntent(Context ctx, int widgetId) {
        Intent open = new Intent(ctx, QuickAddActivity.class);
        open.setAction("nota.npd.com.widgets.TASKS_LIST_QUICK_ADD_" + widgetId);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, ("quickadd-list" + widgetId).hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
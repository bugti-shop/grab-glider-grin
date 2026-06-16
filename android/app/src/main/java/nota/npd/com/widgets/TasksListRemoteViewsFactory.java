package nota.npd.com.widgets;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import nota.npd.com.R;

/**
 * Reads the synced tasks JSON written by widgetDataSync (key: flowist_widget_tasks)
 * and renders rows for the TasksListWidget ListView.
 */
public class TasksListRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {
    private static final String TASKS_KEY = "flowist_widget_tasks";
    private final Context ctx;
    private final List<Row> rows = new ArrayList<>();

    private static class Row {
        String id;
        String text;
        String dueLabel;
    }

    TasksListRemoteViewsFactory(Context ctx) {
        this.ctx = ctx;
    }

    @Override public void onCreate() {}
    @Override public void onDestroy() { rows.clear(); }
    @Override public int getCount() { return rows.size(); }
    @Override public long getItemId(int i) { return i; }
    @Override public boolean hasStableIds() { return true; }
    @Override public int getViewTypeCount() { return 1; }
    @Override public RemoteViews getLoadingView() { return null; }

    @Override
    public void onDataSetChanged() {
        rows.clear();
        try {
            JSONObject root = WidgetPrefs.getJson(ctx, TASKS_KEY);
            if (root == null) return;
            JSONArray arr = root.optJSONArray("tasks");
            if (arr == null) return;
            SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            in.setLenient(true);
            SimpleDateFormat out = new SimpleDateFormat("MMM d", Locale.getDefault());
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                if (o.optBoolean("completed", false)) continue;
                Row r = new Row();
                r.id = o.optString("id", "");
                r.text = o.optString("text", "");
                String due = o.optString("dueDate", "");
                if (due != null && due.length() >= 10) {
                    try {
                        Date d = in.parse(due.substring(0, 19).replace("Z", ""));
                        if (d != null) r.dueLabel = "Due " + out.format(d);
                    } catch (Exception ignored) {}
                }
                rows.add(r);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public RemoteViews getViewAt(int position) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_tasks_list_item);
        if (position < 0 || position >= rows.size()) return rv;
        Row r = rows.get(position);
        rv.setTextViewText(R.id.item_text, r.text);
        if (r.dueLabel != null) {
            rv.setTextViewText(R.id.item_due, r.dueLabel);
            rv.setViewVisibility(R.id.item_due, View.VISIBLE);
        } else {
            rv.setViewVisibility(R.id.item_due, View.GONE);
        }

        // Per-row fill-in intent to open Today (with optional task id).
        Intent fill = new Intent();
        String path = "/todo/today";
        fill.setData(Uri.parse("codaib://widget" + path + "?task=" + Uri.encode(r.id)));
        fill.putExtra("widget_path", path);
        rv.setOnClickFillInIntent(R.id.item_root, fill);
        return rv;
    }
}
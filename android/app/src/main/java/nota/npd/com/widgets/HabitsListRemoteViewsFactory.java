package nota.npd.com.widgets;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import nota.npd.com.R;

/**
 * Reads the synced habits JSON written by widgetDataSync.syncHabits
 * (key: flowist_widget_habits) and renders today's due habits as rows.
 *
 * JSON shape (kept tiny on purpose):
 * {
 *   "today": { "done": 2, "total": 5, "label": "Tuesday, Jun 30" },
 *   "habits": [
 *     { "id": "...", "name": "Read", "emoji": "📚", "color": "#3c78f0",
 *       "done": true, "streak": 12, "progress": "1 / 1" }
 *   ]
 * }
 */
public class HabitsListRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {
    private static final String HABITS_KEY = "flowist_widget_habits";
    private final Context ctx;
    private final List<Row> rows = new ArrayList<>();

    private static class Row {
        String id, name, emoji, color, progress;
        boolean done;
        int streak;
    }

    HabitsListRemoteViewsFactory(Context ctx) { this.ctx = ctx; }

    /** Used by the widget header to show "2 / 5 today". */
    static String readTodaySummary(Context ctx) {
        JSONObject root = WidgetPrefs.getJson(ctx, HABITS_KEY);
        if (root == null) return "No habits today";
        JSONObject t = root.optJSONObject("today");
        if (t == null) return "";
        int done = t.optInt("done", 0);
        int total = t.optInt("total", 0);
        if (total == 0) return "Nothing due today";
        return done + " / " + total + " today";
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
            JSONObject root = WidgetPrefs.getJson(ctx, HABITS_KEY);
            if (root == null) return;
            JSONArray arr = root.optJSONArray("habits");
            if (arr == null) return;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                Row r = new Row();
                r.id = o.optString("id", "");
                r.name = o.optString("name", "");
                r.emoji = o.optString("emoji", "✨");
                r.color = o.optString("color", "#3c78f0");
                r.done = o.optBoolean("done", false);
                r.streak = o.optInt("streak", 0);
                r.progress = o.optString("progress", "");
                rows.add(r);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public RemoteViews getViewAt(int position) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_habits_list_item);
        if (position < 0 || position >= rows.size()) return rv;
        Row r = rows.get(position);

        rv.setTextViewText(R.id.h_emoji, r.emoji);
        rv.setTextViewText(R.id.h_name, r.name);

        // Subtle accent tinting by habit color.
        try {
            int c = Color.parseColor(r.color);
            rv.setInt(R.id.h_emoji_bg, "setColorFilter", (c & 0x00FFFFFF) | 0x33000000);
        } catch (Exception ignored) {}

        if (r.done) {
            rv.setViewVisibility(R.id.h_check, View.VISIBLE);
            rv.setTextViewText(R.id.h_meta, "Done • " + r.streak + "🔥");
        } else {
            rv.setViewVisibility(R.id.h_check, View.GONE);
            String meta = r.streak > 0 ? r.streak + "🔥" : "Tap to check in";
            if (r.progress != null && r.progress.length() > 0) meta = r.progress + " • " + meta;
            rv.setTextViewText(R.id.h_meta, meta);
        }

        // Per-row fill-in intent: tap row to check-in for this habit.
        Intent fill = new Intent();
        String path = "/todo/habits?check=" + Uri.encode(r.id);
        fill.setData(Uri.parse("codaib://widget" + path));
        fill.putExtra("widget_path", path);
        rv.setOnClickFillInIntent(R.id.h_root, fill);
        return rv;
    }
}

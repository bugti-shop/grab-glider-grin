package nota.npd.com;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import nota.npd.com.widgets.AddTaskWidget;
import nota.npd.com.widgets.TasksListWidget;

/**
 * True launcher overlay for the Quick Add widget. It does NOT open MainActivity.
 * Tasks are appended to CapacitorStorage and drained by the web app on next run.
 */
public class QuickAddActivity extends Activity {
    private static final String PREFS = "CapacitorStorage";
    private static final String QUEUE_KEY = "widget_pending_new_tasks";
    private EditText input;
    private TextView status;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setDimAmount(0.18f);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(14), dp(18), dp(14));
        root.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("Quick add task");
        title.setTextColor(Color.rgb(15,23,42));
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        input = new EditText(this);
        input.setHint("e.g. Buy groceries tomorrow at 6");
        input.setSingleLine(false);
        input.setMinLines(2);
        input.setTextSize(16);
        input.setSelectAllOnFocus(false);
        root.addView(input, new LinearLayout.LayoutParams(-1, -2));

        status = new TextView(this);
        status.setText("Add as many tasks as you want. Done closes this launcher sheet.");
        status.setTextColor(Color.rgb(100,116,139));
        status.setTextSize(12);
        root.addView(status);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.END);
        buttons.setPadding(0, dp(10), 0, 0);
        Button done = new Button(this); done.setText("Done");
        Button add = new Button(this); add.setText("Add");
        buttons.addView(done);
        buttons.addView(add);
        root.addView(buttons, new LinearLayout.LayoutParams(-1, -2));

        setContentView(root);
        add.setOnClickListener(v -> addTask(false));
        done.setOnClickListener(v -> finish());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN) {
                addTask(false);
                return true;
            }
            return false;
        });
        input.requestFocus();
        input.postDelayed(() -> ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(input, 0), 180);
    }

    // Single monitor for the whole process — prevents two widget-triggered
    // instances from racing on read-modify-write of the shared queue.
    private static final Object QUEUE_LOCK = new Object();

    private void addTask(boolean close) {
        String text = input.getText().toString().trim();
        if (text.length() == 0) return;
        try {
            synchronized (QUEUE_LOCK) {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                String raw = sp.getString(QUEUE_KEY, "[]");
                JSONArray arr = new JSONArray(raw == null ? "[]" : raw);
                JSONObject obj = new JSONObject();
                obj.put("text", text);
                obj.put("createdAt", System.currentTimeMillis());
                arr.put(obj);
                // .commit() is synchronous — guarantees the write lands before
                // the activity can be killed by the system.
                sp.edit().putString(QUEUE_KEY, arr.toString()).commit();
            }
            input.setText("");
            status.setText("Queued. Type another task, or tap Done.");
            refreshWidgets();
            if (close) finish();
        } catch (Exception e) {
            status.setText("Could not add task. Please try again.");
        }
    }

    private void refreshWidgets() {
        try {
            sendBroadcast(new Intent(TasksListWidget.ACTION_REFRESH));
        } catch (Exception ignored) {}
    }

    private int dp(int v) { return (int)(v * getResources().getDisplayMetrics().density + 0.5f); }
}
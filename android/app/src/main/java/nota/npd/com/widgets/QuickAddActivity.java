package nota.npd.com.widgets;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;

import nota.npd.com.R;

/**
 * Launcher-level Quick Add for tasks.
 *
 * Rendered as a translucent Dialog activity so it appears to float directly
 * over the launcher — the main Flowist app is NEVER opened. The typed task
 * title is queued into Capacitor Preferences under `widget_pending_new_tasks`
 * (a JSON array); the React app drains this queue on next launch, inserts
 * each entry into IndexedDB, and cloud-sync writes them to Supabase from
 * there. This mirrors Todoist's widget quick-add UX.
 */
public class QuickAddActivity extends Activity {

    private static final String PENDING_KEY = "widget_pending_new_tasks";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Show the soft keyboard immediately without pushing the dialog around.
        getWindow().setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
                        | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setContentView(R.layout.activity_quick_add);

        final EditText input = findViewById(R.id.quick_add_input);
        final Button save = findViewById(R.id.quick_add_save);
        final Button cancel = findViewById(R.id.quick_add_cancel);
        final View scrim = findViewById(R.id.quick_add_scrim);

        input.requestFocus();
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE
                    || actionId == EditorInfo.IME_ACTION_GO
                    || actionId == EditorInfo.IME_ACTION_SEND) {
                submit(input.getText().toString());
                return true;
            }
            return false;
        });

        save.setOnClickListener(v -> submit(input.getText().toString()));
        cancel.setOnClickListener(v -> finishWithoutOpeningApp());
        scrim.setOnClickListener(v -> finishWithoutOpeningApp());
    }

    private void submit(String rawText) {
        String text = rawText == null ? "" : rawText.trim();
        if (TextUtils.isEmpty(text)) {
            Toast.makeText(this, "Type a task first", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            SharedPreferences sp = getSharedPreferences(WidgetPrefs.GROUP, Context.MODE_PRIVATE);
            String existing = sp.getString(PENDING_KEY, null);
            JSONArray arr = existing != null ? new JSONArray(existing) : new JSONArray();

            JSONObject item = new JSONObject();
            item.put("id", UUID.randomUUID().toString());
            item.put("text", text);
            item.put("createdAt", System.currentTimeMillis());
            item.put("source", "android_widget_quick_add");
            arr.put(item);

            sp.edit().putString(PENDING_KEY, arr.toString()).apply();
            Toast.makeText(this, "Task added", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Couldn't save task", Toast.LENGTH_SHORT).show();
        }
        finishWithoutOpeningApp();
    }

    private void finishWithoutOpeningApp() {
        try {
            InputMethodManager imm =
                    (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            View focus = getCurrentFocus();
            if (imm != null && focus != null) {
                imm.hideSoftInputFromWindow(focus.getWindowToken(), 0);
            }
        } catch (Exception ignored) {}
        finish();
        // No enter/exit animation, and crucially do NOT bring the main task
        // back — the launcher stays visible underneath.
        overridePendingTransition(0, 0);
    }

    @Override
    public void onBackPressed() {
        finishWithoutOpeningApp();
    }
}

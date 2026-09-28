package nota.npd.com;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public class FlowistAlarmActivity extends Activity {
    private String key;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        key = getIntent().getStringExtra("key");
        String title = getIntent().getStringExtra("title");
        String priority = getIntent().getStringExtra("priority");
        if (key == null) { finish(); return; }
        org.json.JSONObject stored = FlowistAlarm.get(this, key);
        if (stored != null) {
            if (title == null) title = stored.optString("title", "Reminder");
            if (priority == null) priority = stored.optString("priority", "None");
        }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER); root.setPadding(dp(30), dp(36), dp(30), dp(36)); root.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this); logo.setImageResource(R.mipmap.ic_launcher); logo.setContentDescription("Flowist");
        LinearLayout.LayoutParams image = new LinearLayout.LayoutParams(dp(108), dp(108)); image.bottomMargin = dp(24); root.addView(logo, image);
        TextView label = text("FLOWIST ALARM", 13, Color.rgb(219, 37, 45), true); root.addView(label);
        TextView heading = text(title == null ? "Reminder" : title, 30, Color.rgb(24, 24, 27), true);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2); headingParams.topMargin = dp(18); headingParams.bottomMargin = dp(12); root.addView(heading, headingParams);
        TextView level = text("Priority · " + (priority == null ? "None" : priority), 17, Color.DKGRAY, false); root.addView(level);
        View space = new View(this); root.addView(space, new LinearLayout.LayoutParams(1, dp(52)));
        Button snooze = new Button(this); snooze.setText("Snooze 5 minutes"); snooze.setAllCaps(false); snooze.setOnClickListener(v -> stop(true)); root.addView(snooze, new LinearLayout.LayoutParams(-1, dp(56)));
        Button dismiss = new Button(this); dismiss.setText("Dismiss"); dismiss.setAllCaps(false); dismiss.setOnClickListener(v -> stop(false)); root.addView(dismiss, new LinearLayout.LayoutParams(-1, dp(56)));
        setContentView(root);
    }
    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(size); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(null, Typeface.BOLD); return t;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void stop(boolean snooze) {
        Intent action = new Intent(this, FlowistAlarmReceiver.class).setAction(snooze ? FlowistAlarm.ACTION_SNOOZE : FlowistAlarm.ACTION_DISMISS).putExtra("key", key);
        sendBroadcast(action); finish();
    }
}

package nota.npd.com;

import android.app.*;
import android.content.*;
import android.os.*;
import androidx.core.app.NotificationCompat;

public class FocusForegroundService extends Service {
    public static final String ACTION_START = "nota.npd.com.focus.START";
    public static final String ACTION_STOP = "nota.npd.com.focus.STOP";
    private static final String CHANNEL = "flowist_focus_timer";
    private static final int ID = 918273;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endAt = 0;
    private int remaining = 0;
    private boolean running = false;
    private String taskTitle = "";

    private final Runnable tick = new Runnable() { public void run() {
        if (running && endAt > 0) remaining = Math.max(0, (int)((endAt - System.currentTimeMillis()) / 1000));
        startForeground(ID, buildNotification());
        if (running && remaining > 0) handler.postDelayed(this, 1000);
    }};

    @Override public void onCreate() { super.onCreate(); createChannel(); }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        if (i != null && ACTION_STOP.equals(i.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (i != null) {
            endAt = i.getLongExtra("endAtMs", 0);
            remaining = i.getIntExtra("remainingSec", remaining);
            running = i.getBooleanExtra("running", true);
            taskTitle = i.getStringExtra("taskTitle") == null ? "" : i.getStringExtra("taskTitle");
        }
        handler.removeCallbacks(tick);
        startForeground(ID, buildNotification());
        if (running) handler.postDelayed(tick, 1000);
        return START_STICKY;
    }

    @Override public void onDestroy() { handler.removeCallbacks(tick); super.onDestroy(); }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 918, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, FocusForegroundService.class); stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 919, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String body = fmt(remaining) + " remaining" + (taskTitle.length() > 0 ? " · " + taskTitle : "");
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(running ? "🎯 Focus running" : "⏸ Focus paused")
            .setContentText(body)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPi)
            .addAction(R.drawable.ic_stat_notify, "Exit", stopPi)
            .build();
    }
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Focus Timer", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Persistent Focus Mode timer");
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }
    private String fmt(int sec) { int s=Math.max(0,sec), h=s/3600, m=(s%3600)/60, r=s%60; return h>0 ? h+":"+pad(m)+":"+pad(r) : m+":"+pad(r); }
    private String pad(int n) { return n < 10 ? "0"+n : String.valueOf(n); }
}
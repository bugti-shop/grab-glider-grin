package nota.npd.com;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.*;
import androidx.core.app.NotificationCompat;

public class FocusForegroundService extends Service {
    public static final String ACTION_START = "nota.npd.com.focus.START";
    public static final String ACTION_STOP = "nota.npd.com.focus.STOP";
    private static final String CHANNEL = "flowist_focus_timer";
    private static final String CHANNEL_DONE = "flowist_focus_done";
    private static final int ID = 918273;
    private static final int ID_DONE = 918274;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endAt = 0;
    private int remaining = 0;
    private boolean running = false;
    private String taskTitle = "";
    private String soundUrl = "";
    private float soundVolume = 0.4f;
    private MediaPlayer player;
    private PowerManager.WakeLock wakeLock;

    private final Runnable tick = new Runnable() { public void run() {
        if (running && endAt > 0) {
            remaining = Math.max(0, (int)((endAt - System.currentTimeMillis()) / 1000));
        }
        try { startForeground(ID, buildNotification()); } catch (Throwable ignored) {}
        if (running && remaining <= 0) {
            postCompleteNotification();
            stopSelf();
            return;
        }
        if (running) handler.postDelayed(this, 1000);
    }};

    @Override public void onCreate() { super.onCreate(); createChannels(); }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        if (i != null && ACTION_STOP.equals(i.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (i != null) {
            endAt = i.getLongExtra("endAtMs", 0);
            remaining = i.getIntExtra("remainingSec", remaining);
            running = i.getBooleanExtra("running", true);
            taskTitle = i.getStringExtra("taskTitle") == null ? "" : i.getStringExtra("taskTitle");
            String newUrl = i.getStringExtra("soundUrl");
            if (newUrl == null) newUrl = "";
            float newVol = (float) i.getDoubleExtra("soundVolume", soundVolume);
            boolean urlChanged = !newUrl.equals(soundUrl);
            soundUrl = newUrl;
            soundVolume = Math.max(0f, Math.min(1f, newVol));
            if (urlChanged) { stopPlayer(); }
            if (running && soundUrl.length() > 0) startPlayer();
            else if (!running) pausePlayer();
            if (player != null) { try { player.setVolume(soundVolume, soundVolume); } catch (Throwable ignored) {} }
        }
        acquireWake();
        handler.removeCallbacks(tick);
        try { startForeground(ID, buildNotification()); } catch (Throwable ignored) {}
        if (running) handler.postDelayed(tick, 1000);
        return START_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        stopPlayer();
        releaseWake();
        super.onDestroy();
    }

    // ---- Media player -----------------------------------------------------
    private void startPlayer() {
        try {
            if (player == null) {
                player = new MediaPlayer();
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
                player.setLooping(true);
                player.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
                player.setDataSource(this, Uri.parse(soundUrl));
                player.setVolume(soundVolume, soundVolume);
                player.setOnPreparedListener(mp -> { try { mp.start(); } catch (Throwable ignored) {} });
                player.setOnErrorListener((mp, what, extra) -> { stopPlayer(); return true; });
                player.prepareAsync();
            } else if (!player.isPlaying()) {
                try { player.start(); } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) { stopPlayer(); }
    }
    private void pausePlayer() {
        try { if (player != null && player.isPlaying()) player.pause(); } catch (Throwable ignored) {}
    }
    private void stopPlayer() {
        try { if (player != null) { player.stop(); player.release(); } } catch (Throwable ignored) {}
        player = null;
    }

    private void acquireWake() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "flowist:focus");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } catch (Throwable ignored) {}
    }
    private void releaseWake() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Throwable ignored) {}
        wakeLock = null;
    }

    // ---- Notifications ----------------------------------------------------
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
    private void postCompleteNotification() {
        try {
            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent openPi = PendingIntent.getActivity(this, 920, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification n = new NotificationCompat.Builder(this, CHANNEL_DONE)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle("✅ Focus complete")
                .setContentText("Great work!" + (taskTitle.length() > 0 ? " · " + taskTitle : ""))
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .build();
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(ID_DONE, n);
        } catch (Throwable ignored) {}
    }
    private void createChannels() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Focus Timer", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Persistent Focus Mode timer");
            nm.createNotificationChannel(ch);
            NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Focus Complete", NotificationManager.IMPORTANCE_DEFAULT);
            done.setDescription("Focus session finished");
            nm.createNotificationChannel(done);
        }
    }
    private String fmt(int sec) { int s=Math.max(0,sec), h=s/3600, m=(s%3600)/60, r=s%60; return h>0 ? h+":"+pad(m)+":"+pad(r) : m+":"+pad(r); }
    private String pad(int n) { return n < 10 ? "0"+n : String.valueOf(n); }
}

package nota.npd.com;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.*;
import androidx.core.app.NotificationCompat;

/**
 * Persistent Focus session service.
 *
 * Notification actions (control the session without opening the app):
 *   • Pause / Resume — toggles the timer + ambient sound
 *   • Mute  / Unmute — mutes the sound but keeps the timer running
 *   • Vol − / Vol +  — adjusts volume in 10% steps
 *   • Exit           — stops the session entirely
 *
 * State changes are broadcast to JS via `FocusTimerPlugin.emit(...)` so the
 * in-app FocusMode UI stays in sync when the user acts from the shade.
 */
public class FocusForegroundService extends Service {
    public static final String ACTION_START   = "nota.npd.com.focus.START";
    public static final String ACTION_STOP    = "nota.npd.com.focus.STOP";
    public static final String ACTION_PAUSE   = "nota.npd.com.focus.PAUSE";
    public static final String ACTION_RESUME  = "nota.npd.com.focus.RESUME";
    public static final String ACTION_MUTE    = "nota.npd.com.focus.MUTE";
    public static final String ACTION_UNMUTE  = "nota.npd.com.focus.UNMUTE";
    public static final String ACTION_VOL_UP  = "nota.npd.com.focus.VOL_UP";
    public static final String ACTION_VOL_DN  = "nota.npd.com.focus.VOL_DN";

    private static final String CHANNEL      = "flowist_focus_timer";
    private static final String CHANNEL_DONE = "flowist_focus_done";
    private static final int ID      = 918273;
    private static final int ID_DONE = 918274;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endAt = 0;
    private int remaining = 0;
    private boolean running = false;
    private boolean muted = false;
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
        if (running && remaining <= 0) { postCompleteNotification(); stopSelf(); return; }
        if (running) handler.postDelayed(this, 1000);
    }};

    @Override public void onCreate() { super.onCreate(); createChannels(); }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        String action = i != null ? i.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            FocusTimerPlugin.emit("stop", running, muted, soundVolume);
            stopSelf(); return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) { running = false; pausePlayer(); FocusTimerPlugin.emit("pause", running, muted, soundVolume); }
        else if (ACTION_RESUME.equals(action)) { running = true; if (soundUrl.length()>0 && !muted) startPlayer(); FocusTimerPlugin.emit("resume", running, muted, soundVolume); }
        else if (ACTION_MUTE.equals(action)) { muted = true; if (player != null) try { player.setVolume(0f, 0f); } catch (Throwable ignored) {} FocusTimerPlugin.emit("mute", running, muted, soundVolume); }
        else if (ACTION_UNMUTE.equals(action)) { muted = false; if (player != null) try { player.setVolume(soundVolume, soundVolume); } catch (Throwable ignored) {} else if (running && soundUrl.length()>0) startPlayer(); FocusTimerPlugin.emit("unmute", running, muted, soundVolume); }
        else if (ACTION_VOL_UP.equals(action)) { soundVolume = Math.min(1f, soundVolume + 0.1f); if (player != null && !muted) try { player.setVolume(soundVolume, soundVolume); } catch (Throwable ignored) {} FocusTimerPlugin.emit("volume", running, muted, soundVolume); }
        else if (ACTION_VOL_DN.equals(action)) { soundVolume = Math.max(0f, soundVolume - 0.1f); if (player != null && !muted) try { player.setVolume(soundVolume, soundVolume); } catch (Throwable ignored) {} FocusTimerPlugin.emit("volume", running, muted, soundVolume); }
        else if (i != null) {
            endAt = i.getLongExtra("endAtMs", 0);
            remaining = i.getIntExtra("remainingSec", remaining);
            running = i.getBooleanExtra("running", true);
            taskTitle = i.getStringExtra("taskTitle") == null ? "" : i.getStringExtra("taskTitle");
            String newUrl = i.getStringExtra("soundUrl"); if (newUrl == null) newUrl = "";
            float newVol = (float) i.getDoubleExtra("soundVolume", soundVolume);
            boolean urlChanged = !newUrl.equals(soundUrl);
            soundUrl = newUrl;
            soundVolume = Math.max(0f, Math.min(1f, newVol));
            if (urlChanged) stopPlayer();
            if (running && soundUrl.length() > 0 && !muted) startPlayer();
            else if (!running) pausePlayer();
            if (player != null) { try { player.setVolume(muted ? 0f : soundVolume, muted ? 0f : soundVolume); } catch (Throwable ignored) {} }
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
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                player.setLooping(true);
                player.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
                player.setDataSource(this, Uri.parse(soundUrl));
                player.setVolume(muted ? 0f : soundVolume, muted ? 0f : soundVolume);
                player.setOnPreparedListener(mp -> { try { mp.start(); } catch (Throwable ignored) {} });
                player.setOnErrorListener((mp, what, extra) -> { stopPlayer(); return true; });
                player.prepareAsync();
            } else if (!player.isPlaying()) { try { player.start(); } catch (Throwable ignored) {} }
        } catch (Throwable ignored) { stopPlayer(); }
    }
    private void pausePlayer() { try { if (player != null && player.isPlaying()) player.pause(); } catch (Throwable ignored) {} }
    private void stopPlayer()  { try { if (player != null) { player.stop(); player.release(); } } catch (Throwable ignored) {} player = null; }

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
    private void releaseWake() { try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Throwable ignored) {} wakeLock = null; }

    // ---- Notifications ----------------------------------------------------
    private PendingIntent pi(String action, int req) {
        Intent in = new Intent(this, FocusForegroundService.class); in.setAction(action);
        return PendingIntent.getService(this, req, in, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 918, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String body = fmt(remaining) + " remaining" + (taskTitle.length() > 0 ? " · " + taskTitle : "");
        if (soundUrl.length() > 0) {
            body += " · Vol " + Math.round((muted ? 0f : soundVolume) * 100) + "%" + (muted ? " (muted)" : "");
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(running ? "🎯 Focus running" : "⏸ Focus paused")
            .setContentText(body)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPi)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body));

        // Timer control
        if (running) b.addAction(R.drawable.ic_stat_notify, "Pause",  pi(ACTION_PAUSE, 921));
        else         b.addAction(R.drawable.ic_stat_notify, "Resume", pi(ACTION_RESUME, 922));

        // Sound controls only when a sound is loaded
        if (soundUrl.length() > 0) {
            if (muted) b.addAction(R.drawable.ic_stat_notify, "Unmute", pi(ACTION_UNMUTE, 923));
            else       b.addAction(R.drawable.ic_stat_notify, "Mute",   pi(ACTION_MUTE, 924));
            b.addAction(R.drawable.ic_stat_notify, "Vol −", pi(ACTION_VOL_DN, 925));
            b.addAction(R.drawable.ic_stat_notify, "Vol +", pi(ACTION_VOL_UP, 926));
        }
        b.addAction(R.drawable.ic_stat_notify, "Exit", pi(ACTION_STOP, 919));
        return b.build();
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
                .setAutoCancel(true).setContentIntent(openPi).build();
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(ID_DONE, n);
        } catch (Throwable ignored) {}
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Focus Timer", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Persistent Focus Mode timer"); nm.createNotificationChannel(ch);
            NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Focus Complete", NotificationManager.IMPORTANCE_DEFAULT);
            done.setDescription("Focus session finished"); nm.createNotificationChannel(done);
        }
    }

    private String fmt(int sec) { int s=Math.max(0,sec), h=s/3600, m=(s%3600)/60, r=s%60; return h>0 ? h+":"+pad(m)+":"+pad(r) : m+":"+pad(r); }
    private String pad(int n) { return n < 10 ? "0"+n : String.valueOf(n); }
}

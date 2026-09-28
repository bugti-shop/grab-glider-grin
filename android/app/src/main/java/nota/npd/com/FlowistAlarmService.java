package nota.npd.com;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

public class FlowistAlarmService extends Service {
    private MediaPlayer player;
    private Vibrator vibrator;
    private static final int NOTIFICATION_ID = 9071;
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String key = intent == null ? null : intent.getStringExtra("key");
        if (key == null) { stopSelf(); return START_NOT_STICKY; }
        String title = intent.getStringExtra("title");
        String priority = intent.getStringExtra("priority");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(FlowistAlarm.CHANNEL, "Ringing alarms", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Full-screen alarms for time-specific reminders");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setSound(null, null); // The service owns continuous playback, not the notification.
            manager.createNotificationChannel(channel);
        }
        Intent screen = new Intent(this, FlowistAlarmActivity.class).putExtra("key", key).putExtra("title", title).putExtra("priority", priority);
        screen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent full = PendingIntent.getActivity(this, key.hashCode(), screen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, FlowistAlarmReceiver.class).setAction(FlowistAlarm.ACTION_DISMISS).putExtra("key", key);
        PendingIntent dismiss = PendingIntent.getBroadcast(this, key.hashCode(), stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(this, FlowistAlarm.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify).setContentTitle(title).setContentText("Priority: " + priority)
            .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(true).setContentIntent(full)
            .setFullScreenIntent(full, true).addAction(R.drawable.ic_stat_notify, "Dismiss", dismiss).build();
        startForeground(NOTIFICATION_ID, notification);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.flowist_alarm));
            player.setLooping(true);
            player.prepare();
            player.start();
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 550, 350}, 0), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        } catch (Exception ignored) { }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        if (player != null) { player.stop(); player.release(); player = null; }
        if (vibrator != null) vibrator.cancel();
        super.onDestroy();
    }
}

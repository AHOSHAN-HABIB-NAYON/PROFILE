package app.quizwar.bd;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import android.graphics.Bitmap;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;

/**
 * Keeps the microphone working during an audio call while the screen is off or the app is in
 * the background (Android stops the mic for background apps otherwise). Shows an ongoing
 * "call in progress" notification; tapping it returns to the app. Stopped when the call ends.
 */
public class QwCallService extends Service {
    static final String CHANNEL = "quizwar_call_active"; // shown in the list like WhatsApp, but silent
    private static final int ID = 4242;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "QUIZ WAR";
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "Call in progress";
        boolean live = intent == null || intent.getBooleanExtra("live", true);
        String avatarUrl = intent != null ? intent.getStringExtra("avatar") : null;
        String hangText = intent != null && intent.getStringExtra("hang") != null ? intent.getStringExtra("hang") : "Hang up";
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Ongoing call", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setShowBadge(false);
                ch.setSound(null, null);
                ch.enableVibration(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            // "Hang up" on the notification: the app ends the call.
            Intent hang = new Intent(this, QwCallActionReceiver.class);
            hang.putExtra("qw_hangup", true);
            PendingIntent hangPi = PendingIntent.getBroadcast(this, 9, hang, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_notify)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setUsesChronometer(live)
                    .setContentIntent(pi)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setSilent(true)
                    .setShowWhen(true);
            Notification n = withStyle(b, title, text, null, hangPi, hangText).build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(ID, n);
            // The caller's picture loads in the background (network), then the notification updates.
            if (avatarUrl != null && nm != null) {
                final NotificationManager fnm = nm;
                new Thread(() -> {
                    Bitmap avatar = QwCallNotifier.loadAvatarPublic(avatarUrl);
                    if (avatar == null) return;
                    try {
                        b.setLargeIcon(avatar);
                        fnm.notify(ID, withStyle(b, title, text, avatar, hangPi, hangText).build());
                    } catch (Exception ignored) {
                    }
                }).start();
            }
        } catch (Exception e) {
            // Not allowed right now (e.g. no mic permission): the call still works while the app is open.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /** WhatsApp-style ongoing call: caller name, status and a red Hang up button. */
    private static NotificationCompat.Builder withStyle(NotificationCompat.Builder b, String title, String text, Bitmap avatar, PendingIntent hang, String hangText) {
        try {
            Person.Builder pb = new Person.Builder().setName(title).setImportant(true);
            if (avatar != null) pb.setIcon(IconCompat.createWithBitmap(avatar));
            b.setStyle(NotificationCompat.CallStyle.forOngoingCall(pb.build(), hang));
            b.setContentText(text);
        } catch (Exception e) {
            b.clearActions();
            b.addAction(0, hangText, hang);
        }
        return b;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

package app.quizwar.bd;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
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

    /** True while the call service (and its notification) is up. */
    static volatile boolean running = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification n = build(this, intent, null);
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(ID, n);
            running = true;
            holdLocks(this);
            loadAvatarLater(this, intent);
        } catch (Exception e) {
            // Not allowed right now (e.g. no mic permission): the call still works while the app is open.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /**
     * Calling… → Ringing… → Ongoing: change the text of the notification that is already shown.
     * (Starting the service again from the background is not allowed on new Android versions.)
     */
    static void update(Context ctx, Intent intent) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            nm.notify(ID, build(ctx, intent, null));
            loadAvatarLater(ctx, intent);
        } catch (Exception ignored) {
        }
    }

    private static void loadAvatarLater(Context ctx, Intent intent) {
        final String avatarUrl = intent != null ? intent.getStringExtra("avatar") : null;
        if (avatarUrl == null) return;
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            Bitmap avatar = QwCallNotifier.loadAvatarPublic(avatarUrl);
            if (avatar == null || !running) return;
            try {
                NotificationManager nm = (NotificationManager) app.getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.notify(ID, build(app, intent, avatar));
            } catch (Exception ignored) {
            }
        }).start();
    }

    private static Notification build(Context ctx, Intent intent, Bitmap avatar) {
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "QUIZ WAR";
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "Call in progress";
        boolean live = intent == null || intent.getBooleanExtra("live", true);
        String hangText = intent != null && intent.getStringExtra("hang") != null ? intent.getStringExtra("hang") : "Hang up";
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Ongoing call", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // "Hang up" on the notification: the app ends the call.
        Intent hang = new Intent(ctx, QwCallActionReceiver.class);
        hang.putExtra("qw_hangup", true);
        PendingIntent hangPi = PendingIntent.getBroadcast(ctx, 9, hang, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
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
        if (avatar != null) b.setLargeIcon(avatar);
        return withStyle(b, title, text, avatar, hangPi, hangText).build();
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

    /** Keep the CPU and Wi-Fi awake while the call runs (screen off / app in the background). */
    private static android.os.PowerManager.WakeLock cpu;
    private static android.net.wifi.WifiManager.WifiLock wifi;

    private static void holdLocks(Context ctx) {
        try {
            if (cpu == null) {
                android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(POWER_SERVICE);
                cpu = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "quizwar:call");
                cpu.setReferenceCounted(false);
            }
            cpu.acquire(4 * 60 * 60 * 1000L); // safety cap: 4 hours
        } catch (Exception ignored) {
        }
        try {
            if (wifi == null) {
                android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) ctx.getApplicationContext().getSystemService(WIFI_SERVICE);
                int mode = Build.VERSION.SDK_INT >= 29 ? android.net.wifi.WifiManager.WIFI_MODE_FULL_LOW_LATENCY : android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifi = wm.createWifiLock(mode, "quizwar:call");
                wifi.setReferenceCounted(false);
            }
            wifi.acquire();
        } catch (Exception ignored) {
        }
    }

    private static void releaseLocks() {
        try {
            if (cpu != null && cpu.isHeld()) cpu.release();
        } catch (Exception ignored) {
        }
        try {
            if (wifi != null && wifi.isHeld()) wifi.release();
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        releaseLocks();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

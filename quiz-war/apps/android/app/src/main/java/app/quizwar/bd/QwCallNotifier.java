package app.quizwar.bd;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Incoming audio call, WhatsApp style: a ringing notification that pops up over other apps,
 * fills the lock screen, and has Answer / Decline buttons. Keeps ringing (with the QUIZ WAR
 * ringtone) until answered, declined or 35 s pass.
 */
public final class QwCallNotifier {
    /** New channel id: a channel's sound can't change after it is created. */
    static final String CHANNEL = "quizwar_ring_v1";
    private static final String TAG = "qw_call";
    private static final int ID = 7077;
    /** The app is on screen: the in-app call screen rings instead. */
    static volatile boolean appVisible = false;

    private QwCallNotifier() {}

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Rings when a player calls you");
        Uri sound = Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.qw_ringtone);
        ch.setSound(sound, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 700, 500, 700, 500});
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(false);
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent open(Context ctx, String action, String callId, String url, int req) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("qw_call_action", action);
        i.putExtra("qw_call_id", callId);
        i.putExtra("qw_call_url", url);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static final String PREFS = "qw_call";

    /** Server address (saved by the web app), used for "Decline" without opening the app. */
    static void setApiBase(Context ctx, String base) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("api", base).apply();
    }

    static Bitmap loadAvatarPublic(String url) {
        return loadAvatar(url);
    }

    /** Tell the server "declined" (signed link from the ring push); runs off the main thread. */
    static void declineInBackground(Context ctx, String callId, String token) {
        declineInBackground(ctx, callId, token, null);
    }

    static void declineInBackground(Context ctx, String callId, String token, Runnable done) {
        final String base = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("api", null);
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                if (base != null && callId != null && token != null) {
                    c = (HttpURLConnection) new URL(base + "/api/v1/calls/" + Uri.encode(callId) + "/decline?t=" + Uri.encode(token)).openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(6000);
                    c.setReadTimeout(6000);
                    c.setDoOutput(true);
                    c.setRequestProperty("content-type", "application/json");
                    c.getOutputStream().write("{}".getBytes());
                    c.getResponseCode();
                }
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
                if (done != null) done.run();
            }
        }).start();
    }

    static void showIncoming(Context ctx, String callId, String name, String avatarUrl, String url, String declineToken, boolean en) {
        showIncoming(ctx, callId, name, avatarUrl, url, declineToken, en, false);
    }

    static void showIncoming(Context ctx, String callId, String name, String avatarUrl, String url, String declineToken, boolean en, boolean video) {
        try {
            ensureChannel(ctx);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Bitmap avatar = loadAvatar(avatarUrl);
            Person.Builder pb = new Person.Builder().setName(name).setImportant(true);
            if (avatar != null) pb.setIcon(IconCompat.createWithBitmap(avatar));
            Person caller = pb.build();

            PendingIntent tap = open(ctx, "open", callId, url, 1);
            PendingIntent answer = open(ctx, "answer", callId, url, 2);
            // Lock screen / screen off: our own small call screen (the app does not start).
            Intent fi = new Intent(ctx, IncomingCallActivity.class);
            fi.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
            fi.putExtra("qw_call_id", callId);
            fi.putExtra("qw_call_url", url);
            fi.putExtra("qw_call_name", name);
            fi.putExtra("qw_call_avatar", avatarUrl);
            fi.putExtra("qw_call_decline", declineToken);
            fi.putExtra("qw_call_en", en);
            fi.putExtra("qw_call_video", video);
            PendingIntent full = PendingIntent.getActivity(ctx, 4, fi, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            // Decline: handled in the background, no app.
            Intent di = new Intent(ctx, QwCallActionReceiver.class);
            di.putExtra("qw_call_id", callId);
            di.putExtra("qw_call_decline", declineToken);
            PendingIntent decline = PendingIntent.getBroadcast(ctx, 3, di, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_notify)
                    .setContentTitle(name)
                    .setContentText(video ? (en ? "QUIZ WAR video call" : "QUIZ WAR ভিডিও কল") : (en ? "QUIZ WAR audio call" : "QUIZ WAR অডিও কল"))
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(35_000)
                    .setContentIntent(tap)
                    .setFullScreenIntent(full, true)
                    .setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.qw_ringtone), android.media.AudioManager.STREAM_RING)
                    .setVibrate(new long[]{0, 700, 500, 700, 500});
            if (avatar != null) b.setLargeIcon(avatar);
            try {
                b.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer));
            } catch (Exception e) {
                b.addAction(0, en ? "Decline" : "কেটে দিন", decline).addAction(0, en ? "Answer" : "ধরুন", answer);
            }
            Notification n = b.build();
            n.flags |= Notification.FLAG_INSISTENT; // keep ringing until answered
            nm.notify(TAG, ID, n);
        } catch (Exception ignored) {
            // Never crash on a notification.
        }
    }

    static void cancel(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(TAG, ID);
        } catch (Exception ignored) {
        }
        IncomingCallActivity.closeIfOpen();
    }

    /** Small round avatar (3 s max; the call rings without it if slow). */
    private static Bitmap loadAvatar(String url) {
        if (url == null || !url.startsWith("https://")) return null;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(3000);
            c.setReadTimeout(3000);
            try (InputStream in = c.getInputStream()) {
                Bitmap src = BitmapFactory.decodeStream(in);
                if (src == null) return null;
                int s = Math.min(src.getWidth(), src.getHeight());
                Bitmap out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
                Canvas cv = new Canvas(out);
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                cv.drawCircle(s / 2f, s / 2f, s / 2f, p);
                p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
                int x = (src.getWidth() - s) / 2, y = (src.getHeight() - s) / 2;
                cv.drawBitmap(src, new Rect(x, y, x + s, y + s), new Rect(0, 0, s, s), p);
                return out;
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}

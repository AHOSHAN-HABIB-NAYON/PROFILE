package com.cakricircular.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** নোটিফিকেশন: সাইটের লোগো, পোস্টের বড় ছবি — প্রতিটা আলাদা করে ভেসে ওঠে */
final class Notif {

    private Notif() { }

    static final String CH_JOBS = "jobs";
    static final int GREEN = 0xFF0E6E34;

    static String sub(String kind) {
        return "notice".equals(kind) ? "নোটিশ" : "custom".equals(kind) ? "বার্তা" : "নতুন চাকরি";
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, int id, String sub, String title, String body, String url, Bitmap image) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        channel(c);
        if (url == null || url.isEmpty()) url = MainActivity.HOME;

        Notification.Builder b = base(c)
                .setContentTitle(title)
                .setContentText(body)
                .setSubText(sub)
                .setContentIntent(open(c, id, url));
        if (image != null) {
            b.setLargeIcon(square(image))
             .setStyle(new Notification.BigPictureStyle().bigPicture(image)
                     .bigLargeIcon((Bitmap) null).setSummaryText(body));
        } else {
            b.setLargeIcon(logo(c)).setStyle(new Notification.BigTextStyle().bigText(body));
        }
        post(nm, id, b);
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder base(Context c) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CH_JOBS) : new Notification.Builder(c);
        return b.setSmallIcon(R.drawable.ic_stat)
                .setColor(GREEN)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setPriority(Notification.PRIORITY_HIGH)
                .setDefaults(Notification.DEFAULT_ALL);
    }

    private static void post(NotificationManager nm, int id, Notification.Builder b) {
        try { nm.notify(id, b.build()); } catch (SecurityException ignored) { /* অনুমতি নেই */ }
    }

    private static PendingIntent open(Context c, int id, String url) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse(url))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** অ্যাপ চালু হলেই চ্যানেল তৈরি — Firebase নিজে নোটিফিকেশন দেখালেও এই চ্যানেলেই (শব্দ, ভেসে ওঠা) */
    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CH_JOBS) != null) return;
        NotificationChannel ch = new NotificationChannel(CH_JOBS, "নতুন চাকরির খবর", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("নতুন সার্কুলার, নোটিশ ও বার্তা এলে জানাবে");
        nm.createNotificationChannel(ch);
    }

    // ------------------------------------------------------------------ ছবি

    private static Bitmap logo;

    static Bitmap logo(Context c) {
        if (logo == null) {
            Bitmap b = BitmapFactory.decodeResource(c.getResources(), R.drawable.splash_logo);
            if (b != null) logo = Bitmap.createScaledBitmap(b, 192, 192, true);
        }
        return logo;
    }

    private static Bitmap square(Bitmap b) {
        int s = Math.min(b.getWidth(), b.getHeight());
        Bitmap sq = Bitmap.createBitmap(b, (b.getWidth() - s) / 2, (b.getHeight() - s) / 2, s, s);
        return Bitmap.createScaledBitmap(sq, 192, 192, true);
    }

    /** পোস্টের ছবি নামানো — ১.৫ MB-এর বেশি নয়, ৯০০px-এ ছোট করে */
    static Bitmap fetch(String url) {
        if (url == null || url.isEmpty()) return null;
        if (url.startsWith("/")) url = "https://" + MainActivity.HOST + url;
        if (!url.startsWith("https://")) return null;
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(8000);
            h.setReadTimeout(12000);
            h.setRequestProperty("User-Agent", MainActivity.UA);
            if (h.getResponseCode() != 200) return null;
            InputStream in = h.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] x = new byte[8192];
            for (int n; (n = in.read(x)) > 0; ) {
                buf.write(x, 0, n);
                if (buf.size() > 1500000) { in.close(); return null; }
            }
            in.close();
            byte[] data = buf.toByteArray();
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, o);
            if (o.outWidth <= 0) return null;
            int s = 1;
            while (o.outWidth / (s * 2) >= 900) s *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = s;
            return BitmapFactory.decodeByteArray(data, 0, data.length, o);
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    static String bn(long n) {
        char[] d = String.valueOf(n).toCharArray();
        for (int i = 0; i < d.length; i++) if (d[i] >= '0' && d[i] <= '9') d[i] = (char) ('০' + (d[i] - '0'));
        return new String(d);
    }
}

package com.cakricircular.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * বিকল্প পথ — শুধু যে ফোনে Google Play services নেই (বা Firebase চালু হয়নি):
 * ১৫ মিনিট পরপর সাইটের /api/app-feed দেখে নতুন খবর দেখায়। Firebase কাজ করলে এটা বন্ধ থাকে।
 */
public class FeedJob extends JobService {

    static final int ID = 1001;

    @Override
    public boolean onStartJob(final JobParameters p) {
        new Thread(new Runnable() {
            public void run() {
                poll(getApplicationContext());
                jobFinished(p, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters p) { return true; }

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == ID) return;
        js.schedule(new JobInfo.Builder(ID, new ComponentName(c, FeedJob.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    static void cancel(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(ID);
    }

    static void poll(Context c) {
        SharedPreferences sp = c.getSharedPreferences("cc", Context.MODE_PRIVATE);
        int after = sp.getInt("after", 0);
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL("https://" + MainActivity.HOST + "/api/app-feed?after=" + after).openConnection();
            h.setConnectTimeout(15000);
            h.setReadTimeout(15000);
            h.setUseCaches(false);
            h.setRequestProperty("User-Agent", MainActivity.UA);
            if (h.getResponseCode() != 200) return;
            InputStream in = h.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
            in.close();

            JSONObject o = new JSONObject(buf.toString("UTF-8"));
            int last = o.optInt("last", after);
            JSONArray items = o.optJSONArray("items");
            synchronized (FcmService.class) {
                if (sp.getInt("after", 0) != after) return;          // এর মধ্যে Firebase দেখিয়ে দিয়েছে
                sp.edit().putInt("after", last).apply();
            }
            if (after <= 0 || items == null) return;                 // প্রথমবার: পুরনো খবর নয়
            for (int i = Math.max(0, items.length() - 3); i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                String body = it.optString("body", "");
                Notif.show(c, 100 + it.optInt("id", i), Notif.sub(it.optString("kind", "post")),
                        it.optString("title", "নতুন চাকরির খবর"), body.isEmpty() ? "বিস্তারিত দেখতে চাপুন" : body,
                        it.optString("url", ""), Notif.fetch(it.optString("image", "")));
            }
        } catch (Exception ignored) {
        } finally {
            if (h != null) h.disconnect();
        }
    }
}

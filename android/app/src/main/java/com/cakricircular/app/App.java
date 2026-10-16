package com.cakricircular.app;

import android.app.Application;
import android.content.Context;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

import org.json.JSONObject;

/**
 * অ্যাপ চালু হলেই Firebase প্রস্তুত — অ্যাপ বন্ধ থাকা অবস্থায় নোটিফিকেশন এলেও যেন কাজ করে।
 * Firebase-এর তথ্য অ্যাপের ভেতরে লেখা নেই; সাইট থেকে আসে (/api/app-config) আর ফোনে জমা থাকে।
 * তাই এডমিন থেকে Firebase বদলালেও নতুন অ্যাপ বানাতে হয় না।
 */
public class App extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        Notif.channel(this);
        initFirebase(this);
    }

    /** জমা থাকা তথ্য দিয়ে Firebase চালু। ফেরত: চালু হলো কিনা */
    static synchronized boolean initFirebase(Context c) {
        try {
            if (!FirebaseApp.getApps(c).isEmpty()) return true;
            String raw = c.getSharedPreferences("cc", MODE_PRIVATE).getString("fcm", "");
            if (raw.isEmpty()) return false;
            JSONObject f = new JSONObject(raw);
            FirebaseApp.initializeApp(c, new FirebaseOptions.Builder()
                    .setApiKey(f.getString("apiKey"))
                    .setApplicationId(f.getString("appId"))
                    .setProjectId(f.getString("projectId"))
                    .setGcmSenderId(f.optString("senderId", ""))
                    .build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}

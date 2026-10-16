package com.cakricircular.app;

import android.content.SharedPreferences;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Firebase থেকে আসা খবর — অ্যাপ খোলা, পেছনে বা বন্ধ, সব অবস্থায় */
public class FcmService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(RemoteMessage m) {
        Map<String, String> d = m.getData();
        String title = d.get("title");
        if (title == null || title.isEmpty()) return;
        int id = 0;
        try { id = Integer.parseInt(d.get("id")); } catch (Exception ignored) { }

        // একই খবর দুবার নয় (বিকল্প চেকও একই হিসাব রাখে)
        SharedPreferences sp = getSharedPreferences("cc", MODE_PRIVATE);
        if (id > 0) {
            synchronized (FcmService.class) {
                if (id <= sp.getInt("after", 0)) return;
                sp.edit().putInt("after", id).apply();
            }
        }
        String kind = d.get("kind") == null ? "post" : d.get("kind");
        String body = d.get("body") == null ? "" : d.get("body");
        Notif.show(this, id > 0 ? 100 + id : (int) (System.currentTimeMillis() / 1000),
                Notif.sub(kind), title, body.isEmpty() ? "বিস্তারিত দেখতে চাপুন" : body,
                d.get("url"), Notif.fetch(d.get("image")));
    }

    @Override
    public void onNewToken(String token) {
        // টপিকে আবার যুক্ত হওয়া (টোকেন বদলালে)
        MainActivity.subscribe(getApplicationContext());
    }
}

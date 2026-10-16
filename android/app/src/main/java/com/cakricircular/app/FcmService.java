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

        // একই খবর দুবার নয় — শেষ ৬০টার তালিকা দেখে (পরপর কয়েকটা আগে-পরে এলেও কোনোটা বাদ পড়ে না)
        SharedPreferences sp = getSharedPreferences("cc", MODE_PRIVATE);
        if (id > 0) {
            synchronized (FcmService.class) {
                String seen = sp.getString("seen", ",");
                if (seen.contains("," + id + ",")) return;
                seen = seen + id + ",";
                if (seen.length() > 600) seen = "," + seen.substring(seen.indexOf(',', seen.length() - 500) + 1);
                sp.edit().putString("seen", seen).putInt("after", Math.max(id, sp.getInt("after", 0))).apply();
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

package app.quizwar.bd;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Push messages: incoming calls ring natively (even when the app is closed or the phone is
 * locked); everything else goes to the normal push handling.
 */
public class QwMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        String type = d.get("type");
        if ("call".equals(type)) {
            // On screen already: the in-app call screen rings.
            if (!QwCallNotifier.appVisible) {
                QwCallNotifier.showIncoming(this, d.get("callId"), d.containsKey("name") ? d.get("name") : "QUIZ WAR", d.get("avatar"), d.containsKey("url") ? d.get("url") : "/");
            }
            return;
        }
        if ("call_end".equals(type)) {
            QwCallNotifier.cancel(this);
            return;
        }
        super.onMessageReceived(msg);
    }
}

package app.quizwar.bd;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** "Decline" on the ringing notification (and "Hang up" on the ongoing call): stop ringing and tell the server, without opening the app. */
public class QwCallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent.getBooleanExtra("qw_hangup", false)) {
            // Hang up from the ongoing-call notification: the app (running in the background) ends the call.
            // The app (running in the background) ends the call; the notification goes away at once.
            QwCallPlugin.hangUp();
            ctx.stopService(new Intent(ctx, QwCallService.class));
            return;
        }
        QwCallNotifier.cancel(ctx);
        IncomingCallActivity.closeIfOpen();
        final PendingResult pr = goAsync();
        QwCallNotifier.declineInBackground(ctx, intent.getStringExtra("qw_call_id"), intent.getStringExtra("qw_call_decline"), pr::finish);
    }
}

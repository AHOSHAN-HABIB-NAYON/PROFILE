package app.quizwar.bd;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** "Decline" on the ringing notification: stop ringing and tell the server, without opening the app. */
public class QwCallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        QwCallNotifier.cancel(ctx);
        IncomingCallActivity.closeIfOpen();
        final PendingResult pr = goAsync();
        QwCallNotifier.declineInBackground(ctx, intent.getStringExtra("qw_call_id"), intent.getStringExtra("qw_call_decline"), pr::finish);
    }
}

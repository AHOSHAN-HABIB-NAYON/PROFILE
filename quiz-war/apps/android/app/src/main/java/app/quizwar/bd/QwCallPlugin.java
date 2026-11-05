package app.quizwar.bd;

import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

import androidx.core.content.ContextCompat;

import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Audio calls: keep the call alive in the background (foreground service) and turn the screen
 * off when the phone is held to the ear (proximity sensor), like a normal phone call.
 */
@CapacitorPlugin(name = "QwCall")
public class QwCallPlugin extends Plugin {
    private PowerManager.WakeLock ear;
    /** Answer / Decline / open tapped on the ringing notification, waiting for the web app. */
    static volatile String pendingAction = null;
    static volatile String pendingCallId = null;

    /** The web app asks what the user tapped on the call notification (once). */
    @PluginMethod
    public void pending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("action", pendingAction);
        r.put("callId", pendingCallId);
        pendingAction = null;
        pendingCallId = null;
        call.resolve(r);
    }

    /** Stop the native ringing notification (answered or ended in the app). */
    @PluginMethod
    public void cancelIncoming(PluginCall call) {
        QwCallNotifier.cancel(getContext());
        call.resolve();
    }

    /** Show the app over the lock screen while a call rings / goes on; off again afterwards. */
    @PluginMethod
    public void showOnLock(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> MainActivity.setOverLock(getActivity(), on));
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), QwCallService.class);
            i.putExtra("title", call.getString("title", "QUIZ WAR"));
            i.putExtra("text", call.getString("text", "Call in progress"));
            ContextCompat.startForegroundService(getContext(), i);
        } catch (Exception ignored) {
            // The call still works while the app is open.
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), QwCallService.class));
        } catch (Exception ignored) {
        }
        setEar(false);
        call.resolve();
    }

    /** Screen off near the ear: only while the call is on the earpiece. */
    @PluginMethod
    public void proximity(PluginCall call) {
        setEar(Boolean.TRUE.equals(call.getBoolean("on", false)));
        call.resolve();
    }

    private void setEar(boolean on) {
        try {
            if (on) {
                if (ear == null) {
                    PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                    if (pm == null || !pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return;
                    ear = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "quizwar:call");
                    ear.setReferenceCounted(false);
                }
                if (!ear.isHeld()) ear.acquire(2 * 60 * 60 * 1000L);
            } else if (ear != null && ear.isHeld()) {
                ear.release();
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void handleOnDestroy() {
        setEar(false);
    }
}

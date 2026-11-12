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
    private static volatile QwCallPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** "Hang up" tapped on the ongoing-call notification. False when the app isn't running. */
    static boolean hangUp() {
        QwCallPlugin p = instance;
        if (p == null || p.bridge == null) return false;
        try {
            p.bridge.triggerWindowJSEvent("qwcallhangup");
            return true;
        } catch (Exception e) {
            return false;
        }
    }
    /** Answer / Decline / open tapped on the ringing notification, waiting for the web app. */
    static volatile String pendingAction = null;
    static volatile String pendingCallId = null;
    static volatile String pendingUrl = null;
    static volatile long pendingAt = 0;

    /**
     * The web app asks what the user tapped on the call notification. Kept (for up to a minute)
     * until the web app says it handled it: the page can load twice while the app starts from a
     * call, and the second load must still know "Answer" was tapped (no second answer needed).
     */
    @PluginMethod
    public void pending(PluginCall call) {
        if (pendingAction != null && System.currentTimeMillis() - pendingAt > 60_000) clear();
        JSObject r = new JSObject();
        r.put("action", pendingAction);
        r.put("callId", pendingCallId);
        r.put("url", pendingUrl);
        call.resolve(r);
    }

    private static void clear() {
        pendingUrl = null;
        pendingAction = null;
        pendingCallId = null;
    }

    /** The web app handled the tapped action. */
    @PluginMethod
    public void clearPending(PluginCall call) {
        clear();
        call.resolve();
    }

    /** The web app tells the phone the server address (for Decline from the lock screen). */
    @PluginMethod
    public void setApi(PluginCall call) {
        String base = call.getString("base");
        if (base != null && base.startsWith("https://")) QwCallNotifier.setApiBase(getContext(), base);
        call.resolve();
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
            i.putExtra("live", Boolean.TRUE.equals(call.getBoolean("live", true)));
            i.putExtra("avatar", call.getString("avatar"));
            i.putExtra("hang", call.getString("hang", "Hang up"));
            // Already showing (Calling… → Ringing… → Ongoing): just change the text.
            if (QwCallService.running) QwCallService.update(getContext(), i);
            else {
                // Show the text at once (plain fallback in the list), then try the call service.
                if (QwCallService.plainShown) QwCallService.update(getContext(), i);
                ContextCompat.startForegroundService(getContext(), i);
            }
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
        QwCallService.clearPlain(getContext());
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

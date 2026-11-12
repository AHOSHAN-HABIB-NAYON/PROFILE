package app.quizwar.bd;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.view.WindowManager;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;

import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(QwAppInfoPlugin.class);
        registerPlugin(QwGalleryPlugin.class);
        registerPlugin(QwPasskeyPlugin.class);
        registerPlugin(QwBarsPlugin.class);
        registerPlugin(QwAudioPlugin.class);
        registerPlugin(QwCallPlugin.class);
        registerPlugin(QwBillingPlugin.class);
        super.onCreate(savedInstanceState);
        // Edge-to-edge on every Android version (required look on 15+): the bars are drawn over
        // the app, and the web view's container is padded by their size so nothing hides under them.
        // Must run after super.onCreate: earlier, the window is built with the splash theme and
        // shows a title bar.
        EdgeToEdge.enable(this);
        if (bridge == null || bridge.getWebView() == null) return;
        if (bridge.getWebView().getParent() instanceof View) {
            View host = (View) bridge.getWebView().getParent();
            host.setBackgroundColor(Color.parseColor("#172554"));
            ViewCompat.setOnApplyWindowInsetsListener(host, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(host);
        }
        WebSettings settings = bridge.getWebView().getSettings();
        enableWebViewPasskeys(settings);
        // App screens never zoom (no pinch or double-tap zoom).
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Game UI uses fixed type sizes; cap extreme OS font scaling so layouts don't break.
        if (settings.getTextZoom() > 130) settings.setTextZoom(130);
        handleCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        QwCallNotifier.appVisible = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        QwCallNotifier.appVisible = false;
        keepAwakeForCall();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepAwakeForCall();
    }

    /**
     * During a call the voice lives in the web view. When the app leaves the screen, Android
     * marks the web view hidden and it stops playing / sending sound. While a call is running,
     * tell the web view it is still on screen (and keep its timers running) so the call goes on
     * from the background, like a phone call. Without a call nothing changes (normal sleep).
     */
    private void keepAwakeForCall() {
        if (!QwCallPlugin.callActive || bridge == null) return;
        final android.webkit.WebView wv = bridge.getWebView();
        if (wv == null) return;
        final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        // Android sends "hidden" right after pause/stop: answer it a moment later, twice to be safe.
        for (long delay : new long[] {300, 1200}) {
            h.postDelayed(() -> {
                try {
                    if (!QwCallPlugin.callActive) return;
                    wv.onResume();
                    wv.resumeTimers();
                    wv.dispatchWindowVisibilityChanged(View.VISIBLE);
                } catch (Exception ignored) {
                }
            }, delay);
        }
    }

    /** Tapped Answer / Decline / the ringing call: open over the lock screen and tell the web app. */
    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("qw_call_action");
        if (action == null) return;
        QwCallPlugin.pendingAction = action;
        QwCallPlugin.pendingCallId = intent.getStringExtra("qw_call_id");
        QwCallPlugin.pendingUrl = intent.getStringExtra("qw_call_url");
        QwCallPlugin.pendingAt = System.currentTimeMillis();
        intent.removeExtra("qw_call_action");
        if (!"open".equals(action)) QwCallNotifier.cancel(this);
        // "Message" needs the phone unlocked (like WhatsApp); the call itself shows over the lock screen.
        if (!"message".equals(action)) setOverLock(this, true);
        try {
            if (bridge != null) bridge.triggerWindowJSEvent("qwcallaction");
        } catch (Exception ignored) {
        }
    }

    static void setOverLock(Activity a, boolean on) {
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                a.setShowWhenLocked(on);
                a.setTurnScreenOn(on);
            } else if (on) {
                a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            } else {
                a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Passkeys: lets navigator.credentials (WebAuthn) inside the WebView use Android
     * Credential Manager, with the app as the relying-party client (needs the
     * "get_login_creds" relation in https://<rp-id>/.well-known/assetlinks.json).
     *
     * Called reflectively so the app still builds and runs on androidx.webkit / WebView
     * versions without WebAuthn support — the web UI then hides "Continue with Passkey".
     */
    private static void enableWebViewPasskeys(WebSettings settings) {
        try {
            Class<?> feature = Class.forName("androidx.webkit.WebViewFeature");
            String name = (String) feature.getField("WEB_AUTHENTICATION").get(null);
            boolean supported = (Boolean) feature.getMethod("isFeatureSupported", String.class).invoke(null, name);
            if (!supported) return;
            Class<?> compat = Class.forName("androidx.webkit.WebSettingsCompat");
            int forApp = compat.getField("WEB_AUTHENTICATION_SUPPORT_FOR_APP").getInt(null);
            compat.getMethod("setWebAuthenticationSupport", WebSettings.class, int.class).invoke(null, settings, forApp);
        } catch (Throwable ignored) {
            // Not available on this device/library version.
        }
    }
}

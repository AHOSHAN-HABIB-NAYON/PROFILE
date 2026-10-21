package app.quizwar.bd;

import android.graphics.Color;
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

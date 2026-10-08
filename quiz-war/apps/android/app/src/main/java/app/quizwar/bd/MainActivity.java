package app.quizwar.bd;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null || bridge.getWebView() == null) return;
        WebSettings settings = bridge.getWebView().getSettings();
        enableWebViewPasskeys(settings);
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

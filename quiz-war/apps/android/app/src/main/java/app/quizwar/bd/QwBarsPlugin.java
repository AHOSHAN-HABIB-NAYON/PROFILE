package app.quizwar.bd;

import android.graphics.Color;
import android.view.View;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * System bar colours for edge-to-edge (Android 15+): the bars are transparent, so the colour the
 * user sees is the background of the web view's container (padded by the bar insets in MainActivity).
 * Replaces @capacitor/status-bar, which relies on the deprecated Window.setStatusBarColor.
 */
@CapacitorPlugin(name = "QwBars")
public class QwBarsPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final String color = call.getString("color", "#172554");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        getActivity().runOnUiThread(() -> {
            try {
                WebView web = getBridge().getWebView();
                if (web != null && web.getParent() instanceof View) ((View) web.getParent()).setBackgroundColor(Color.parseColor(color));
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
                // "dark" = dark background, so the bar icons must be light.
                c.setAppearanceLightStatusBars(!dark);
                c.setAppearanceLightNavigationBars(!dark);
            } catch (Exception ignored) {
                // Bad colour string or no window: leave the bars as they are.
            }
            call.resolve();
        });
    }
}

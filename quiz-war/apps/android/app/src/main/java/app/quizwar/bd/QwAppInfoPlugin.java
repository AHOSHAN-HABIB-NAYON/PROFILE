package app.quizwar.bd;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Build facts the web layer needs, e.g. whether Firebase (google-services.json) was bundled. */
@CapacitorPlugin(name = "QwAppInfo")
public class QwAppInfoPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        JSObject ret = new JSObject();
        // Registering for push without Firebase config crashes the app, so the JS side checks this first.
        ret.put("pushEnabled", BuildConfig.PUSH_ENABLED);
        ret.put("versionCode", BuildConfig.VERSION_CODE);
        ret.put("versionName", BuildConfig.VERSION_NAME);
        call.resolve(ret);
    }
}

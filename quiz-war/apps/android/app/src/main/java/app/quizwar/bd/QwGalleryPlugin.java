package app.quizwar.bd;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Saves a PNG (e.g. the result card) to Pictures/QUIZ WAR through MediaStore.
 * Android 10+ lets an app add its own images to the shared gallery without any storage
 * permission, so the app never asks for photo/storage access. Older versions reject and the
 * web layer falls back to the share sheet.
 */
@CapacitorPlugin(name = "QwGallery")
public class QwGalleryPlugin extends Plugin {
    @PluginMethod
    public void saveImage(PluginCall call) {
        String data = call.getString("base64");
        String name = call.getString("fileName", "quizwar-" + System.currentTimeMillis() + ".png");
        if (data == null || data.isEmpty()) {
            call.reject("No image data");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("UNSUPPORTED");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/QUIZ WAR");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
            if (uri == null) throw new IllegalStateException("MediaStore insert failed");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("Cannot open output");
                out.write(bytes);
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            if (uri != null) resolver.delete(uri, null, null);
            call.reject("Could not save image", e);
        }
    }
}

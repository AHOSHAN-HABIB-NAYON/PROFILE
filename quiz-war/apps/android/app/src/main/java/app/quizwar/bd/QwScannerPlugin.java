package app.quizwar.bd;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/**
 * QR scanning for "Join room" through Google's code scanner. The camera UI runs inside Google
 * Play services, so the app itself needs no CAMERA permission.
 */
@CapacitorPlugin(name = "QwScanner")
public class QwScannerPlugin extends Plugin {
    @PluginMethod
    public void scan(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
        scanner
            .startScan()
            .addOnSuccessListener(barcode -> {
                JSObject ret = new JSObject();
                ret.put("value", barcode.getRawValue());
                call.resolve(ret);
            })
            .addOnCanceledListener(() -> call.reject("Scan cancelled", "cancelled"))
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), "failed"));
    }
}

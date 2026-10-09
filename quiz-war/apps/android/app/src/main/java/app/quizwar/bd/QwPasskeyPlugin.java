package app.quizwar.bd;

import android.os.Build;

import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Passkeys through Android Credential Manager. The WebView is served from https://localhost,
 * which can't use the website's relying-party ID, so the web layer hands the server's WebAuthn
 * options JSON to this plugin instead. The app signs as android:apk-key-hash:<hash>, which the
 * server accepts, and the RP ID is proven by /.well-known/assetlinks.json.
 */
@CapacitorPlugin(name = "QwPasskey")
public class QwPasskeyPlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P);
        call.resolve(ret);
    }

    @PluginMethod
    public void create(PluginCall call) {
        String json = call.getString("requestJson");
        if (json == null) {
            call.reject("Missing requestJson", "bad_request");
            return;
        }
        CredentialManager cm = CredentialManager.create(getContext());
        cm.createCredentialAsync(
            getActivity(),
            new CreatePublicKeyCredentialRequest(json),
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override
                public void onResult(CreateCredentialResponse result) {
                    if (result instanceof CreatePublicKeyCredentialResponse) {
                        JSObject ret = new JSObject();
                        ret.put("responseJson", ((CreatePublicKeyCredentialResponse) result).getRegistrationResponseJson());
                        call.resolve(ret);
                    } else {
                        call.reject("Unexpected credential type", "failed");
                    }
                }

                @Override
                public void onError(CreateCredentialException e) {
                    String code = e instanceof CreateCredentialCancellationException ? "cancelled" : "failed";
                    call.reject(String.valueOf(e.getMessage()), code);
                }
            }
        );
    }

    @PluginMethod
    public void get(PluginCall call) {
        String json = call.getString("requestJson");
        if (json == null) {
            call.reject("Missing requestJson", "bad_request");
            return;
        }
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetPublicKeyCredentialOption(json))
            .build();
        CredentialManager cm = CredentialManager.create(getContext());
        cm.getCredentialAsync(
            getActivity(),
            request,
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Credential credential = result.getCredential();
                    if (credential instanceof PublicKeyCredential) {
                        JSObject ret = new JSObject();
                        ret.put("responseJson", ((PublicKeyCredential) credential).getAuthenticationResponseJson());
                        call.resolve(ret);
                    } else {
                        call.reject("Unexpected credential type", "failed");
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    String code = e instanceof GetCredentialCancellationException
                        ? "cancelled"
                        : e instanceof NoCredentialException ? "no_credential" : "failed";
                    call.reject(String.valueOf(e.getMessage()), code);
                }
            }
        );
    }
}

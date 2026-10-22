package com.oryzenx.app.push

import android.content.Context
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.oryzenx.app.BuildConfig
import com.oryzenx.app.OryzenApp
import com.oryzenx.app.data.Api
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Registers this device's FCM token with the OryzenX server. Push is optional: when the build has no
 * google-services.json (FIREBASE_CONFIGURED = false) every call here is a no-op and the app relies on
 * in-app and email notifications.
 */
object PushRegistrar {
    private fun available(context: Context): Boolean =
        BuildConfig.FIREBASE_CONFIGURED && runCatching { FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null }.getOrDefault(false)

    fun register(context: Context) {
        if (!available(context)) return
        val app = OryzenApp.instance
        if (app.session.token == null) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (!token.isNullOrBlank()) MainScope().launch { send(token) }
        }
    }

    /** Called from the messaging service when FCM rotates the token. */
    suspend fun send(token: String) {
        val app = OryzenApp.instance
        if (app.session.token == null) return
        runCatching {
            app.api.post("/api/push-tokens", Api.body("token" to token, "platform" to "android", "device_name" to (Build.MANUFACTURER + " " + Build.MODEL).trim()))
            app.session.pushToken = token
        }
    }

    /** Removes the token from the server before sign-out so this device stops receiving account pushes. */
    suspend fun unregister() {
        val app = OryzenApp.instance
        val token = app.session.pushToken ?: return
        runCatching { app.api.post("/api/push-tokens/remove", Api.body("token" to token)) }
        app.session.pushToken = null
        if (available(app)) {
            suspendCancellableCoroutine { c -> FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { c.resume(Unit) } }
        }
    }
}

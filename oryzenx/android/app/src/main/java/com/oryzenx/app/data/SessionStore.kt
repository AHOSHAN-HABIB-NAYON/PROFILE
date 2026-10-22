package com.oryzenx.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Session token is kept in EncryptedSharedPreferences (Android Keystore-backed key).
 * Non-sensitive display preferences (theme, language) are kept in normal preferences.
 * Nothing here is included in backups (see data_extraction_rules.xml).
 */
class SessionStore(context: Context) {
    private val secure: SharedPreferences = try {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, "oryx_secure", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        // Keystore corruption (rare): start with a clean store; the user signs in again.
        context.deleteSharedPreferences("oryx_secure")
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, "oryx_secure", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
    private val prefs: SharedPreferences = context.getSharedPreferences("oryx_prefs", Context.MODE_PRIVATE)

    var token: String?
        get() = secure.getString("token", null)
        set(v) { secure.edit().apply { if (v == null) remove("token") else putString("token", v) }.apply() }

    var pushToken: String?
        get() = secure.getString("push_token", null)
        set(v) { secure.edit().apply { if (v == null) remove("push_token") else putString("push_token", v) }.apply() }

    /** "light" (default) | "dark" | "system" */
    var theme: String
        get() = prefs.getString("theme", "light") ?: "light"
        set(v) { prefs.edit().putString("theme", v).apply() }

    var locale: String
        get() = prefs.getString("locale", "en") ?: "en"
        set(v) { prefs.edit().putString("locale", v).apply() }

    var timezone: String
        get() = prefs.getString("timezone", "Asia/Dhaka") ?: "Asia/Dhaka"
        set(v) { prefs.edit().putString("timezone", v).apply() }

    fun clear() {
        token = null
    }
}

package com.appfix.studio.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.appfix.core.util.B64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores small secrets (GitHub token, optional keystore passwords) encrypted with an AES-GCM key
 * that lives in the Android Keystore and never leaves it. Values are never logged.
 */
class SecretStore(context: Context) {
    private val prefs = context.getSharedPreferences("appfix_secrets", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    fun put(name: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray())
        prefs.edit().putString(name, B64.encode(cipher.iv) + ":" + B64.encode(encrypted)).apply()
    }

    fun get(name: String): String? {
        val stored = prefs.getString(name, null) ?: return null
        return try {
            val (iv, data) = stored.split(':', limit = 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, B64.decode(iv)))
            cipher.doFinal(B64.decode(data)).decodeToString()
        } catch (e: Exception) {
            // Key invalidated (e.g. device restore): the secret can no longer be read.
            remove(name)
            null
        }
    }

    fun has(name: String) = prefs.contains(name)

    fun remove(name: String) = prefs.edit().remove(name).apply()

    companion object {
        private const val ALIAS = "appfix_secret_key"
        const val GITHUB_TOKEN = "github_token"
        /** API key for a direct AI provider, or the optional token for the user's own AI proxy. */
        const val AI_KEY = "ai_key"
        fun keystorePassword(file: String) = "keystore_password:$file"
    }
}

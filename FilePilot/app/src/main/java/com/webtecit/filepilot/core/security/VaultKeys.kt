package com.webtecit.filepilot.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Key handling for the Secure Folder. Each file has its own random data key, which is wrapped
 * (encrypted) by a non-exportable AES key in the Android Keystore. No key is ever stored in plain
 * text. The PIN is stored only as a salted PBKDF2 hash.
 */
object VaultKeys {
    private const val ALIAS = "filepilot_vault_master"
    private const val PREFS = "vault_security"

    private fun masterKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun wrap(dataKey: SecretKey): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, masterKey())
        return cipher.iv + cipher.doFinal(dataKey.encoded)
    }

    fun unwrap(wrapped: ByteArray): SecretKey {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, masterKey(), GCMParameterSpec(128, wrapped, 0, 12))
        return SecretKeySpec(cipher.doFinal(wrapped, 12, wrapped.size - 12), "AES")
    }

    fun hasPin(context: Context): Boolean = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains("pin_hash")

    fun setPin(context: Context, pin: String) {
        val salt = ByteArray(16).also(SecureRandom()::nextBytes)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("pin_salt", android.util.Base64.encodeToString(salt, android.util.Base64.NO_WRAP))
            .putString("pin_hash", android.util.Base64.encodeToString(PinHash.hash(pin, salt), android.util.Base64.NO_WRAP))
            .apply()
    }

    fun checkPin(context: Context, pin: String): Boolean {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val salt = p.getString("pin_salt", null) ?: return false
        val hash = p.getString("pin_hash", null) ?: return false
        return PinHash.verify(pin, android.util.Base64.decode(salt, 0), android.util.Base64.decode(hash, 0))
    }
}

/** Salted, slow PIN hashing (PBKDF2-HMAC-SHA256) with a constant-time comparison. */
object PinHash {
    private const val ITERATIONS = 120_000

    fun hash(pin: String, salt: ByteArray): ByteArray =
        SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            .generateSecret(PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, 256)).encoded

    fun verify(pin: String, salt: ByteArray, expected: ByteArray): Boolean =
        java.security.MessageDigest.isEqual(hash(pin, salt), expected)
}

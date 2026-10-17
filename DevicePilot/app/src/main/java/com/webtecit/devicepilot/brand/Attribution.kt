package com.webtecit.devicepilot.brand

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.pm.PackageManager
import android.os.Build
import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R
import java.security.MessageDigest

/**
 * Developer attribution. Name and website are kept encoded (not in string resources) and,
 * together with the developer photo, are verified against fixed SHA-256 digests at start-up.
 * If any of them is changed in a modified APK, the app refuses to run.
 *
 * Optional: set the Gradle property `expectedSignerSha256` to the release certificate digest
 * to also reject copies re-signed by someone else (see README).
 */
object Attribution {
    private const val K = 0x5A
    private val N = intArrayOf(23, 30, 116, 122, 27, 18, 21, 9, 18, 27, 20, 122, 18, 27, 24, 19, 24, 122, 20, 27, 3, 21, 20)
    private val W = intArrayOf(50, 46, 46, 42, 41, 96, 117, 117, 45, 63, 56, 46, 63, 57, 51, 46, 116, 57, 53, 55, 117)
    private const val TEXT_DIGEST = "2220b102fd40bce907921802f69d19dd8478d3d208b4919a229f8e8d63a20fab"
    private const val PHOTO_DIGEST = "768503d667bd36aacaf20c29fdf161f3d372e3442fad43274b16289dcb8f7197"

    val developerName: String by lazy { decode(N) }
    val website: String by lazy { decode(W) }
    val websiteLabel: String get() = website.removePrefix("https://").removeSuffix("/")

    private fun decode(a: IntArray) = String(ByteArray(a.size) { (a[it] xor K).toByte() }, Charsets.UTF_8)

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    @Volatile private var cachedPhoto: Bitmap? = null

    fun photo(context: Context): Bitmap? = cachedPhoto ?: runCatching {
        context.resources.openRawResource(R.raw.developer_photo).use { BitmapFactory.decodeStream(it) }
    }.getOrNull()?.also { cachedPhoto = it }

    /** True when the attribution and photo are the originals (and the signer matches, if pinned). */
    fun verify(context: Context): Boolean = runCatching {
        if (sha256("$developerName|$website".toByteArray()) != TEXT_DIGEST) return false
        val photo = context.resources.openRawResource(R.raw.developer_photo).use { it.readBytes() }
        if (sha256(photo) != PHOTO_DIGEST) return false
        val pinned = BuildConfig.EXPECTED_SIGNER_SHA256
        if (!BuildConfig.DEBUG && pinned.isNotBlank() && signerDigest(context)?.equals(pinned, ignoreCase = true) != true) return false
        true
    }.getOrDefault(false)

    @Suppress("DEPRECATION")
    private fun signerDigest(context: Context): String? = runCatching {
        val pm = context.packageManager
        val sig = if (Build.VERSION.SDK_INT >= 28) {
            val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            info.signingInfo?.apkContentsSigners?.firstOrNull()
        } else {
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures?.firstOrNull()
        }
        sig?.let { sha256(it.toByteArray()) }
    }.getOrNull()
}

package com.webtecit.devicepilot.data.install

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.graphics.drawable.toBitmap
import com.webtecit.devicepilot.data.longVersion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

data class ApkDetails(
    val uri: Uri,
    val fileName: String,
    val sizeBytes: Long?,
    val location: String?,
    val packageName: String,
    val label: String,
    val versionName: String?,
    val versionCode: Long,
    val minSdk: Int?,
    val targetSdk: Int?,
    val signerSha256: String?,
    val permissions: List<String>,
    val icon: Bitmap?,
    val installedVersionCode: Long?,
    val installedSignerSha256: String?,
) {
    val isUpdate: Boolean get() = installedVersionCode != null
    val isDowngrade: Boolean get() = installedVersionCode != null && versionCode < installedVersionCode
    val signatureMismatch: Boolean
        get() = installedSignerSha256 != null && signerSha256 != null && installedSignerSha256 != signerSha256
    val incompatibleSdk: Boolean get() = minSdk != null && minSdk > Build.VERSION.SDK_INT
}

sealed interface ApkInspection {
    data class Valid(val details: ApkDetails) : ApkInspection
    data class Invalid(val fileName: String, val reason: InvalidReason) : ApkInspection
}

enum class InvalidReason { UNREADABLE, NOT_AN_APK, SPLIT_OR_BUNDLE }

/**
 * Inspects a user-selected APK. The file is copied to the private cache because
 * PackageManager can only parse archives from a file path; the copy is deleted afterwards.
 */
class ApkInspector(private val context: Context) {

    private val pm = context.packageManager

    suspend fun inspect(uri: Uri): ApkInspection = withContext(Dispatchers.IO) {
        val (name, size) = queryNameAndSize(uri)
        val lower = name.lowercase()
        if (lower.endsWith(".apks") || lower.endsWith(".xapk") || lower.endsWith(".apkm") || lower.endsWith(".aab")) {
            return@withContext ApkInspection.Invalid(name, InvalidReason.SPLIT_OR_BUNDLE)
        }
        val dir = File(context.cacheDir, "apk_inspect").apply { mkdirs() }
        val tmp = File(dir, "inspect_${System.nanoTime()}.apk")
        try {
            val copied = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    tmp.outputStream().use { input.copyTo(it) }
                } != null
            }.getOrDefault(false)
            if (!copied) return@withContext ApkInspection.Invalid(name, InvalidReason.UNREADABLE)

            val info = archiveInfo(tmp.path) ?: return@withContext ApkInspection.Invalid(name, InvalidReason.NOT_AN_APK)
            val ai = info.applicationInfo
            ai?.sourceDir = tmp.path
            ai?.publicSourceDir = tmp.path
            val installed = runCatching { installedInfo(info.packageName) }.getOrNull()
            ApkInspection.Valid(
                ApkDetails(
                    uri = uri,
                    fileName = name,
                    sizeBytes = size ?: tmp.length(),
                    location = describeLocation(uri),
                    packageName = info.packageName,
                    label = ai?.let { runCatching { it.loadLabel(pm).toString() }.getOrNull() } ?: info.packageName,
                    versionName = info.versionName,
                    versionCode = info.longVersion(),
                    minSdk = ai?.minSdkVersion,
                    targetSdk = ai?.targetSdkVersion,
                    signerSha256 = signerDigest(info),
                    permissions = info.requestedPermissions?.toList().orEmpty().sorted(),
                    icon = ai?.let { runCatching { it.loadIcon(pm).toBitmap(128, 128) }.getOrNull() },
                    installedVersionCode = installed?.longVersion(),
                    installedSignerSha256 = installed?.let { signerDigest(it) },
                )
            )
        } finally {
            tmp.delete()
        }
    }

    fun queryNameAndSize(uri: Uri): Pair<String, Long?> {
        var name: String? = null
        var size: Long? = null
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                ?.use { c ->
                    if (c.moveToFirst()) {
                        val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val si = c.getColumnIndex(OpenableColumns.SIZE)
                        if (ni >= 0) name = c.getString(ni)
                        if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
                    }
                }
        }
        return (name ?: uri.lastPathSegment ?: "file.apk") to size
    }

    fun describeLocation(uri: Uri): String? {
        val doc = uri.lastPathSegment ?: return uri.authority
        // External storage provider IDs look like "primary:Download/app.apk".
        return if (doc.contains(':')) doc.substringAfter(':').substringBeforeLast('/', "").ifBlank { uri.authority }
        else uri.authority
    }

    @Suppress("DEPRECATION")
    private fun signingFlags(): Int =
        if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
        else PackageManager.GET_SIGNATURES

    @Suppress("DEPRECATION")
    private fun archiveInfo(path: String): PackageInfo? {
        val flags = PackageManager.GET_PERMISSIONS or signingFlags()
        return if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else pm.getPackageArchiveInfo(path, flags)
    }

    @Suppress("DEPRECATION")
    private fun installedInfo(pkg: String): PackageInfo =
        if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(signingFlags().toLong()))
        } else pm.getPackageInfo(pkg, signingFlags())

    @Suppress("DEPRECATION")
    private fun signerDigest(info: PackageInfo): String? = runCatching {
        val sig = if (Build.VERSION.SDK_INT >= 28) {
            val si = info.signingInfo ?: return null
            if (si.hasMultipleSigners()) si.apkContentsSigners.firstOrNull() else si.signingCertificateHistory.lastOrNull()
        } else info.signatures?.firstOrNull()
        sig ?: return null
        MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())
            .joinToString(":") { "%02X".format(it) }
    }.getOrNull()
}

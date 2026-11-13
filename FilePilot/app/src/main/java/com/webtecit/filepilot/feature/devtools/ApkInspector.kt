package com.webtecit.filepilot.feature.devtools

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Build
import com.webtecit.filepilot.core.operations.Checksums
import java.io.File
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.zip.ZipFile

data class ApkReport(
    val label: String,
    val packageName: String,
    val versionName: String,
    val versionCode: Long,
    val minSdk: Int,
    val targetSdk: Int,
    val permissions: List<String>,
    val certificates: List<String>,
    val nativeAbis: Map<String, Int>,
    val dexFiles: Int,
    val entries: Int,
    val splits: List<String>,
    val icon: Drawable?,
)

/** Reads an APK with Android's own parser; nothing is installed or executed. */
object ApkInspector {
    @Suppress("DEPRECATION")
    fun inspect(context: Context, path: String): ApkReport {
        val pm = context.packageManager
        val flags = PackageManager.GET_PERMISSIONS or
            if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val info: PackageInfo = pm.getPackageArchiveInfo(path, flags)
            ?: throw IllegalArgumentException("This file isn't a valid APK, or Android can't read it.")
        val app = info.applicationInfo
        app?.sourceDir = path
        app?.publicSourceDir = path
        val sigs = if (Build.VERSION.SDK_INT >= 28) {
            info.signingInfo?.let { s -> if (s.hasMultipleSigners()) s.apkContentsSigners else s.signingCertificateHistory }?.toList().orEmpty()
        } else info.signatures?.toList().orEmpty()
        val certs = sigs.map { sig ->
            val sha = Checksums.toHex(MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())).chunked(2).joinToString(":").uppercase()
            val x = runCatching {
                CertificateFactory.getInstance("X.509").generateCertificate(sig.toByteArray().inputStream()) as X509Certificate
            }.getOrNull()
            buildString {
                x?.let { append(it.subjectX500Principal.name).append("\nValid until ").append(it.notAfter).append('\n') }
                append("SHA-256 ").append(sha)
            }
        }
        val abis = HashMap<String, Int>()
        var dex = 0
        var count = 0
        ZipFile(File(path)).use { zip ->
            for (e in zip.entries()) {
                count++
                val n = e.name
                if (n.startsWith("lib/") && n.endsWith(".so")) abis.merge(n.split('/').getOrElse(1) { "?" }, 1, Int::plus)
                if (n.matches(Regex("classes\\d*\\.dex"))) dex++
            }
        }
        return ApkReport(
            label = app?.let { runCatching { pm.getApplicationLabel(it).toString() }.getOrNull() } ?: info.packageName,
            packageName = info.packageName,
            versionName = info.versionName ?: "—",
            versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong(),
            minSdk = app?.minSdkVersion ?: 0,
            targetSdk = app?.targetSdkVersion ?: 0,
            permissions = info.requestedPermissions?.toList().orEmpty().sorted(),
            certificates = certs,
            nativeAbis = abis,
            dexFiles = dex,
            entries = count,
            splits = emptyList(),
            icon = app?.let { runCatching { it.loadIcon(pm) }.getOrNull() },
        )
    }

    /** XAPK/APKS bundles: the APKs and other files they contain. */
    fun bundleContents(path: String): List<Pair<String, Long>> =
        ZipFile(File(path)).use { zip -> zip.entries().toList().filter { !it.isDirectory }.map { it.name to it.size } }
}

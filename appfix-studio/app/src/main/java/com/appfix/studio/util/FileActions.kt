package com.appfix.studio.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/** Install, share and export helpers for files the user produced in AppFix Studio. */
object FileActions {
    private fun uri(context: Context, file: File): Uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)

    private fun mime(file: File) = when (file.extension.lowercase()) {
        "apk" -> "application/vnd.android.package-archive"
        "aab", "zip" -> "application/zip"
        "txt", "log" -> "text/plain"
        else -> "application/octet-stream"
    }

    /** True when the system will let AppFix Studio start an install (Android 8+ asks once per app). */
    fun canInstall(context: Context): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /** Opens the system installer, which always shows its own confirmation screen. */
    fun install(context: Context, apk: File): String? = try {
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri(context, apk), mime(apk))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        null
    } catch (e: ActivityNotFoundException) {
        "No installer is available on this device."
    }

    fun share(context: Context, file: File, title: String = "Share ${file.name}") {
        val intent = Intent(Intent.ACTION_SEND).setType(mime(file)).putExtra(Intent.EXTRA_STREAM, uri(context, file))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(intent, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Copies [file] to a location the user picked with ACTION_CREATE_DOCUMENT. */
    fun exportTo(context: Context, file: File, target: Uri) {
        context.contentResolver.openOutputStream(target, "w")?.use { out -> file.inputStream().use { it.copyTo(out) } }
            ?: throw IllegalStateException("The destination could not be opened")
    }
}

package com.webtecit.filepilot.core.permissions

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat

enum class AccessLevel {
    /** Every folder of shared storage can be browsed and changed directly. */
    FULL,

    /** Only folders granted through the system folder picker. */
    LIMITED,
}

object StorageAccess {

    /** Android 11+ uses "All files access"; Android 7–10 uses the classic storage permission. */
    val usesAllFilesAccess: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

    fun level(context: Context): AccessLevel = if (hasFullAccess(context)) AccessLevel.FULL else AccessLevel.LIMITED

    fun hasFullAccess(context: Context): Boolean =
        if (usesAllFilesAccess) {
            Environment.isExternalStorageManager()
        } else {
            legacyPermissions.all {
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
            }
        }

    val legacyPermissions: Array<String>
        get() = if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P || Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

    /** Opens the "All files access" page for this app (Android 11+). */
    fun allFilesAccessIntent(context: Context): Intent {
        val specific = Intent(
            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            Uri.parse("package:${context.packageName}"),
        )
        return if (specific.resolveActivity(context.packageManager) != null) specific
        else Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
    }

    fun appSettingsIntent(context: Context): Intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
}

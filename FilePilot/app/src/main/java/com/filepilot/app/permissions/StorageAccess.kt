package com.filepilot.app.permissions

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * What FilePilot can currently reach. Each flag is checked against the real system state
 * on every resume, so revoked permissions are noticed immediately.
 */
data class AccessState(
    /** Can read and write the shared storage through file paths. */
    val fullAccess: Boolean = false,
    /** Android 7–10 only: storage permission granted (full access on those versions). */
    val legacyGranted: Boolean = false,
    /** Android 11+: "All files access" granted. */
    val allFilesGranted: Boolean = false,
    val images: Boolean = false,
    val video: Boolean = false,
    val audio: Boolean = false,
    /** Number of folders granted through the system folder picker. */
    val pickedFolderCount: Int = 0,
) {
    val anyMedia: Boolean get() = images || video || audio
    val allMedia: Boolean get() = images && video && audio
    val hasAnyAccess: Boolean get() = fullAccess || anyMedia || pickedFolderCount > 0
}

object StorageAccess {
    /** Android 11+ needs a special settings screen for full file management. */
    val usesAllFilesAccess: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

    /** Android 13+ splits media access into images / video / audio. */
    val usesGranularMedia: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    fun current(context: Context, pickedFolderCount: Int): AccessState {
        val sdk = Build.VERSION.SDK_INT
        fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED

        val allFiles = sdk >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()
        val legacyRead = sdk < Build.VERSION_CODES.TIRAMISU && granted(Manifest.permission.READ_EXTERNAL_STORAGE)
        val legacyWrite = sdk < Build.VERSION_CODES.R && granted(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        val legacyFull = sdk < Build.VERSION_CODES.R && legacyRead && legacyWrite
        val full = allFiles || legacyFull

        val images: Boolean
        val video: Boolean
        val audio: Boolean
        if (sdk >= Build.VERSION_CODES.TIRAMISU) {
            images = full || granted(Manifest.permission.READ_MEDIA_IMAGES)
            video = full || granted(Manifest.permission.READ_MEDIA_VIDEO)
            audio = full || granted(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            images = full || legacyRead
            video = images
            audio = images
        }
        return AccessState(
            fullAccess = full,
            legacyGranted = legacyFull,
            allFilesGranted = allFiles,
            images = images,
            video = video,
            audio = audio,
            pickedFolderCount = pickedFolderCount,
        )
    }

    /** Runtime permissions for full access on Android 7–10. */
    val legacyPermissions: Array<String> = arrayOf(
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE,
    )

    /** Runtime permissions that give read-only access to photos, videos and audio. */
    val mediaPermissions: Array<String>
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
            )
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

    /**
     * True when the system will no longer show the dialog: the permission was requested
     * before, is still denied, and Android says no rationale should be shown.
     */
    fun isPermanentlyDenied(activity: Activity, permissions: Array<String>, requestedBefore: Boolean): Boolean {
        if (!requestedBefore) return false
        val denied = permissions.filter {
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }
        if (denied.isEmpty()) return false
        return denied.none { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }
    }

    /** Opens the "All files access" page for FilePilot (Android 11+). */
    fun allFilesAccessIntent(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        return Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
            .setData(Uri.fromParts("package", context.packageName, null))
    }

    fun allFilesAccessFallbackIntent(): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION) else null

    fun appSettingsIntent(context: Context): Intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun openAppSettings(context: Context) {
        try {
            context.startActivity(appSettingsIntent(context))
        } catch (_: ActivityNotFoundException) {
            context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

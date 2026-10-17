package com.webtecit.devicepilot.data.install

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Installs an APK through PackageInstaller. Android always shows its own confirmation
 * screen to the user; DevicePilot never installs silently.
 */
class AppInstaller(private val context: Context) {

    fun canRequestInstalls(): Boolean =
        if (Build.VERSION.SDK_INT >= 26) context.packageManager.canRequestPackageInstalls() else true

    suspend fun install(uri: Uri, packageName: String, sizeBytes: Long?) = withContext(Dispatchers.IO) {
        InstallEvents.update(InstallState.Copying(packageName))
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(packageName)
            if (Build.VERSION.SDK_INT >= 31) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
            }
            if (sizeBytes != null && sizeBytes > 0) setSize(sizeBytes)
        }
        var sessionId = -1
        try {
            sessionId = installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                context.contentResolver.openInputStream(uri)?.use { input ->
                    session.openWrite("base.apk", 0, sizeBytes ?: -1).use { out ->
                        input.copyTo(out)
                        session.fsync(out)
                    }
                } ?: error("Cannot read file")
                val callback = Intent(context, InstallResultReceiver::class.java)
                    .putExtra(InstallResultReceiver.EXTRA_TARGET_PACKAGE, packageName)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                val pi = PendingIntent.getBroadcast(context, sessionId, callback, flags)
                session.commit(pi.intentSender)
            }
        } catch (t: Throwable) {
            if (sessionId != -1) runCatching { installer.abandonSession(sessionId) }
            InstallEvents.update(InstallState.Failed(packageName, InstallFailure.OTHER, t.message))
        }
    }
}

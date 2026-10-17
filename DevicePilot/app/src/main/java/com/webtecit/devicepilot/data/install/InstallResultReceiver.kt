package com.webtecit.devicepilot.data.install

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import com.webtecit.devicepilot.data.getPackageInfoCompat
import com.webtecit.devicepilot.data.longVersion

/** Receives PackageInstaller session results. Success is double-checked with PackageManager. */
class InstallResultReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val pkg = intent.getStringExtra(EXTRA_TARGET_PACKAGE)
            ?: intent.getStringExtra(PackageInstaller.EXTRA_PACKAGE_NAME) ?: ""
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirm != null) {
                    InstallEvents.update(InstallState.WaitingForUser(pkg))
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(confirm) }.onFailure {
                        InstallEvents.update(InstallState.Failed(pkg, InstallFailure.OTHER, it.message))
                    }
                } else {
                    InstallEvents.update(InstallState.Failed(pkg, InstallFailure.OTHER, message))
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                val version = runCatching { context.packageManager.getPackageInfoCompat(pkg).longVersion() }.getOrNull()
                if (version != null) InstallEvents.update(InstallState.Installed(pkg, version))
                else InstallEvents.update(InstallState.Failed(pkg, InstallFailure.OTHER, "Not found after install"))
            }
            else -> InstallEvents.update(InstallState.Failed(pkg, mapFailure(status), message))
        }
    }

    companion object {
        const val EXTRA_TARGET_PACKAGE = "com.webtecit.devicepilot.TARGET_PACKAGE"

        fun mapFailure(status: Int): InstallFailure = when (status) {
            PackageInstaller.STATUS_FAILURE_ABORTED -> InstallFailure.ABORTED
            PackageInstaller.STATUS_FAILURE_BLOCKED -> InstallFailure.BLOCKED
            PackageInstaller.STATUS_FAILURE_CONFLICT -> InstallFailure.CONFLICT
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> InstallFailure.INCOMPATIBLE
            PackageInstaller.STATUS_FAILURE_INVALID -> InstallFailure.INVALID
            PackageInstaller.STATUS_FAILURE_STORAGE -> InstallFailure.STORAGE
            PackageInstaller.STATUS_FAILURE_TIMEOUT -> InstallFailure.TIMEOUT
            else -> InstallFailure.OTHER
        }
    }
}

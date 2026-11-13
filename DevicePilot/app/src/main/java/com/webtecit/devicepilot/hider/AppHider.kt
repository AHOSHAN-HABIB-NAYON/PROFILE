package com.webtecit.devicepilot.hider

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DevicePilotAdminReceiver : DeviceAdminReceiver()

data class HideableApp(val packageName: String, val label: String, val hidden: Boolean, val isSystem: Boolean)

/**
 * Real app hiding uses DevicePolicyManager.setApplicationHidden, which Android only allows for
 * the device owner. A hidden app disappears from the launcher, settings and app lists and cannot
 * run until it is unhidden; its data is kept.
 */
class AppHider(private val context: Context) {
    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val admin = ComponentName(context, DevicePilotAdminReceiver::class.java)

    fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)

    fun setupCommand(): String = "adb shell dpm set-device-owner ${context.packageName}/${DevicePilotAdminReceiver::class.java.name}"

    fun isHidden(pkg: String): Boolean = runCatching { dpm.isApplicationHidden(admin, pkg) }.getOrDefault(false)

    /** Returns true only when Android confirms the new state. */
    fun setHidden(pkg: String, hidden: Boolean): Boolean {
        if (!isDeviceOwner() || pkg == context.packageName) return false
        return runCatching { dpm.setApplicationHidden(admin, pkg, hidden) }.getOrDefault(false) && isHidden(pkg) == hidden
    }

    /** Launchable apps plus apps that are currently hidden (which are no longer launchable). */
    @Suppress("DEPRECATION")
    suspend fun apps(): List<HideableApp> = withContext(Dispatchers.IO) {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 24) PackageManager.MATCH_UNINSTALLED_PACKAGES else PackageManager.GET_UNINSTALLED_PACKAGES
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val launchable = pm.queryIntentActivities(launcher, 0).map { it.activityInfo.packageName }.toSet()
        pm.getInstalledApplications(flags).asSequence()
            .filter { it.packageName != context.packageName }
            .mapNotNull { ai ->
                val hidden = isHidden(ai.packageName)
                if (!hidden && ai.packageName !in launchable) return@mapNotNull null
                HideableApp(
                    ai.packageName,
                    runCatching { ai.loadLabel(pm).toString() }.getOrDefault(ai.packageName),
                    hidden,
                    ai.flags and ApplicationInfo.FLAG_SYSTEM != 0,
                )
            }
            .sortedWith(compareByDescending<HideableApp> { it.hidden }.thenBy { it.label.lowercase() })
            .toList()
    }

    /** Gives up device-owner status (hidden apps are unhidden first so nothing is lost). */
    @Suppress("DEPRECATION")
    suspend fun removeOwner(): Boolean = withContext(Dispatchers.IO) {
        if (!isDeviceOwner()) return@withContext true
        apps().filter { it.hidden }.forEach { setHidden(it.packageName, false) }
        runCatching { dpm.clearDeviceOwnerApp(context.packageName) }.isSuccess
    }
}

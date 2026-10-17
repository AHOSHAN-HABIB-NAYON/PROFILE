package com.webtecit.devicepilot.system

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.domain.SettingsTarget

/**
 * Opens real Android settings screens. Every shortcut has a fallback because
 * manufacturers remove or rename some screens.
 */
object SystemSettings {

    fun open(context: Context, vararg intents: Intent): Boolean {
        for (i in intents) {
            try {
                context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        Toast.makeText(context, R.string.settings_unavailable, Toast.LENGTH_LONG).show()
        return false
    }

    private fun action(a: String) = Intent(a)
    private val general get() = Intent(Settings.ACTION_SETTINGS)

    fun appDetails(context: Context, pkg: String) = open(
        context,
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")),
        action(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS),
    )

    fun appNotifications(context: Context, pkg: String) = if (Build.VERSION.SDK_INT >= 26) open(
        context,
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg),
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")),
    ) else appDetails(context, pkg)

    fun appBackgroundData(context: Context, pkg: String) = open(
        context,
        Intent(Settings.ACTION_IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS, Uri.parse("package:$pkg")),
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")),
    )

    fun batteryOptimization(context: Context) = open(
        context, action(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), battery(), general,
    )

    private fun battery() = Intent(Intent.ACTION_POWER_USAGE_SUMMARY)

    fun batterySettings(context: Context) = open(
        context, battery(), action(Settings.ACTION_BATTERY_SAVER_SETTINGS), general,
    )

    fun batterySaver(context: Context) = open(context, action(Settings.ACTION_BATTERY_SAVER_SETTINGS), battery())

    fun storage(context: Context) = open(
        context, action(Settings.ACTION_INTERNAL_STORAGE_SETTINGS), action(Settings.ACTION_MEMORY_CARD_SETTINGS), general,
    )

    fun developerOptions(context: Context) = open(
        context, action(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS), action(Settings.ACTION_DEVICE_INFO_SETTINGS), general,
    )

    fun aboutPhone(context: Context) = open(context, action(Settings.ACTION_DEVICE_INFO_SETTINGS), general)

    fun appList(context: Context) = open(
        context, action(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS), action(Settings.ACTION_APPLICATION_SETTINGS), general,
    )

    fun usageAccess(context: Context) = open(context, action(Settings.ACTION_USAGE_ACCESS_SETTINGS), general)

    fun dataUsage(context: Context) = open(
        context,
        action(if (Build.VERSION.SDK_INT >= 28) Settings.ACTION_DATA_USAGE_SETTINGS else Settings.ACTION_DATA_ROAMING_SETTINGS),
        action(Settings.ACTION_WIRELESS_SETTINGS),
        general,
    )

    fun systemUpdate(context: Context) = open(
        context, action("android.settings.SYSTEM_UPDATE_SETTINGS"), action(Settings.ACTION_DEVICE_INFO_SETTINGS), general,
    )

    fun vpn(context: Context) = open(context, action(Settings.ACTION_VPN_SETTINGS), general)

    fun display(context: Context) = open(context, action(Settings.ACTION_DISPLAY_SETTINGS), general)

    fun unknownSources(context: Context) = if (Build.VERSION.SDK_INT >= 26) open(
        context,
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")),
        action(Settings.ACTION_SECURITY_SETTINGS),
    ) else open(context, action(Settings.ACTION_SECURITY_SETTINGS), general)

    fun notificationsForThisApp(context: Context) = appNotifications(context, context.packageName)

    fun downloads(context: Context) = open(context, Intent(DownloadManager.ACTION_VIEW_DOWNLOADS))

    fun playStore(context: Context, pkg: String? = null) = open(
        context,
        Intent(Intent.ACTION_VIEW, Uri.parse(if (pkg != null) "market://details?id=$pkg" else "market://search?q=apps")),
        Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps" + if (pkg != null) "/details?id=$pkg" else "")),
    )

    fun playStoreUpdates(context: Context) = open(
        context,
        Intent(Intent.ACTION_VIEW, Uri.parse("market://myapps")).setPackage("com.android.vending"),
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.android.vending")),
        Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps")),
    )

    fun url(context: Context, url: String) = open(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)))

    fun launchApp(context: Context, pkg: String): Boolean {
        val i = context.packageManager.getLaunchIntentForPackage(pkg)
        return if (i != null) open(context, i) else {
            Toast.makeText(context, R.string.app_not_launchable, Toast.LENGTH_SHORT).show(); false
        }
    }

    fun shareText(context: Context, text: String, title: String) = open(
        context, Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), title),
    )

    fun openTarget(context: Context, target: SettingsTarget) {
        when (target) {
            SettingsTarget.NONE -> Unit
            SettingsTarget.STORAGE -> storage(context)
            SettingsTarget.MEMORY_APPS -> appList(context)
            SettingsTarget.BATTERY -> batterySettings(context)
            SettingsTarget.BATTERY_OPTIMIZATION -> batteryOptimization(context)
            SettingsTarget.DEVELOPER_OPTIONS -> developerOptions(context)
            SettingsTarget.USAGE_ACCESS -> usageAccess(context)
            SettingsTarget.DATA_USAGE -> dataUsage(context)
            SettingsTarget.SYSTEM_UPDATE -> systemUpdate(context)
            SettingsTarget.APP_LIST -> appList(context)
            SettingsTarget.PLAY_STORE_UPDATES -> playStoreUpdates(context)
        }
    }
}

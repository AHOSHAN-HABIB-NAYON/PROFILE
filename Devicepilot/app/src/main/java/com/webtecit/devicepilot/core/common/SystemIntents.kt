package com.webtecit.devicepilot.core.common

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast

/**
 * Opens system settings screens. Devicepilot never changes system settings itself;
 * it takes the user to the right page so they can decide.
 */
object SystemIntents {

    fun open(context: Context, intent: Intent, fallback: Intent? = Intent(Settings.ACTION_SETTINGS)): Boolean {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            if (fallback != null) open(context, fallback, null)
            else {
                Toast.makeText(context, "This settings page is not available on this device", Toast.LENGTH_SHORT).show()
                false
            }
        } catch (e: SecurityException) {
            Toast.makeText(context, "This settings page is restricted on this device", Toast.LENGTH_SHORT).show()
            false
        }
    }

    fun settings(context: Context, action: String) = open(context, Intent(action))

    fun developerOptions(context: Context) =
        open(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS), Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))

    fun aboutPhone(context: Context) = open(context, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))

    fun display(context: Context) = open(context, Intent(Settings.ACTION_DISPLAY_SETTINGS))

    fun batterySaver(context: Context) = open(context, Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS))

    fun batteryUsage(context: Context) =
        open(context, Intent(Intent.ACTION_POWER_USAGE_SUMMARY), Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS))

    fun storage(context: Context) = open(context, Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS))

    fun manageStorage(context: Context) =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            open(context, Intent(android.os.storage.StorageManager.ACTION_MANAGE_STORAGE), Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS))
        } else storage(context)

    fun apps(context: Context) = open(context, Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS))

    fun wifi(context: Context) = open(context, Intent(Settings.ACTION_WIFI_SETTINGS))

    fun network(context: Context) = open(context, Intent(Settings.ACTION_WIRELESS_SETTINGS))

    fun dataUsage(context: Context) =
        open(context, Intent(Settings.ACTION_DATA_ROAMING_SETTINGS), Intent(Settings.ACTION_WIRELESS_SETTINGS))

    fun appDetails(context: Context, packageName: String) =
        open(context, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))

    fun usageAccess(context: Context) = open(context, Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))

    fun appNotifications(context: Context) =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            open(
                context,
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")),
            )
        } else appDetails(context, context.packageName)

    fun systemUpdate(context: Context) =
        open(context, Intent("android.settings.SYSTEM_UPDATE_SETTINGS"), Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))

    fun uninstall(context: Context, packageName: String) =
        open(context, Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName")), null)

    fun web(context: Context, url: String) =
        open(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)), null)

    fun email(context: Context, address: String, subject: String) =
        open(
            context,
            Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")).apply {
                putExtra(Intent.EXTRA_EMAIL, arrayOf(address))
                putExtra(Intent.EXTRA_SUBJECT, subject)
            },
            null,
        )

    fun shareText(context: Context, subject: String, text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        open(context, Intent.createChooser(send, subject), null)
    }

    fun playStore(context: Context) =
        open(
            context,
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${context.packageName}")),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}")),
        )
}

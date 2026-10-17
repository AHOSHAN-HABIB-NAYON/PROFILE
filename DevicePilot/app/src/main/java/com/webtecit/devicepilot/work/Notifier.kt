package com.webtecit.devicepilot.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.webtecit.devicepilot.MainActivity
import com.webtecit.devicepilot.R

object Notifier {
    const val CH_HEALTH = "health_alerts"
    const val CH_DATA = "data_alerts"
    const val CH_FIREWALL = "firewall"

    private const val ID_TEMP = 101
    private const val ID_THERMAL = 102
    private const val ID_STORAGE = 103
    private const val ID_DATA = 104
    private const val ID_FIREWALL = 105

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannels(listOf(
            NotificationChannel(CH_HEALTH, context.getString(R.string.channel_health), NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(CH_DATA, context.getString(R.string.channel_data), NotificationManager.IMPORTANCE_LOW),
            NotificationChannel(CH_FIREWALL, context.getString(R.string.channel_firewall), NotificationManager.IMPORTANCE_DEFAULT),
        ))
    }

    fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun post(context: Context, id: Int, channel: String, title: String, text: String, route: String) {
        if (!canPost(context)) return
        val intent = Intent(context, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pi = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_devicepilot)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, n)
        } catch (_: SecurityException) {
            // Permission revoked between the check and the call.
        }
    }

    fun temperature(context: Context, value: String) = post(context, ID_TEMP, CH_HEALTH,
        context.getString(R.string.notif_temp_title), context.getString(R.string.notif_temp_text, value), "temperature")

    fun thermal(context: Context, status: String) = post(context, ID_THERMAL, CH_HEALTH,
        context.getString(R.string.notif_thermal_title), context.getString(R.string.notif_thermal_text, status), "temperature")

    fun storage(context: Context, free: String) = post(context, ID_STORAGE, CH_HEALTH,
        context.getString(R.string.notif_storage_title), context.getString(R.string.notif_storage_text, free), "storage")

    fun data(context: Context, used: String) = post(context, ID_DATA, CH_DATA,
        context.getString(R.string.notif_data_title), context.getString(R.string.notif_data_text, used), "network")

    fun firewallInterrupted(context: Context) = post(context, ID_FIREWALL, CH_FIREWALL,
        context.getString(R.string.notif_firewall_title), context.getString(R.string.notif_firewall_text), "firewall")
}

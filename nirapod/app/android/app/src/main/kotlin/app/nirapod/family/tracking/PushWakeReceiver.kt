package app.nirapod.family.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * FCM data message "update_requested" for a child phone: wake the visible location service for a fresh fix,
 * even when the app is closed. Only Google Play services can send this broadcast (c2dm SEND permission).
 * The Firebase plugin's own receiver still handles every message normally.
 */
class PushWakeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val type = intent.extras?.getString("type") ?: return
        if (type != "update_requested") return
        val store = TrackingStore(context)
        if (!store.enabled) return
        try {
            TrackingService.start(context, TrackingService.ACTION_REQUEST_NOW)
        } catch (_: Exception) {
            // Background start not allowed (rare without high priority): the next scheduled update covers it.
        }
    }
}

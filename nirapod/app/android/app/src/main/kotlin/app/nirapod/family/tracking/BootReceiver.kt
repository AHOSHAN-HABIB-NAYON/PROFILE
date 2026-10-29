package app.nirapod.family.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts location sharing after a reboot or app update, on child devices that had it enabled. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (!TrackingStore(context).enabled) return
        try {
            TrackingService.start(context)
        } catch (_: Exception) {
            // Starting a location service from the background can be refused (no background permission):
            // the app restarts it the next time it is opened.
        }
    }
}

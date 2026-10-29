package app.nirapod.family.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Wake-up alarm (about every 15 min, also in Doze) while sharing runs: asks the service for a fresh fix and
 * an upload, so the family keeps seeing updates when the screen is off.
 */
class HeartbeatReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!TrackingStore(context).enabled) return
        try {
            TrackingService.start(context, TrackingService.ACTION_HEARTBEAT)
        } catch (_: Exception) {
            // Android refused a background start; the next location fix or push brings it back.
        }
    }
}

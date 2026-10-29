package app.nirapod.family.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android geofence transition (enter/exit a family place). It only wakes the service to send fresh points
 * quickly (a short high-accuracy burst); the server decides arrival/departure with its 2-point debounce.
 */
class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (TrackingStore(context).enabled) TrackingService.start(context, TrackingService.ACTION_GEOFENCE)
    }
}

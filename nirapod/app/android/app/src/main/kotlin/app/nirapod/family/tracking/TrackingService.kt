package app.nirapod.family.tracking

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.nirapod.family.MainActivity
import app.nirapod.family.R
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Child-device location sharing (foreground service, type location) with a permanent, visible notification
 * "Location sharing is on". Nothing is hidden: the notification cannot be dismissed while sharing runs.
 *
 * Adaptive frequency: still 12 min, moving 90 s, safe-walk trip 20 s; slower on low battery (not charging)
 * and in battery saver. Weak GPS: very inaccurate fixes are skipped. Points are queued in SQLite and
 * uploaded in batches with exponential backoff, so nothing is lost offline.
 */
class TrackingService : Service() {
    enum class Mode(val intervalMs: Long, val priority: Int) {
        STILL(12 * 60_000L, Priority.PRIORITY_BALANCED_POWER_ACCURACY),
        MOVING(90_000L, Priority.PRIORITY_HIGH_ACCURACY),
        TRIP(20_000L, Priority.PRIORITY_HIGH_ACCURACY),
    }

    private lateinit var store: TrackingStore
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private lateinit var worker: Handler
    private var mode = Mode.STILL
    private var appliedInterval = 0L
    private var last: Location? = null
    private var stillCount = 0
    private var backoffMs = 30_000L
    private var uploadScheduled = false
    private var lastStateSent: String? = null
    private var receiverRegistered = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            for (loc in result.locations) onFix(loc)
        }
    }

    private val providerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            worker.post { reportStateIfChanged() }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        store = TrackingStore(this)
        val t = HandlerThread("nirapod-tracking")
        t.start()
        worker = Handler(t.looper)
        createChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!store.enabled || !hasLocationPermission()) {
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = sharingNotification()
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } catch (e: Exception) {
            // Background start not allowed right now (e.g. permission revoked): stop cleanly.
            stopSelf()
            return START_NOT_STICKY
        }
        when (intent?.action) {
            ACTION_REQUEST_NOW -> worker.post { requestImmediateFix() }
            ACTION_TRIP -> worker.post { applyMode(force = true) }
        }
        worker.post {
            applyMode(force = appliedInterval == 0L)
            reportStateIfChanged()
            scheduleUpload(0)
        }
        if (!receiverRegistered) {
            ContextCompat.registerReceiver(
                this, providerReceiver, IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED
            )
            receiverRegistered = true
        }
        return START_STICKY
    }

    override fun onDestroy() {
        if (receiverRegistered) {
            unregisterReceiver(providerReceiver)
            receiverRegistered = false
        }
        fused.removeLocationUpdates(callback)
        worker.looper.quitSafely()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- location

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun currentMode(): Mode = when {
        System.currentTimeMillis() < store.tripUntil -> Mode.TRIP
        else -> mode
    }

    private fun intervalFor(m: Mode): Long {
        if (m == Mode.TRIP) return m.intervalMs
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (power.isPowerSaveMode) return Mode.STILL.intervalMs
        val (level, charging) = battery()
        return if (level in 0..15 && !charging) m.intervalMs * 2 else m.intervalMs
    }

    private fun applyMode(force: Boolean = false) {
        if (!hasLocationPermission()) return
        val m = currentMode()
        val interval = intervalFor(m)
        if (!force && interval == appliedInterval) return
        appliedInterval = interval
        val request = LocationRequest.Builder(m.priority, interval)
            .setMinUpdateIntervalMillis(interval / 2)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fused.removeLocationUpdates(callback)
            fused.requestLocationUpdates(request, callback, worker.looper)
        } catch (_: SecurityException) {
            reportStateIfChanged()
        }
    }

    private fun requestImmediateFix() {
        if (!hasLocationPermission()) return
        try {
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).addOnSuccessListener { loc ->
                if (loc != null) worker.post {
                    onFix(loc, forced = true)
                    scheduleUpload(0)
                }
            }
        } catch (_: SecurityException) {
        }
    }

    private fun onFix(loc: Location, forced: Boolean = false) {
        // Weak GPS: skip very inaccurate fixes unless we have had nothing for 30 minutes.
        val prev = last
        val stale = prev == null || loc.time - prev.time > 30 * 60_000L
        if (!forced && loc.hasAccuracy() && loc.accuracy > 500f && !stale) return
        val moved = prev != null && loc.distanceTo(prev) > 75f
        val fast = loc.hasSpeed() && loc.speed > 1.0f
        if (moved || fast) {
            stillCount = 0
            if (mode == Mode.STILL) {
                mode = Mode.MOVING
            }
        } else if (mode == Mode.MOVING && ++stillCount >= 3) {
            mode = Mode.STILL
        }
        last = loc
        val (level, _) = battery()
        val p = JSONObject()
            .put("recorded_at", iso(loc.time))
            .put("lat", loc.latitude)
            .put("lng", loc.longitude)
            .put("accuracy_m", if (loc.hasAccuracy()) loc.accuracy.toDouble() else 50.0)
            .put("is_moving", mode != Mode.STILL)
        if (loc.hasSpeed()) p.put("speed_mps", loc.speed.toDouble().coerceIn(0.0, 150.0))
        if (loc.hasBearing()) p.put("heading_deg", loc.bearing.toDouble().coerceIn(0.0, 360.0))
        if (level in 0..100) p.put("battery_pct", level)
        store.enqueue(p)
        applyMode()
        val due = when (currentMode()) {
            Mode.TRIP, Mode.STILL -> 0L
            Mode.MOVING -> if (store.size() >= 3) 0L else 5 * 60_000L
        }
        scheduleUpload(due)
    }

    // ---------------------------------------------------------------- upload

    private fun scheduleUpload(delayMs: Long) {
        if (uploadScheduled && delayMs > 0) return
        uploadScheduled = true
        worker.postDelayed({
            uploadScheduled = false
            upload()
        }, delayMs)
    }

    private fun upload() {
        val (ids, points) = store.peek(200)
        if (ids.isEmpty()) return
        when (val r = Uploader.post(store, points, deviceState())) {
            is UploadResult.Ok -> {
                store.remove(ids)
                backoffMs = 30_000L
                r.updateRequestedBy?.let { onUpdateRequested(it) }
                if (store.size() > 0) scheduleUpload(0)
            }
            UploadResult.Revoked -> stopForGood()
            UploadResult.RetryLater -> {
                scheduleUpload(backoffMs)
                backoffMs = (backoffMs * 2).coerceAtMost(15 * 60_000L)
            }
        }
    }

    private fun deviceState(): JSONObject {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        val bg = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        val servicesOn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lm.isLocationEnabled else true
        return JSONObject()
            .put("location_allowed", hasLocationPermission())
            .put("background_allowed", bg)
            .put("location_services_on", servicesOn)
            .put("battery_saver_on", power.isPowerSaveMode)
            .put("battery_optimization_on", !power.isIgnoringBatteryOptimizations(packageName))
            .put("notifications_allowed", androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled())
    }

    /** Location turned off / permission removed: tell the family even without a new fix. */
    private fun reportStateIfChanged() {
        val s = deviceState()
        val key = "${s.optBoolean("location_allowed")}|${s.optBoolean("location_services_on")}"
        if (key == lastStateSent) return
        lastStateSent = key
        if (!s.optBoolean("location_allowed") || !s.optBoolean("location_services_on")) {
            Thread { Uploader.post(store, JSONArray(), s) }.start()
        } else {
            applyMode(force = true)
        }
    }

    private fun onUpdateRequested(byName: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val title = store.text("request_title", "%s requested your location").replace("%s", byName)
        nm.notify(
            REQUEST_NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_REQUESTS)
                .setSmallIcon(R.drawable.ic_stat_sharing)
                .setContentTitle(title)
                .setContentText(store.text("request_body", "Nirapod shared your current location."))
                .setAutoCancel(true)
                .setContentIntent(openAppIntent())
                .build()
        )
        requestImmediateFix()
    }

    private fun stopForGood() {
        store.clear()
        fused.removeLocationUpdates(callback)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ---------------------------------------------------------------- notifications

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SHARING, store.text("channel_sharing", "Location sharing"), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_REQUESTS, store.text("channel_requests", "Family requests"), NotificationManager.IMPORTANCE_HIGH)
        )
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun sharingNotification(): Notification = NotificationCompat.Builder(this, CHANNEL_SHARING)
        .setSmallIcon(R.drawable.ic_stat_sharing)
        .setContentTitle(store.text("sharing_title", "Location sharing is on"))
        .setContentText(store.text("sharing_body", "Your family can see where you are."))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setContentIntent(openAppIntent())
        .build()

    // ---------------------------------------------------------------- helpers

    private fun battery(): Pair<Int, Boolean> {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return Pair(level, bm.isCharging)
    }

    private fun iso(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(ms))
    }

    companion object {
        const val CHANNEL_SHARING = "nirapod_sharing"
        const val CHANNEL_REQUESTS = "nirapod_requests"
        const val NOTIFICATION_ID = 4101
        const val REQUEST_NOTIFICATION_ID = 4102
        const val ACTION_REQUEST_NOW = "app.nirapod.family.tracking.REQUEST_NOW"
        const val ACTION_TRIP = "app.nirapod.family.tracking.TRIP"

        fun start(context: Context, action: String? = null) {
            val i = Intent(context, TrackingService::class.java)
            if (action != null) i.action = action
            ContextCompat.startForegroundService(context, i)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }
}

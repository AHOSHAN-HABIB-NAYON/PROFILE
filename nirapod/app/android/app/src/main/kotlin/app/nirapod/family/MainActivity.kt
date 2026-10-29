package app.nirapod.family

import android.content.Intent
import app.nirapod.family.tracking.TrackingService
import app.nirapod.family.tracking.TrackingStore
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var tzSink: EventChannel.EventSink? = null
    private val tzReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context, intent: Intent) {
            tzSink?.success(java.util.TimeZone.getDefault().id)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        // Bridge for the child-device location service (lib/core/tracking/tracking_bridge.dart).
        MethodChannel(messenger, "nirapod/tracking").setMethodCallHandler { call, result ->
            val store = TrackingStore(applicationContext)
            try {
                when (call.method) {
                    "start" -> {
                        store.apiBase = call.argument<String>("apiBase") ?: ""
                        store.uploadKey = call.argument<String>("uploadKey") ?: ""
                        store.deviceId = call.argument<String>("deviceId") ?: ""
                        @Suppress("UNCHECKED_CAST")
                        store.setTexts((call.argument<Map<String, String>>("texts")) ?: emptyMap())
                        store.enabled = true
                        TrackingService.start(applicationContext)
                        result.success(true)
                    }
                    "stop" -> {
                        TrackingService.stop(applicationContext)
                        store.clear()
                        result.success(true)
                    }
                    "setTrip" -> {
                        store.tripUntil = (call.argument<Number>("untilMs") ?: 0).toLong()
                        if (store.enabled) TrackingService.start(applicationContext, TrackingService.ACTION_TRIP)
                        result.success(true)
                    }
                    "requestNow" -> {
                        if (store.enabled) TrackingService.start(applicationContext, TrackingService.ACTION_REQUEST_NOW)
                        result.success(store.enabled)
                    }
                    "status" -> result.success(
                        mapOf("enabled" to store.enabled, "hasKey" to store.uploadKey.isNotEmpty(), "queued" to store.size())
                    )
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("tracking", e.javaClass.simpleName, null)
            }
        }
        // Time zone change broadcast -> Dart (travel prompt / auto zone update).
        EventChannel(messenger, "nirapod/timezone").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                tzSink = events
                androidx.core.content.ContextCompat.registerReceiver(
                    this@MainActivity, tzReceiver, android.content.IntentFilter(Intent.ACTION_TIMEZONE_CHANGED),
                    androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
                )
            }

            override fun onCancel(arguments: Any?) {
                tzSink = null
                try {
                    unregisterReceiver(tzReceiver)
                } catch (_: Exception) {
                }
            }
        })
    }
}

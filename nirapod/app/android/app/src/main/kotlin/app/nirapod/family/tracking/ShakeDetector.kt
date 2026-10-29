package app.nirapod.family.tracking

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Shake-to-SOS: three strong shakes (over ~2.7 g) within 1.5 s. A 10 s cool-down avoids double triggers.
 * Uses only the accelerometer (no permission needed); runs inside the visible foreground service.
 */
class ShakeDetector(private val onShake: () -> Unit) : SensorEventListener {
    private val peaks = ArrayDeque<Long>()
    private var lastTrigger = 0L
    private var lastPeak = 0L

    override fun onSensorChanged(e: SensorEvent) {
        val (x, y, z) = Triple(e.values[0], e.values[1], e.values[2])
        val g = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH
        val now = System.currentTimeMillis()
        if (g < THRESHOLD_G || now - lastPeak < MIN_GAP_MS) return
        lastPeak = now
        peaks.addLast(now)
        while (peaks.isNotEmpty() && now - peaks.first() > WINDOW_MS) peaks.removeFirst()
        if (peaks.size >= SHAKES && now - lastTrigger > COOL_DOWN_MS) {
            lastTrigger = now
            peaks.clear()
            onShake()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        const val THRESHOLD_G = 2.7f
        const val SHAKES = 3
        const val WINDOW_MS = 1500L
        const val MIN_GAP_MS = 150L
        const val COOL_DOWN_MS = 10_000L
    }
}

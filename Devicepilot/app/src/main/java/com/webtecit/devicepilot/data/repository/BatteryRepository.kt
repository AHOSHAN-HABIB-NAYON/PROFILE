package com.webtecit.devicepilot.data.repository

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.domain.model.BatteryHealth
import com.webtecit.devicepilot.domain.model.BatteryStatus
import com.webtecit.devicepilot.domain.model.ChargeState
import com.webtecit.devicepilot.domain.model.PowerSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs
import kotlin.math.roundToInt

@Singleton
class BatteryRepository @Inject constructor(@ApplicationContext private val context: Context) {

    private val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager?

    /** Reads the sticky ACTION_BATTERY_CHANGED broadcast plus BatteryManager properties. */
    fun current(): BatteryStatus? {
        val intent = ContextCompat.registerReceiver(
            context, null, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED,
        ) ?: return null
        return parse(intent)
    }

    /** Polls at [intervalMs]; current/charge counter change without a broadcast, so polling is required. */
    fun observe(intervalMs: Long): Flow<BatteryStatus?> = flow {
        while (true) {
            emit(current())
            delay(intervalMs)
        }
    }.distinctUntilChanged { a, b -> a?.copy(timestamp = 0) == b?.copy(timestamp = 0) }.flowOn(Dispatchers.Default)

    internal fun parse(intent: Intent): BatteryStatus {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).takeIf { it > 0 } ?: 100
        val percent = if (level >= 0) (level * 100f / scale).roundToInt() else
            batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 } ?: 0

        val chargeState = when (intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)) {
            BatteryManager.BATTERY_STATUS_CHARGING -> ChargeState.CHARGING
            BatteryManager.BATTERY_STATUS_DISCHARGING -> ChargeState.DISCHARGING
            BatteryManager.BATTERY_STATUS_FULL -> ChargeState.FULL
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> ChargeState.NOT_CHARGING
            else -> ChargeState.UNKNOWN
        }
        val source = when (intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)) {
            BatteryManager.BATTERY_PLUGGED_AC -> PowerSource.AC
            BatteryManager.BATTERY_PLUGGED_USB -> PowerSource.USB
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> PowerSource.WIRELESS
            8 /* BATTERY_PLUGGED_DOCK, API 33 */ -> PowerSource.DOCK
            else -> PowerSource.BATTERY
        }
        val health = when (intent.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)) {
            BatteryManager.BATTERY_HEALTH_GOOD -> BatteryHealth.GOOD
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> BatteryHealth.OVERHEAT
            BatteryManager.BATTERY_HEALTH_DEAD -> BatteryHealth.DEAD
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> BatteryHealth.OVER_VOLTAGE
            BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> BatteryHealth.FAILURE
            BatteryManager.BATTERY_HEALTH_COLD -> BatteryHealth.COLD
            else -> BatteryHealth.UNKNOWN
        }
        val tempTenths = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        val temperature: Reading<Float> =
            if (tempTenths == Int.MIN_VALUE || tempTenths <= -400 || tempTenths >= 1000) Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
            else Reading.Measured(tempTenths / 10f)

        val voltage = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
        // Some devices report volts instead of millivolts.
        val voltageReading: Reading<Int> = when {
            voltage <= 0 -> Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
            voltage < 100 -> Reading.Measured(voltage * 1000)
            else -> Reading.Measured(voltage)
        }
        val technology = intent.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY)
            ?.takeIf { it.isNotBlank() }
            ?.let { Reading.Measured(it) } ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)

        val cycleCount: Reading<Int> = if (Build.VERSION.SDK_INT >= 34) {
            val cycles = intent.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, -1)
            if (cycles >= 0) Reading.Measured(cycles) else Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        } else Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)

        val chargeCounter = longProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
        val capacityEstimate: Reading<Int> = chargeCounter.valueOrNull
            ?.takeIf { percent in 20..100 && it > 0 }
            ?.let { uah -> Reading.Estimated(((uah / 1000.0) / (percent / 100.0)).roundToInt(), "charge counter ÷ battery level") }
            ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)

        val chargeTime: Reading<Long> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && chargeState == ChargeState.CHARGING) {
            val ms = batteryManager?.computeChargeTimeRemaining() ?: -1
            if (ms > 0) Reading.Measured(ms) else Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        } else Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)

        return BatteryStatus(
            levelPercent = percent.coerceIn(0, 100),
            chargeState = chargeState,
            source = source,
            health = health,
            temperatureC = temperature,
            voltageMv = voltageReading,
            technology = technology,
            currentNowUa = currentNow(),
            chargeCounterUah = chargeCounter,
            capacityEstimateMah = capacityEstimate,
            cycleCount = cycleCount,
            chargeTimeRemainingMs = chargeTime,
            present = intent.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true),
        )
    }

    /**
     * BATTERY_PROPERTY_CURRENT_NOW is defined in microamps, but several manufacturers report
     * milliamps. Very small magnitudes are treated as milliamps and flagged as an estimate.
     */
    private fun currentNow(): Reading<Long> {
        val raw = longProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW).valueOrNull
            ?: return Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        if (raw == 0L) return Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        return if (abs(raw) < 10_000) Reading.Estimated(raw * 1000, "device reports milliamps") else Reading.Measured(raw)
    }

    private fun longProperty(id: Int): Reading<Long> {
        val bm = batteryManager ?: return Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        return try {
            val value = bm.getLongProperty(id)
            if (value == Long.MIN_VALUE || value == Int.MIN_VALUE.toLong()) Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
            else Reading.Measured(value)
        } catch (e: Exception) {
            Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        }
    }
}

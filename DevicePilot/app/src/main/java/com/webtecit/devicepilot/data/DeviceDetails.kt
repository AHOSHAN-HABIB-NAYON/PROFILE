package com.webtecit.devicepilot.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.camera2.CameraManager
import android.os.BatteryManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.content.ContextCompat
import java.io.File
import java.util.Locale
import java.util.TimeZone
import kotlin.math.sqrt

data class SimInfo(
    val slot: Int,
    val state: String,
    val carrier: String?,
    val displayName: String?,
    val country: String?,
    val roaming: Boolean?,
)

data class BatteryExtras(
    val cycleCount: Int?,
    val cycleSource: String?,
    val designCapacityMah: Int?,
    val fullCapacityMah: Int?,
    val estimatedFullMah: Int?,
    val healthPercent: Int?,
    val healthSource: String?,
    val chargingPowerW: Float?,
    val chargerMaxW: Float?,
)

data class DisplayInfo(
    val widthPx: Int, val heightPx: Int, val densityDpi: Int,
    val refreshRate: Float, val maxRefreshRate: Float, val sizeInches: Float?, val hdr: Boolean,
)

/** Static and slow-changing device facts for the Device details page. */
class DeviceDetailsReader(private val context: Context) {
    private val hardware = HardwareInfo(context)

    fun deviceName(): String {
        val n = if (Build.VERSION.SDK_INT >= 25) runCatching {
            Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
        }.getOrNull() else null
        return n?.takeIf { it.isNotBlank() } ?: "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
    }

    fun bootTime(): Long = System.currentTimeMillis() - SystemClock.elapsedRealtime()
    fun uptimeMs(): Long = SystemClock.elapsedRealtime()

    fun kernel(): String? = System.getProperty("os.version")
    fun baseband(): String? = runCatching { Build.getRadioVersion() }.getOrNull()?.takeIf { it.isNotBlank() }

    fun soc(): String? = if (Build.VERSION.SDK_INT >= 31) {
        listOf(Build.SOC_MANUFACTURER, Build.SOC_MODEL).filter { it.isNotBlank() && it != Build.UNKNOWN }
            .joinToString(" ").ifBlank { null }
    } else null

    fun locale(): String = Locale.getDefault().displayName
    fun timeZone(): String = TimeZone.getDefault().id

    fun sensorCount(): Int = runCatching {
        (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getSensorList(Sensor.TYPE_ALL).size
    }.getOrDefault(0)

    fun cameraCount(): Int = runCatching {
        (context.getSystemService(Context.CAMERA_SERVICE) as CameraManager).cameraIdList.size
    }.getOrDefault(0)

    fun features(): List<Pair<String, Boolean>> {
        val pm = context.packageManager
        return listOf(
            "NFC" to pm.hasSystemFeature(PackageManager.FEATURE_NFC),
            "Bluetooth" to pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH),
            "Bluetooth LE" to pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE),
            "Fingerprint" to pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT),
            "GPS" to pm.hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS),
            "Wi-Fi Direct" to pm.hasSystemFeature(PackageManager.FEATURE_WIFI_DIRECT),
            "Telephony" to pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY),
            "Infrared" to pm.hasSystemFeature(PackageManager.FEATURE_CONSUMER_IR),
        )
    }

    @Suppress("DEPRECATION")
    fun display(): DisplayInfo? = runCatching {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val d = wm.defaultDisplay
        val mode = d.mode
        val metrics = DisplayMetrics().also { d.getRealMetrics(it) }
        val w = mode.physicalWidth
        val h = mode.physicalHeight
        val inches = if (metrics.xdpi > 0 && metrics.ydpi > 0) {
            val wi = metrics.widthPixels / metrics.xdpi
            val hi = metrics.heightPixels / metrics.ydpi
            sqrt(wi * wi + hi * hi)
        } else null
        DisplayInfo(
            widthPx = minOf(w, h), heightPx = maxOf(w, h), densityDpi = metrics.densityDpi,
            refreshRate = d.refreshRate,
            maxRefreshRate = d.supportedModes.maxOfOrNull { it.refreshRate } ?: d.refreshRate,
            sizeInches = inches,
            hdr = d.hdrCapabilities?.supportedHdrTypes?.isNotEmpty() == true,
        )
    }.getOrNull()

    fun hasPhonePermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

    /** IMEI can only be read by regular apps up to Android 9 (with the Phone permission). */
    @SuppressLint("MissingPermission", "HardwareIds")
    fun imeis(): List<String>? {
        if (Build.VERSION.SDK_INT >= 29 || !hasPhonePermission()) return null
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return null
        return runCatching {
            @Suppress("DEPRECATION")
            (0 until tm.phoneCount).mapNotNull { slot -> if (Build.VERSION.SDK_INT >= 26) tm.getImei(slot) else tm.getDeviceId(slot) }
        }.getOrNull()?.filter { it.isNotBlank() }
    }

    @SuppressLint("MissingPermission")
    fun sims(): List<SimInfo> {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return emptyList()
        @Suppress("DEPRECATION")
        val slots = if (Build.VERSION.SDK_INT >= 30) tm.activeModemCount else tm.phoneCount
        val subs = if (hasPhonePermission()) runCatching {
            (context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager).activeSubscriptionInfoList
        }.getOrNull().orEmpty() else emptyList()
        return (0 until slots).map { slot ->
            val stateCode = if (Build.VERSION.SDK_INT >= 26) tm.getSimState(slot) else if (slot == 0) tm.simState else -1
            val sub = subs.firstOrNull { it.simSlotIndex == slot }
            SimInfo(
                slot = slot + 1,
                state = when (stateCode) {
                    TelephonyManager.SIM_STATE_READY -> "Active"
                    TelephonyManager.SIM_STATE_ABSENT -> "No SIM"
                    TelephonyManager.SIM_STATE_PIN_REQUIRED -> "PIN locked"
                    TelephonyManager.SIM_STATE_PUK_REQUIRED -> "PUK locked"
                    TelephonyManager.SIM_STATE_NETWORK_LOCKED -> "Network locked"
                    TelephonyManager.SIM_STATE_NOT_READY -> "Not ready"
                    TelephonyManager.SIM_STATE_PERM_DISABLED -> "Disabled"
                    else -> "Unknown"
                },
                carrier = sub?.carrierName?.toString()?.takeIf { it.isNotBlank() },
                displayName = sub?.displayName?.toString()?.takeIf { it.isNotBlank() },
                country = sub?.countryIso?.uppercase()?.takeIf { it.isNotBlank() },
                roaming = sub?.let { s ->
                    runCatching {
                        (context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager)
                            .isNetworkRoaming(s.subscriptionId)
                    }.getOrNull()
                },
            )
        }
    }

    fun networkOperator(): String? = runCatching {
        (context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager).networkOperatorName
    }.getOrNull()?.takeIf { it.isNotBlank() }

    private fun readSys(path: String): Long? = runCatching { File(path).readText().trim().toLong() }.getOrNull()

    /**
     * Cycle count, capacity and charging power. Values come from the battery broadcast and,
     * where the kernel allows it, from /sys/class/power_supply. Missing values stay null.
     */
    fun batteryExtras(snapshot: BatterySnapshot): BatteryExtras {
        val intent: Intent? = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val base = "/sys/class/power_supply/battery"

        var cycleSource: String? = null
        val cycle = snapshot.cycleCount?.also { cycleSource = "Android (BatteryManager)" }
            ?: readSys("$base/cycle_count")?.toInt()?.takeIf { it >= 0 }?.also { cycleSource = "$base/cycle_count" }

        var designSource: String? = null
        val design = readSys("$base/charge_full_design")?.let { toMah(it) }?.also { designSource = "sysfs" }
            ?: hardware.ratedBatteryCapacityMah()?.also { designSource = "power profile" }
        val full = readSys("$base/charge_full")?.let { toMah(it) }
        val pct = snapshot.percent
        val estimated = if (snapshot.chargeCounterMah != null && pct != null && pct >= 15) snapshot.chargeCounterMah * 100 / pct else null

        var healthSource: String? = null
        val health = when {
            full != null && design != null && design > 0 -> (full * 100 / design).also { healthSource = "charge_full / charge_full_design" }
            estimated != null && design != null && design > 0 ->
                (estimated * 100 / design).also { healthSource = "charge counter vs rated capacity ($designSource)" }
            else -> null
        }?.coerceIn(1, 100)

        val voltageV = (snapshot.voltageMv ?: 0) / 1000f
        val currentA = (snapshot.currentNowMa ?: 0) / 1000f
        val power = if (snapshot.isCharging && voltageV > 0 && currentA != 0f) kotlin.math.abs(voltageV * currentA) else null

        // Not every device includes these extras in the battery broadcast.
        val maxCurrentUa = intent?.getIntExtra("max_charging_current", -1) ?: -1
        val maxVoltageUv = intent?.getIntExtra("max_charging_voltage", -1) ?: -1
        val chargerMax = if (maxCurrentUa > 0 && maxVoltageUv > 0) maxCurrentUa / 1e6f * (maxVoltageUv / 1e6f) else null

        return BatteryExtras(cycle, cycleSource, design, full, estimated, health, healthSource,
            power?.takeIf { it in 0.1f..300f }, chargerMax?.takeIf { it in 0.5f..300f })
    }

    /** sysfs reports µAh on most kernels; some report mAh. */
    private fun toMah(v: Long): Int? = when {
        v > 100_000 -> (v / 1000).toInt()
        v in 500..20_000 -> v.toInt()
        else -> null
    }

    @Suppress("unused")
    private fun batteryManager() = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
}

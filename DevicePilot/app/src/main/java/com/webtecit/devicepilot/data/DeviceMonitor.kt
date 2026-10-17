package com.webtecit.devicepilot.data

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import com.webtecit.devicepilot.domain.MemorySnapshot
import com.webtecit.devicepilot.domain.StorageSnapshot
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.domain.ThermalLevel
import com.webtecit.devicepilot.domain.Transport
import java.io.File

data class DeviceIdentity(
    val manufacturer: String,
    val model: String,
    val brand: String,
    val androidVersion: String,
    val apiLevel: Int,
    val securityPatch: String?,
    val abi: String,
)

enum class ChargeState { CHARGING, DISCHARGING, FULL, NOT_CHARGING, UNKNOWN }

data class BatterySnapshot(
    val percent: Int?,
    val state: ChargeState,
    val plugged: String?,
    val celsius: Float?,
    val voltageMv: Int?,
    val technology: String?,
    val health: Int?,
    val currentNowMa: Int?,
    val chargeCounterMah: Int?,
    val cycleCount: Int?,
    val powerSave: Boolean?,
    val timestamp: Long,
) {
    val isCharging: Boolean get() = state == ChargeState.CHARGING || state == ChargeState.FULL
}

data class ThermalSnapshot(val level: ThermalLevel, val headroom: Float?, val supported: Boolean)

/** A temperature exposed by the Linux thermal framework, labeled with its source. */
data class SensorReading(val name: String, val celsius: Float, val source: String)

data class CpuSnapshot(
    val cores: Int,
    val currentFreqMhz: List<Int?>,
    val maxFreqMhz: List<Int?>,
    val usagePercent: Int?,
)

data class NetworkStatus(val transport: Transport, val validated: Boolean, val vpnActive: Boolean, val metered: Boolean)

/**
 * Reads real values from public Android APIs. Every reading returns null when the
 * platform does not expose it, instead of guessing a value.
 */
class DeviceMonitor(private val context: Context) {

    private val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    fun identity() = DeviceIdentity(
        manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() },
        model = Build.MODEL,
        brand = Build.BRAND,
        androidVersion = Build.VERSION.RELEASE,
        apiLevel = Build.VERSION.SDK_INT,
        securityPatch = if (Build.VERSION.SDK_INT >= 23) Build.VERSION.SECURITY_PATCH else null,
        abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "",
    )

    fun memory(): MemorySnapshot {
        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        return MemorySnapshot(info.totalMem, info.availMem, info.threshold, info.lowMemory)
    }

    val isLowRamDevice: Boolean get() = activityManager.isLowRamDevice

    fun storage(): StorageSnapshot? = runCatching {
        val stat = StatFs(Environment.getDataDirectory().path)
        StorageSnapshot(stat.totalBytes, stat.availableBytes)
    }.getOrNull()

    fun battery(): BatterySnapshot {
        val intent: Intent? = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val percent = if (level >= 0 && scale > 0) level * 100 / scale else null
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val state = when (status) {
            BatteryManager.BATTERY_STATUS_CHARGING -> ChargeState.CHARGING
            BatteryManager.BATTERY_STATUS_DISCHARGING -> ChargeState.DISCHARGING
            BatteryManager.BATTERY_STATUS_FULL -> ChargeState.FULL
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> ChargeState.NOT_CHARGING
            else -> ChargeState.UNKNOWN
        }
        val plugged = when (intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) {
            BatteryManager.BATTERY_PLUGGED_AC -> "AC"
            BatteryManager.BATTERY_PLUGGED_USB -> "USB"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
            0 -> null
            else -> "Dock"
        }
        val tempTenths = intent?.takeIf { it.hasExtra(BatteryManager.EXTRA_TEMPERATURE) }
            ?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        val voltage = intent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)?.takeIf { it > 0 }
        val technology = intent?.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY)?.takeIf { it.isNotBlank() }
        val health = intent?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)?.takeIf { it > 0 }
        val cycle = if (Build.VERSION.SDK_INT >= 34) {
            intent?.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, -1)?.takeIf { it >= 0 }
        } else null

        // CURRENT_NOW is in microamperes on most devices, but some vendors report mA.
        val currentRaw = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        val currentMa = when {
            currentRaw == Int.MIN_VALUE || currentRaw == 0 -> null
            kotlin.math.abs(currentRaw) > 20_000 -> currentRaw / 1000
            else -> currentRaw
        }
        val counter = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
            .takeIf { it != Int.MIN_VALUE && it > 0 }?.let { it / 1000 }

        return BatterySnapshot(
            percent = percent,
            state = state,
            plugged = plugged,
            celsius = TemperatureUtils.batteryCelsiusOrNull(tempTenths),
            voltageMv = voltage,
            technology = technology,
            health = health,
            currentNowMa = currentMa,
            chargeCounterMah = counter,
            cycleCount = cycle,
            powerSave = runCatching { powerManager.isPowerSaveMode }.getOrNull(),
            timestamp = System.currentTimeMillis(),
        )
    }

    fun thermal(): ThermalSnapshot {
        if (Build.VERSION.SDK_INT < 29) return ThermalSnapshot(ThermalLevel.UNKNOWN, null, false)
        val level = ThermalLevel.fromCode(powerManager.currentThermalStatus)
        val headroom = if (Build.VERSION.SDK_INT >= 30) {
            runCatching { powerManager.getThermalHeadroom(10) }.getOrNull()?.takeIf { !it.isNaN() }
        } else null
        return ThermalSnapshot(level, headroom, true)
    }

    /**
     * Thermal zones under /sys/class/thermal. Many devices block this directory for apps
     * (SELinux), in which case an empty list is returned and the UI says "not accessible".
     */
    fun thermalZones(): List<SensorReading> = runCatching {
        val dir = File("/sys/class/thermal")
        dir.listFiles { f -> f.name.startsWith("thermal_zone") }.orEmpty()
            .sortedBy { it.name.removePrefix("thermal_zone").toIntOrNull() ?: 0 }
            .mapNotNull { zone ->
                val raw = runCatching { File(zone, "temp").readText().trim().toLong() }.getOrNull()
                    ?: return@mapNotNull null
                val type = runCatching { File(zone, "type").readText().trim() }.getOrNull() ?: zone.name
                val c = TemperatureUtils.normalizeThermalZone(raw) ?: return@mapNotNull null
                SensorReading(type, c, "${zone.path}/temp")
            }
    }.getOrDefault(emptyList())

    private var lastCpuTotal = 0L
    private var lastCpuIdle = 0L

    fun cpu(): CpuSnapshot {
        val cores = Runtime.getRuntime().availableProcessors()
        val cur = (0 until cores).map { readFreqMhz(it, "scaling_cur_freq") }
        val max = (0 until cores).map { readFreqMhz(it, "cpuinfo_max_freq") }
        return CpuSnapshot(cores, cur, max, readProcStatUsage())
    }

    private fun readFreqMhz(core: Int, file: String): Int? = runCatching {
        File("/sys/devices/system/cpu/cpu$core/cpufreq/$file").readText().trim().toLong().div(1000).toInt()
    }.getOrNull()?.takeIf { it > 0 }

    /** /proc/stat is readable only up to Android 7.1; later versions block it for privacy. */
    private fun readProcStatUsage(): Int? {
        if (Build.VERSION.SDK_INT >= 26) return null
        return runCatching {
            val parts = File("/proc/stat").useLines { it.first() }.split(Regex("\\s+")).drop(1).mapNotNull { it.toLongOrNull() }
            val idle = parts[3] + parts.getOrElse(4) { 0 }
            val total = parts.sum()
            val dTotal = total - lastCpuTotal
            val dIdle = idle - lastCpuIdle
            val first = lastCpuTotal == 0L
            lastCpuTotal = total; lastCpuIdle = idle
            if (first || dTotal <= 0) null else ((dTotal - dIdle) * 100 / dTotal).toInt().coerceIn(0, 100)
        }.getOrNull()
    }

    fun network(): NetworkStatus {
        val net = connectivity.activeNetwork ?: return NetworkStatus(Transport.NONE, false, false, false)
        val caps = connectivity.getNetworkCapabilities(net) ?: return NetworkStatus(Transport.NONE, false, false, false)
        val transport = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Transport.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Transport.MOBILE
            else -> Transport.OTHER
        }
        val vpn = connectivity.allNetworks.any {
            connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
        }
        return NetworkStatus(
            transport = transport,
            validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            vpnActive = vpn,
            metered = connectivity.isActiveNetworkMetered,
        )
    }

    /** Animation scales are public read-only global settings. */
    fun animationScales(): Triple<Float?, Float?, Float?> {
        val r = context.contentResolver
        fun read(key: String) = runCatching { Settings.Global.getFloat(r, key) }.getOrNull()
        return Triple(
            read(Settings.Global.WINDOW_ANIMATION_SCALE),
            read(Settings.Global.TRANSITION_ANIMATION_SCALE),
            read(Settings.Global.ANIMATOR_DURATION_SCALE),
        )
    }

    fun developerOptionsEnabled(): Boolean = runCatching {
        Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1
    }.getOrDefault(false)

    fun isIgnoringBatteryOptimizations(): Boolean =
        powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

data class StorageCategories(
    val apps: Long,
    val images: Long,
    val video: Long,
    val audio: Long,
    val totalUser: Long,
)

/** Category breakdown from StorageStatsManager (Android 8+, needs Usage Access). */
fun DeviceMonitor.storageCategories(context: Context): StorageCategories? {
    if (Build.VERSION.SDK_INT < 26) return null
    return runCatching {
        val ssm = context.getSystemService(Context.STORAGE_STATS_SERVICE) as android.app.usage.StorageStatsManager
        val user = android.os.Process.myUserHandle()
        val uuid = android.os.storage.StorageManager.UUID_DEFAULT
        val ext = ssm.queryExternalStatsForUser(uuid, user)
        val apps = ssm.queryStatsForUser(uuid, user)
        StorageCategories(
            apps = apps.appBytes + apps.dataBytes,
            images = ext.imageBytes,
            video = ext.videoBytes,
            audio = ext.audioBytes,
            totalUser = ext.totalBytes,
        )
    }.getOrNull()
}

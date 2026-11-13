package com.webtecit.devicepilot.data.repository

import android.app.ActivityManager
import android.app.usage.StorageStatsManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import android.os.storage.StorageManager
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.domain.model.CoreFrequency
import com.webtecit.devicepilot.domain.model.CpuStatus
import com.webtecit.devicepilot.domain.model.MemoryStatus
import com.webtecit.devicepilot.domain.model.StorageStatus
import com.webtecit.devicepilot.domain.model.ThermalLevel
import com.webtecit.devicepilot.domain.model.ThermalStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SystemRepository @Inject constructor(@ApplicationContext private val context: Context) {

    private val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    fun memory(): MemoryStatus {
        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        return MemoryStatus(info.totalMem, info.availMem, info.threshold, info.lowMemory)
    }

    fun isLowRamDevice(): Boolean = activityManager.isLowRamDevice

    fun memoryClassMb(): Int = activityManager.memoryClass

    /** Internal storage (the data partition), using StorageStatsManager on Android 8+ for the advertised total. */
    fun storage(): StorageStatus {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val ssm = context.getSystemService(StorageStatsManager::class.java)
                val total = ssm.getTotalBytes(StorageManager.UUID_DEFAULT)
                val free = ssm.getFreeBytes(StorageManager.UUID_DEFAULT)
                if (total > 0) return StorageStatus(total, free)
            } catch (_: Exception) {
                // Fall back to StatFs below.
            }
        }
        val stat = StatFs(Environment.getDataDirectory().path)
        return StorageStatus(stat.totalBytes, stat.availableBytes)
    }

    fun cpu(): CpuStatus {
        val count = Runtime.getRuntime().availableProcessors()
        val coreCount = maxOf(count, countCoreDirs())
        val cores = (0 until coreCount).map { i ->
            val base = "/sys/devices/system/cpu/cpu$i/cpufreq"
            CoreFrequency(
                core = i,
                currentKhz = readLong("$base/scaling_cur_freq"),
                minKhz = readLong("$base/cpuinfo_min_freq"),
                maxKhz = readLong("$base/cpuinfo_max_freq"),
            )
        }
        val readable = cores.filter { it.currentKhz != null && it.maxKhz != null && it.maxKhz > 0 }
        val load: Reading<Float> = if (readable.isEmpty()) {
            Reading.Unavailable(UnavailableReason.RESTRICTED)
        } else {
            val avg = readable.map { c ->
                val min = c.minKhz ?: 0
                val span = (c.maxKhz!! - min).coerceAtLeast(1)
                ((c.currentKhz!! - min).toFloat() / span).coerceIn(0f, 1f)
            }.average().toFloat()
            Reading.Estimated(avg * 100f, "average core frequency relative to its range")
        }
        val (temp, source) = cpuTemperature()
        return CpuStatus(coreCount, cores, load, temp, source)
    }

    /**
     * Tries the kernel thermal zones. Many devices block these files; then CPU temperature is
     * reported as restricted instead of substituting the battery temperature.
     */
    private fun cpuTemperature(): Pair<Reading<Float>, String?> {
        val zones = File("/sys/class/thermal").listFiles { f -> f.name.startsWith("thermal_zone") } ?: return Reading.Unavailable(UnavailableReason.RESTRICTED) to null
        val preferred = listOf("cpu", "soc", "tsens", "mtktscpu", "ap", "cluster")
        val candidates = zones.mapNotNull { zone ->
            val type = runCatching { File(zone, "type").readText().trim() }.getOrNull() ?: return@mapNotNull null
            val raw = runCatching { File(zone, "temp").readText().trim().toLong() }.getOrNull() ?: return@mapNotNull null
            val c = if (raw > 1000) raw / 1000f else raw.toFloat()
            if (c in 10f..120f) Triple(type, c, preferred.indexOfFirst { type.lowercase().contains(it) }) else null
        }.filter { it.third >= 0 && !it.first.lowercase().contains("batt") }
        val best = candidates.minByOrNull { it.third } ?: return Reading.Unavailable(UnavailableReason.RESTRICTED) to null
        return Reading.Measured(best.second) to best.first
    }

    fun thermal(): ThermalStatus {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return ThermalStatus(Reading.Unavailable(UnavailableReason.NOT_SUPPORTED), Reading.Unavailable(UnavailableReason.NOT_SUPPORTED))
        }
        val level = when (powerManager.currentThermalStatus) {
            PowerManager.THERMAL_STATUS_NONE -> ThermalLevel.NONE
            PowerManager.THERMAL_STATUS_LIGHT -> ThermalLevel.LIGHT
            PowerManager.THERMAL_STATUS_MODERATE -> ThermalLevel.MODERATE
            PowerManager.THERMAL_STATUS_SEVERE -> ThermalLevel.SEVERE
            PowerManager.THERMAL_STATUS_CRITICAL -> ThermalLevel.CRITICAL
            PowerManager.THERMAL_STATUS_EMERGENCY -> ThermalLevel.EMERGENCY
            PowerManager.THERMAL_STATUS_SHUTDOWN -> ThermalLevel.SHUTDOWN
            else -> null
        }
        val headroom: Reading<Float> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val h = runCatching { powerManager.getThermalHeadroom(10) }.getOrDefault(Float.NaN)
            if (h.isNaN()) Reading.Unavailable(UnavailableReason.NOT_AVAILABLE) else Reading.Measured(h)
        } else Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        return ThermalStatus(Reading.ofNullable(level), headroom)
    }

    fun isPowerSaveMode(): Boolean = powerManager.isPowerSaveMode

    fun processorName(): Reading<String> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val soc = listOf(Build.SOC_MANUFACTURER, Build.SOC_MODEL)
                .filter { it.isNotBlank() && it != Build.UNKNOWN }
                .joinToString(" ")
            if (soc.isNotBlank()) return Reading.Measured(soc)
        }
        val hardware = runCatching {
            File("/proc/cpuinfo").readLines()
                .firstOrNull { it.startsWith("Hardware", ignoreCase = true) || it.startsWith("model name", ignoreCase = true) }
                ?.substringAfter(":")?.trim()
        }.getOrNull()
        if (!hardware.isNullOrBlank()) return Reading.Measured(hardware)
        return if (Build.HARDWARE.isNotBlank()) Reading.Measured("${Build.HARDWARE} (board)") else Reading.Unavailable(UnavailableReason.RESTRICTED)
    }

    fun kernelVersion(): Reading<String> =
        System.getProperty("os.version")?.takeIf { it.isNotBlank() }?.let { Reading.Measured(it) }
            ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)

    fun uptimeMillis(): Long = android.os.SystemClock.elapsedRealtime()

    private fun countCoreDirs(): Int =
        File("/sys/devices/system/cpu").listFiles { f -> f.name.matches(Regex("cpu\\d+")) }?.size ?: 0

    private fun readLong(path: String): Long? =
        runCatching { File(path).readText().trim().toLong() }.getOrNull()
}

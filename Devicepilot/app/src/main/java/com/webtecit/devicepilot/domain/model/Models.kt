package com.webtecit.devicepilot.domain.model

import android.net.Uri
import com.webtecit.devicepilot.core.common.Reading

// ---------------------------------------------------------------- Battery

enum class ChargeState(val label: String) {
    CHARGING("Charging"), DISCHARGING("Discharging"), FULL("Full"), NOT_CHARGING("Not charging"), UNKNOWN("Unknown")
}

enum class PowerSource(val label: String) {
    AC("AC charger"), USB("USB"), WIRELESS("Wireless"), DOCK("Dock"), BATTERY("On battery")
}

/** Values from BatteryManager.EXTRA_HEALTH — the only health signal Android exposes publicly. */
enum class BatteryHealth(val label: String) {
    GOOD("Good"), OVERHEAT("Overheating"), DEAD("Dead"), OVER_VOLTAGE("Over voltage"),
    FAILURE("Failure"), COLD("Cold"), UNKNOWN("Unknown")
}

data class BatteryStatus(
    val levelPercent: Int,
    val chargeState: ChargeState,
    val source: PowerSource,
    val health: BatteryHealth,
    val temperatureC: Reading<Float>,
    val voltageMv: Reading<Int>,
    val technology: Reading<String>,
    val currentNowUa: Reading<Long>,
    val chargeCounterUah: Reading<Long>,
    val capacityEstimateMah: Reading<Int>,
    val cycleCount: Reading<Int>,
    val chargeTimeRemainingMs: Reading<Long>,
    val present: Boolean,
    val timestamp: Long = System.currentTimeMillis(),
) {
    val isPluggedIn: Boolean get() = source != PowerSource.BATTERY
    val isCharging: Boolean get() = chargeState == ChargeState.CHARGING
}

// ---------------------------------------------------------------- Memory / storage / CPU / thermal

data class MemoryStatus(
    val totalBytes: Long,
    val availableBytes: Long,
    val thresholdBytes: Long,
    val lowMemory: Boolean,
) {
    val usedBytes: Long get() = (totalBytes - availableBytes).coerceAtLeast(0)
    val usedFraction: Float get() = if (totalBytes > 0) usedBytes.toFloat() / totalBytes else 0f
    val availableFraction: Float get() = if (totalBytes > 0) availableBytes.toFloat() / totalBytes else 0f
}

data class StorageStatus(val totalBytes: Long, val freeBytes: Long) {
    val usedBytes: Long get() = (totalBytes - freeBytes).coerceAtLeast(0)
    val usedFraction: Float get() = if (totalBytes > 0) usedBytes.toFloat() / totalBytes else 0f
    val freeFraction: Float get() = if (totalBytes > 0) freeBytes.toFloat() / totalBytes else 0f
}

data class CoreFrequency(val core: Int, val currentKhz: Long?, val minKhz: Long?, val maxKhz: Long?)

data class CpuStatus(
    val coreCount: Int,
    val cores: List<CoreFrequency>,
    /** Android 8+ blocks /proc/stat, so load is estimated from core frequencies when they are readable. */
    val load: Reading<Float>,
    val temperatureC: Reading<Float>,
    val temperatureSource: String?,
)

enum class ThermalLevel(val label: String) {
    NONE("Normal"), LIGHT("Light"), MODERATE("Moderate"), SEVERE("Severe"),
    CRITICAL("Critical"), EMERGENCY("Emergency"), SHUTDOWN("Shutdown")
}

data class ThermalStatus(val level: Reading<ThermalLevel>, val headroom: Reading<Float>)

// ---------------------------------------------------------------- Network

enum class ConnectionType(val label: String) {
    WIFI("Wi-Fi"), CELLULAR("Mobile data"), ETHERNET("Ethernet"), VPN("VPN"), OTHER("Other"), NONE("Offline")
}

data class WifiDetails(
    val ssid: Reading<String>,
    val rssiDbm: Reading<Int>,
    val linkSpeedMbps: Reading<Int>,
    val frequencyMhz: Reading<Int>,
    val standard: Reading<String>,
)

data class NetworkStatus(
    val connected: Boolean,
    val type: ConnectionType,
    val validated: Boolean,
    val metered: Boolean,
    val downstreamKbps: Reading<Int>,
    val upstreamKbps: Reading<Int>,
    val wifi: WifiDetails?,
    val localAddresses: List<String>,
    val dnsServers: List<String>,
    val interfaceName: String?,
)

data class TrafficSnapshot(val rxBytesPerSec: Long, val txBytesPerSec: Long, val totalRx: Long, val totalTx: Long)

// ---------------------------------------------------------------- Storage analyzer

enum class FileCategory(val label: String) {
    IMAGES("Images"), VIDEOS("Videos"), AUDIO("Audio"), DOCUMENTS("Documents"),
    DOWNLOADS("Downloads"), APKS("APK files"), ARCHIVES("Archives"), OTHER("Other")
}

data class FileItem(
    val uri: Uri,
    val name: String,
    val sizeBytes: Long,
    val location: String,
    val mimeType: String?,
    val modifiedMillis: Long,
    val category: FileCategory,
    /** True when the file came from a user-picked folder (Storage Access Framework) instead of MediaStore. */
    val fromDocumentTree: Boolean = false,
)

data class CategoryStat(val category: FileCategory, val count: Int, val bytes: Long)

data class DuplicateGroup(val hash: String, val files: List<FileItem>) {
    val sizeBytes: Long get() = files.firstOrNull()?.sizeBytes ?: 0
    val recoverableBytes: Long get() = sizeBytes * (files.size - 1)
}

data class FolderScanResult(
    val rootName: String,
    val files: List<FileItem>,
    val emptyFolders: List<FileItem>,
    val scannedFiles: Int,
    val scannedFolders: Int,
)

// ---------------------------------------------------------------- Apps

data class AppEntry(
    val packageName: String,
    val label: String,
    val versionName: String?,
    val versionCode: Long,
    val firstInstallTime: Long,
    val lastUpdateTime: Long,
    val isSystem: Boolean,
    val targetSdk: Int,
    val minSdk: Int?,
    val installer: String?,
)

data class AppSize(val appBytes: Long, val dataBytes: Long, val cacheBytes: Long) {
    val totalBytes: Long get() = appBytes + dataBytes + cacheBytes
}

data class AppPermission(val name: String, val granted: Boolean, val dangerous: Boolean)

data class AppUsage(val packageName: String, val label: String, val foregroundMillis: Long, val lastUsed: Long)

// ---------------------------------------------------------------- Device info / report

data class InfoSection(val title: String, val rows: List<Pair<String, String>>)

data class DisplayInfo(
    val widthPx: Int,
    val heightPx: Int,
    val densityDpi: Int,
    val densityBucket: String,
    val xdpi: Float,
    val ydpi: Float,
    val diagonalInches: Reading<Float>,
    val refreshRate: Float,
    val supportedRefreshRates: List<Float>,
    val hdrTypes: List<String>,
    val isWideColorGamut: Reading<Boolean>,
)

// ---------------------------------------------------------------- Charging history

data class ChargingSession(
    val id: Long,
    val startTime: Long,
    val endTime: Long?,
    val startLevel: Int,
    val endLevel: Int?,
    val source: String,
    val maxTemperatureC: Float?,
)

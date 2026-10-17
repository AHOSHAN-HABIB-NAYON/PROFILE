package com.webtecit.devicepilot.domain

enum class Pressure { LOW, MODERATE, HIGH }

data class MemorySnapshot(
    val totalBytes: Long,
    val availableBytes: Long,
    val thresholdBytes: Long,
    val lowMemory: Boolean,
) {
    val usedBytes: Long get() = (totalBytes - availableBytes).coerceAtLeast(0)
    val usedPercent: Int get() = Formatters.percent(usedBytes, totalBytes)

    /**
     * Estimated pressure. Android reports lowMemory itself; otherwise we use the share
     * of RAM in use. Android intentionally keeps RAM full of cached apps, so high usage
     * on its own is normal and is only reported as "moderate".
     */
    val pressure: Pressure
        get() = when {
            lowMemory -> Pressure.HIGH
            totalBytes > 0 && availableBytes < thresholdBytes * 2 -> Pressure.HIGH
            usedPercent >= 85 -> Pressure.MODERATE
            else -> Pressure.LOW
        }
}

data class StorageSnapshot(val totalBytes: Long, val freeBytes: Long) {
    val usedBytes: Long get() = (totalBytes - freeBytes).coerceAtLeast(0)
    val usedPercent: Int get() = Formatters.percent(usedBytes, totalBytes)
    val freePercent: Int get() = 100 - usedPercent

    val pressure: Pressure
        get() = when {
            totalBytes <= 0 -> Pressure.LOW
            freeBytes < 1L * GB || freePercent < 5 -> Pressure.HIGH
            freeBytes < 4L * GB || freePercent < 15 -> Pressure.MODERATE
            else -> Pressure.LOW
        }

    companion object {
        const val GB = 1024L * 1024L * 1024L
    }
}

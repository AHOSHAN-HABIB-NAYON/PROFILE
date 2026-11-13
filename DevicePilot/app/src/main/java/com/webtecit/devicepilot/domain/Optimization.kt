package com.webtecit.devicepilot.domain

enum class FindingStatus { OK, SUGGESTION, NEEDS_APPROVAL, UNSUPPORTED }

enum class FindingId {
    STORAGE, MEMORY, BATTERY_TEMP, THERMAL, NETWORK_USAGE, BACKGROUND_BATTERY,
    UPDATES, ANIMATIONS, UNUSED_APPS, POWER_SAVER
}

/** Settings destination a finding can open. Mapped to real intents in the UI layer. */
enum class SettingsTarget {
    NONE, STORAGE, MEMORY_APPS, BATTERY, BATTERY_OPTIMIZATION, DEVELOPER_OPTIONS,
    USAGE_ACCESS, DATA_USAGE, SYSTEM_UPDATE, APP_LIST, PLAY_STORE_UPDATES
}

data class Finding(val id: FindingId, val status: FindingStatus, val target: SettingsTarget)

data class OptimizationInputs(
    val storage: StorageSnapshot?,
    val memory: MemorySnapshot?,
    val batteryCelsius: Float?,
    val thermal: ThermalLevel?,
    val usageAccess: Boolean,
    /** Bytes of total network usage in the last 7 days, null when not accessible. */
    val weeklyDataBytes: Long?,
    /** Animator duration scale, null if unreadable. */
    val animatorScale: Float?,
    val developerOptionsEnabled: Boolean,
    /** Number of user apps not opened in 30 days, null without usage access. */
    val unusedApps: Int?,
    val powerSaveMode: Boolean?,
    val batteryOptimizationSupported: Boolean,
)

object OptimizationEngine {

    const val HEAVY_WEEKLY_DATA = 10L * 1024 * 1024 * 1024

    fun analyze(i: OptimizationInputs): List<Finding> = buildList {
        add(when (i.storage?.pressure) {
            null -> Finding(FindingId.STORAGE, FindingStatus.UNSUPPORTED, SettingsTarget.STORAGE)
            Pressure.LOW -> Finding(FindingId.STORAGE, FindingStatus.OK, SettingsTarget.STORAGE)
            else -> Finding(FindingId.STORAGE, FindingStatus.SUGGESTION, SettingsTarget.STORAGE)
        })
        add(when (i.memory?.pressure) {
            null -> Finding(FindingId.MEMORY, FindingStatus.UNSUPPORTED, SettingsTarget.NONE)
            Pressure.HIGH -> Finding(FindingId.MEMORY, FindingStatus.SUGGESTION, SettingsTarget.MEMORY_APPS)
            else -> Finding(FindingId.MEMORY, FindingStatus.OK, SettingsTarget.NONE)
        })
        add(when {
            i.batteryCelsius == null -> Finding(FindingId.BATTERY_TEMP, FindingStatus.UNSUPPORTED, SettingsTarget.NONE)
            i.batteryCelsius >= 40f -> Finding(FindingId.BATTERY_TEMP, FindingStatus.SUGGESTION, SettingsTarget.BATTERY)
            else -> Finding(FindingId.BATTERY_TEMP, FindingStatus.OK, SettingsTarget.NONE)
        })
        add(when {
            i.thermal == null || i.thermal == ThermalLevel.UNKNOWN ->
                Finding(FindingId.THERMAL, FindingStatus.UNSUPPORTED, SettingsTarget.NONE)
            i.thermal.code >= ThermalLevel.MODERATE.code ->
                Finding(FindingId.THERMAL, FindingStatus.SUGGESTION, SettingsTarget.NONE)
            else -> Finding(FindingId.THERMAL, FindingStatus.OK, SettingsTarget.NONE)
        })
        add(when {
            !i.usageAccess -> Finding(FindingId.NETWORK_USAGE, FindingStatus.NEEDS_APPROVAL, SettingsTarget.USAGE_ACCESS)
            i.weeklyDataBytes == null -> Finding(FindingId.NETWORK_USAGE, FindingStatus.UNSUPPORTED, SettingsTarget.DATA_USAGE)
            i.weeklyDataBytes >= HEAVY_WEEKLY_DATA -> Finding(FindingId.NETWORK_USAGE, FindingStatus.SUGGESTION, SettingsTarget.DATA_USAGE)
            else -> Finding(FindingId.NETWORK_USAGE, FindingStatus.OK, SettingsTarget.DATA_USAGE)
        })
        add(
            if (i.batteryOptimizationSupported)
                Finding(FindingId.BACKGROUND_BATTERY, FindingStatus.NEEDS_APPROVAL, SettingsTarget.BATTERY_OPTIMIZATION)
            else Finding(FindingId.BACKGROUND_BATTERY, FindingStatus.UNSUPPORTED, SettingsTarget.BATTERY)
        )
        add(Finding(FindingId.UPDATES, FindingStatus.NEEDS_APPROVAL, SettingsTarget.SYSTEM_UPDATE))
        add(when {
            i.animatorScale == null -> Finding(FindingId.ANIMATIONS, FindingStatus.UNSUPPORTED, SettingsTarget.DEVELOPER_OPTIONS)
            i.animatorScale > 0.5f -> Finding(FindingId.ANIMATIONS, FindingStatus.SUGGESTION, SettingsTarget.DEVELOPER_OPTIONS)
            else -> Finding(FindingId.ANIMATIONS, FindingStatus.OK, SettingsTarget.DEVELOPER_OPTIONS)
        })
        add(when {
            !i.usageAccess -> Finding(FindingId.UNUSED_APPS, FindingStatus.NEEDS_APPROVAL, SettingsTarget.USAGE_ACCESS)
            i.unusedApps == null -> Finding(FindingId.UNUSED_APPS, FindingStatus.UNSUPPORTED, SettingsTarget.APP_LIST)
            i.unusedApps > 0 -> Finding(FindingId.UNUSED_APPS, FindingStatus.SUGGESTION, SettingsTarget.APP_LIST)
            else -> Finding(FindingId.UNUSED_APPS, FindingStatus.OK, SettingsTarget.APP_LIST)
        })
        add(when (i.powerSaveMode) {
            null -> Finding(FindingId.POWER_SAVER, FindingStatus.UNSUPPORTED, SettingsTarget.BATTERY)
            true -> Finding(FindingId.POWER_SAVER, FindingStatus.OK, SettingsTarget.BATTERY)
            false -> Finding(FindingId.POWER_SAVER, FindingStatus.OK, SettingsTarget.BATTERY)
        })
    }

    data class Summary(val ok: Int, val suggestions: Int, val needsApproval: Int, val unsupported: Int)

    fun summarize(findings: List<Finding>) = Summary(
        ok = findings.count { it.status == FindingStatus.OK },
        suggestions = findings.count { it.status == FindingStatus.SUGGESTION },
        needsApproval = findings.count { it.status == FindingStatus.NEEDS_APPROVAL },
        unsupported = findings.count { it.status == FindingStatus.UNSUPPORTED },
    )
}

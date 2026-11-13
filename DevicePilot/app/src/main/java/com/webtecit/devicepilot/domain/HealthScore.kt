package com.webtecit.devicepilot.domain

enum class FactorStatus { GOOD, WARNING, BAD, UNAVAILABLE }

enum class HealthFactorId { STORAGE, MEMORY, THERMAL, BATTERY_TEMP, BATTERY_LEVEL }

data class HealthFactor(val id: HealthFactorId, val status: FactorStatus, val deduction: Int)

data class HealthResult(val score: Int, val factors: List<HealthFactor>) {
    val measuredFactors: Int get() = factors.count { it.status != FactorStatus.UNAVAILABLE }
}

data class HealthInputs(
    val storage: StorageSnapshot?,
    val memory: MemorySnapshot?,
    val thermal: ThermalLevel?,
    val batteryCelsius: Float?,
    val batteryPercent: Int?,
    val charging: Boolean,
)

/**
 * A transparent, rule-based score made by DevicePilot. It is NOT an official Android
 * measurement: each rule and its deduction is shown to the user.
 */
object HealthScoreCalculator {

    fun calculate(i: HealthInputs): HealthResult {
        val factors = listOf(storage(i.storage), memory(i.memory), thermal(i.thermal),
            batteryTemp(i.batteryCelsius), batteryLevel(i.batteryPercent, i.charging))
        val score = (100 - factors.sumOf { it.deduction }).coerceIn(0, 100)
        return HealthResult(score, factors)
    }

    private fun storage(s: StorageSnapshot?) = when (s?.pressure) {
        null -> HealthFactor(HealthFactorId.STORAGE, FactorStatus.UNAVAILABLE, 0)
        Pressure.LOW -> HealthFactor(HealthFactorId.STORAGE, FactorStatus.GOOD, 0)
        Pressure.MODERATE -> HealthFactor(HealthFactorId.STORAGE, FactorStatus.WARNING, 10)
        Pressure.HIGH -> HealthFactor(HealthFactorId.STORAGE, FactorStatus.BAD, 25)
    }

    private fun memory(m: MemorySnapshot?) = when (m?.pressure) {
        null -> HealthFactor(HealthFactorId.MEMORY, FactorStatus.UNAVAILABLE, 0)
        Pressure.LOW -> HealthFactor(HealthFactorId.MEMORY, FactorStatus.GOOD, 0)
        Pressure.MODERATE -> HealthFactor(HealthFactorId.MEMORY, FactorStatus.WARNING, 5)
        Pressure.HIGH -> HealthFactor(HealthFactorId.MEMORY, FactorStatus.BAD, 15)
    }

    private fun thermal(t: ThermalLevel?) = when {
        t == null || t == ThermalLevel.UNKNOWN -> HealthFactor(HealthFactorId.THERMAL, FactorStatus.UNAVAILABLE, 0)
        t == ThermalLevel.NONE -> HealthFactor(HealthFactorId.THERMAL, FactorStatus.GOOD, 0)
        t == ThermalLevel.LIGHT -> HealthFactor(HealthFactorId.THERMAL, FactorStatus.WARNING, 5)
        t == ThermalLevel.MODERATE -> HealthFactor(HealthFactorId.THERMAL, FactorStatus.WARNING, 12)
        else -> HealthFactor(HealthFactorId.THERMAL, FactorStatus.BAD, 30)
    }

    /** General guidance only; the Android thermal status above is the authoritative signal. */
    private fun batteryTemp(c: Float?) = when {
        c == null -> HealthFactor(HealthFactorId.BATTERY_TEMP, FactorStatus.UNAVAILABLE, 0)
        c >= 45f -> HealthFactor(HealthFactorId.BATTERY_TEMP, FactorStatus.BAD, 15)
        c >= 40f -> HealthFactor(HealthFactorId.BATTERY_TEMP, FactorStatus.WARNING, 5)
        else -> HealthFactor(HealthFactorId.BATTERY_TEMP, FactorStatus.GOOD, 0)
    }

    private fun batteryLevel(p: Int?, charging: Boolean) = when {
        p == null || p < 0 -> HealthFactor(HealthFactorId.BATTERY_LEVEL, FactorStatus.UNAVAILABLE, 0)
        p < 15 && !charging -> HealthFactor(HealthFactorId.BATTERY_LEVEL, FactorStatus.WARNING, 5)
        else -> HealthFactor(HealthFactorId.BATTERY_LEVEL, FactorStatus.GOOD, 0)
    }
}

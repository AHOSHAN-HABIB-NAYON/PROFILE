package com.webtecit.devicepilot.domain.usecase

import com.webtecit.devicepilot.domain.model.BatteryHealth
import com.webtecit.devicepilot.domain.model.ThermalLevel
import javax.inject.Inject

/**
 * Device health score (0–100).
 *
 * Methodology (also shown to the user in the app):
 *  - Battery health status (BatteryManager)   weight 25
 *  - Battery temperature                       weight 20
 *  - Free storage                              weight 25
 *  - Available RAM                             weight 15
 *  - Thermal status (Android 10+)              weight 15
 *
 * Each component is scored 0–100 from measured data only. Components that the device does not
 * report are left out and the remaining weights are re-normalised. If fewer than
 * [MIN_COMPONENTS] components are available, no score is produced.
 */
class HealthScoreCalculator @Inject constructor() {

    data class Inputs(
        val batteryHealth: BatteryHealth?,
        val batteryTemperatureC: Float?,
        val storageFreeFraction: Float?,
        val ramAvailableFraction: Float?,
        val thermalLevel: ThermalLevel?,
    )

    data class Component(val name: String, val score: Int, val weight: Int, val detail: String)

    data class Result(val score: Int?, val components: List<Component>, val missing: List<String>) {
        val sufficient: Boolean get() = score != null
        val label: String
            get() = when {
                score == null -> "Insufficient data"
                score >= 85 -> "Excellent"
                score >= 70 -> "Good"
                score >= 50 -> "Fair"
                else -> "Needs attention"
            }
    }

    fun calculate(inputs: Inputs): Result {
        val components = mutableListOf<Component>()
        val missing = mutableListOf<String>()

        val healthScore = inputs.batteryHealth?.let { batteryHealthScore(it) }
        if (healthScore != null) components += Component("Battery health", healthScore, 25, inputs.batteryHealth.label)
        else missing += "Battery health"

        inputs.batteryTemperatureC?.let {
            components += Component("Battery temperature", temperatureScore(it), 20, "%.1f °C".format(it))
        } ?: run { missing += "Battery temperature" }

        inputs.storageFreeFraction?.let {
            components += Component("Free storage", storageScore(it), 25, "%.0f%% free".format(it * 100))
        } ?: run { missing += "Free storage" }

        inputs.ramAvailableFraction?.let {
            components += Component("Available RAM", ramScore(it), 15, "%.0f%% available".format(it * 100))
        } ?: run { missing += "Available RAM" }

        inputs.thermalLevel?.let {
            components += Component("Thermal status", thermalScore(it), 15, it.label)
        } ?: run { missing += "Thermal status" }

        if (components.size < MIN_COMPONENTS) return Result(null, components, missing)
        val totalWeight = components.sumOf { it.weight }
        val weighted = components.sumOf { it.score * it.weight }.toDouble() / totalWeight
        return Result(weighted.toInt().coerceIn(0, 100), components, missing)
    }

    /** UNKNOWN is not a measurement, so it is excluded rather than guessed. */
    internal fun batteryHealthScore(health: BatteryHealth): Int? = when (health) {
        BatteryHealth.GOOD -> 100
        BatteryHealth.COLD -> 60
        BatteryHealth.OVERHEAT -> 30
        BatteryHealth.OVER_VOLTAGE -> 20
        BatteryHealth.FAILURE -> 10
        BatteryHealth.DEAD -> 0
        BatteryHealth.UNKNOWN -> null
    }

    internal fun temperatureScore(c: Float): Int = when {
        c <= 35f -> 100
        c <= 40f -> lerp(100f, 70f, (c - 35f) / 5f)
        c <= 45f -> lerp(70f, 30f, (c - 40f) / 5f)
        c <= 50f -> lerp(30f, 0f, (c - 45f) / 5f)
        else -> 0
    }

    internal fun storageScore(free: Float): Int = when {
        free >= 0.20f -> 100
        free >= 0.10f -> lerp(60f, 100f, (free - 0.10f) / 0.10f)
        free >= 0.05f -> lerp(30f, 60f, (free - 0.05f) / 0.05f)
        else -> lerp(0f, 30f, (free / 0.05f).coerceAtLeast(0f))
    }

    internal fun ramScore(available: Float): Int = when {
        available >= 0.30f -> 100
        available >= 0.15f -> lerp(70f, 100f, (available - 0.15f) / 0.15f)
        else -> lerp(30f, 70f, (available / 0.15f).coerceAtLeast(0f))
    }

    internal fun thermalScore(level: ThermalLevel): Int = when (level) {
        ThermalLevel.NONE -> 100
        ThermalLevel.LIGHT -> 85
        ThermalLevel.MODERATE -> 65
        ThermalLevel.SEVERE -> 40
        ThermalLevel.CRITICAL -> 15
        ThermalLevel.EMERGENCY, ThermalLevel.SHUTDOWN -> 0
    }

    private fun lerp(a: Float, b: Float, t: Float): Int = (a + (b - a) * t.coerceIn(0f, 1f)).toInt()

    companion object {
        const val MIN_COMPONENTS = 3

        val METHODOLOGY = """
            The score combines only values measured on this device:
            • Battery health status (25%) — from Android's BatteryManager
            • Battery temperature (20%) — 100 up to 35 °C, falling to 0 at 50 °C
            • Free storage (25%) — 100 at 20% free or more
            • Available RAM (15%) — 100 at 30% available or more
            • Thermal status (15%) — Android 10 and newer

            Values your device does not report are left out and the other weights are scaled up. With fewer than 3 measured values, no score is shown.
        """.trimIndent()
    }
}

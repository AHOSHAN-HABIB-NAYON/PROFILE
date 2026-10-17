package com.webtecit.devicepilot.domain

import java.util.Locale

enum class TemperatureUnit { CELSIUS, FAHRENHEIT }

object TemperatureUtils {

    /** BatteryManager.EXTRA_TEMPERATURE is reported in tenths of a degree Celsius. */
    fun tenthsToCelsius(tenths: Int): Float = tenths / 10f

    fun celsiusToFahrenheit(c: Float): Float = c * 9f / 5f + 32f

    /** A battery reading outside a physically plausible range is treated as "no data". */
    fun isPlausibleBatteryCelsius(c: Float): Boolean = c > -30f && c < 95f

    fun batteryCelsiusOrNull(tenths: Int?): Float? {
        if (tenths == null || tenths == Int.MIN_VALUE) return null
        val c = tenthsToCelsius(tenths)
        return if (isPlausibleBatteryCelsius(c)) c else null
    }

    /**
     * Linux thermal zones report millidegrees on most kernels, but some report
     * whole or tenth degrees. Returns null when the value is not plausible.
     */
    fun normalizeThermalZone(raw: Long): Float? {
        val c = when {
            raw >= 1000 || raw <= -1000 -> raw / 1000f
            raw >= 200 -> raw / 10f
            else -> raw.toFloat()
        }
        return if (c > -30f && c < 150f) c else null
    }

    fun format(c: Float, unit: TemperatureUnit, locale: Locale = Locale.US): String = when (unit) {
        TemperatureUnit.CELSIUS -> String.format(locale, "%.1f °C", c)
        TemperatureUnit.FAHRENHEIT -> String.format(locale, "%.1f °F", celsiusToFahrenheit(c))
    }
}

/** Mirrors PowerManager.THERMAL_STATUS_* (values 0..6). */
enum class ThermalLevel(val code: Int) {
    NONE(0), LIGHT(1), MODERATE(2), SEVERE(3), CRITICAL(4), EMERGENCY(5), SHUTDOWN(6), UNKNOWN(-1);

    val isSerious: Boolean get() = code >= SEVERE.code

    companion object {
        fun fromCode(code: Int?): ThermalLevel =
            entries.firstOrNull { it.code == code && it != UNKNOWN } ?: UNKNOWN
    }
}

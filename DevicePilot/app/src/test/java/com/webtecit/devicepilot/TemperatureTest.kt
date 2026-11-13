package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.TemperatureUnit
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.domain.ThermalLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TemperatureTest {
    @Test fun tenthsToCelsius() = assertEquals(36.7f, TemperatureUtils.tenthsToCelsius(367), 0.001f)
    @Test fun fahrenheit() = assertEquals(98.6f, TemperatureUtils.celsiusToFahrenheit(37f), 0.01f)
    @Test fun implausibleBatteryReadingIsNull() {
        assertNull(TemperatureUtils.batteryCelsiusOrNull(null))
        assertNull(TemperatureUtils.batteryCelsiusOrNull(Int.MIN_VALUE))
        assertNull(TemperatureUtils.batteryCelsiusOrNull(1500))
        assertEquals(31.5f, TemperatureUtils.batteryCelsiusOrNull(315)!!, 0.001f)
    }
    @Test fun thermalZoneNormalization() {
        assertEquals(42.5f, TemperatureUtils.normalizeThermalZone(42500)!!, 0.001f)
        assertEquals(42.5f, TemperatureUtils.normalizeThermalZone(425)!!, 0.001f)
        assertEquals(42f, TemperatureUtils.normalizeThermalZone(42)!!, 0.001f)
        assertNull(TemperatureUtils.normalizeThermalZone(-273000))
        assertNull(TemperatureUtils.normalizeThermalZone(999_999))
    }
    @Test fun format() {
        assertEquals("30.0 °C", TemperatureUtils.format(30f, TemperatureUnit.CELSIUS))
        assertEquals("86.0 °F", TemperatureUtils.format(30f, TemperatureUnit.FAHRENHEIT))
    }
    @Test fun thermalLevels() {
        assertEquals(ThermalLevel.SEVERE, ThermalLevel.fromCode(3))
        assertEquals(ThermalLevel.UNKNOWN, ThermalLevel.fromCode(null))
        assertEquals(ThermalLevel.UNKNOWN, ThermalLevel.fromCode(42))
        assertTrue(ThermalLevel.CRITICAL.isSerious)
        assertFalse(ThermalLevel.MODERATE.isSerious)
    }
}

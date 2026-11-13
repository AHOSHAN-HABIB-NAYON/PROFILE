package com.webtecit.devicepilot.domain

import com.webtecit.devicepilot.domain.model.BatteryHealth
import com.webtecit.devicepilot.domain.model.ThermalLevel
import com.webtecit.devicepilot.domain.usecase.HealthScoreCalculator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthScoreCalculatorTest {

    private val calc = HealthScoreCalculator()

    private fun inputs(
        health: BatteryHealth? = BatteryHealth.GOOD,
        temp: Float? = 30f,
        storage: Float? = 0.5f,
        ram: Float? = 0.5f,
        thermal: ThermalLevel? = ThermalLevel.NONE,
    ) = HealthScoreCalculator.Inputs(health, temp, storage, ram, thermal)

    @Test
    fun `healthy device scores 100`() {
        val r = calc.calculate(inputs())
        assertEquals(100, r.score)
        assertEquals("Excellent", r.label)
        assertEquals(5, r.components.size)
        assertTrue(r.missing.isEmpty())
    }

    @Test
    fun `missing components are excluded and weights renormalised`() {
        val r = calc.calculate(inputs(thermal = null, ram = null))
        assertEquals(100, r.score)
        assertEquals(listOf("Available RAM", "Thermal status"), r.missing)
        assertEquals(70, r.components.sumOf { it.weight })
    }

    @Test
    fun `fewer than three measured values gives no score`() {
        val r = calc.calculate(inputs(health = BatteryHealth.UNKNOWN, temp = null, ram = null, thermal = null))
        assertNull(r.score)
        assertFalse(r.sufficient)
        assertEquals("Insufficient data", r.label)
    }

    @Test
    fun `unknown battery health is not guessed`() {
        assertNull(calc.batteryHealthScore(BatteryHealth.UNKNOWN))
        val r = calc.calculate(inputs(health = BatteryHealth.UNKNOWN))
        assertTrue("Battery health" in r.missing)
    }

    @Test
    fun `temperature score falls with heat`() {
        assertEquals(100, calc.temperatureScore(35f))
        assertEquals(70, calc.temperatureScore(40f))
        assertEquals(30, calc.temperatureScore(45f))
        assertEquals(0, calc.temperatureScore(52f))
        assertTrue(calc.temperatureScore(37.5f) in 71..99)
    }

    @Test
    fun `storage and ram scores`() {
        assertEquals(100, calc.storageScore(0.25f))
        assertEquals(60, calc.storageScore(0.10f))
        assertEquals(30, calc.storageScore(0.05f))
        assertEquals(0, calc.storageScore(0f))
        assertEquals(100, calc.ramScore(0.4f))
        assertEquals(70, calc.ramScore(0.15f))
    }

    @Test
    fun `hot full phone needs attention`() {
        val r = calc.calculate(inputs(health = BatteryHealth.OVERHEAT, temp = 48f, storage = 0.02f, ram = 0.05f, thermal = ThermalLevel.SEVERE))
        assertTrue(r.score!! < 50)
        assertEquals("Needs attention", r.label)
    }

    @Test
    fun `score is weighted average`() {
        // battery 100*25, temp 100*20, storage 60*25, ram 100*15, thermal 65*15 => (2500+2000+1500+1500+975)/100
        val r = calc.calculate(inputs(storage = 0.10f, thermal = ThermalLevel.MODERATE))
        assertEquals(84, r.score)
    }
}

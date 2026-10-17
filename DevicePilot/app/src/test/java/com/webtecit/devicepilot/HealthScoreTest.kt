package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.FactorStatus
import com.webtecit.devicepilot.domain.HealthFactorId
import com.webtecit.devicepilot.domain.HealthInputs
import com.webtecit.devicepilot.domain.HealthScoreCalculator
import com.webtecit.devicepilot.domain.MemorySnapshot
import com.webtecit.devicepilot.domain.StorageSnapshot
import com.webtecit.devicepilot.domain.ThermalLevel
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthScoreTest {
    private val gb = 1024L * 1024 * 1024
    private val okMemory = MemorySnapshot(8 * gb, 4 * gb, 200L * 1024 * 1024, false)

    @Test fun perfectDevice() {
        val r = HealthScoreCalculator.calculate(HealthInputs(StorageSnapshot(128 * gb, 64 * gb), okMemory, ThermalLevel.NONE, 30f, 80, false))
        assertEquals(100, r.score)
        assertEquals(5, r.measuredFactors)
    }
    @Test fun unavailableFactorsDoNotDeduct() {
        val r = HealthScoreCalculator.calculate(HealthInputs(null, null, null, null, null, false))
        assertEquals(100, r.score)
        assertEquals(0, r.measuredFactors)
        r.factors.forEach { assertEquals(FactorStatus.UNAVAILABLE, it.status) }
    }
    @Test fun problemsDeduct() {
        val r = HealthScoreCalculator.calculate(HealthInputs(StorageSnapshot(128 * gb, gb / 2), okMemory, ThermalLevel.SEVERE, 46f, 10, false))
        // storage 25 + thermal 30 + battery temp 15 + low battery 5
        assertEquals(25, r.score)
        assertEquals(FactorStatus.BAD, r.factors.first { it.id == HealthFactorId.THERMAL }.status)
    }
    @Test fun lowBatteryWhileChargingIsFine() {
        val r = HealthScoreCalculator.calculate(HealthInputs(null, null, null, null, 5, true))
        assertEquals(FactorStatus.GOOD, r.factors.first { it.id == HealthFactorId.BATTERY_LEVEL }.status)
    }
}

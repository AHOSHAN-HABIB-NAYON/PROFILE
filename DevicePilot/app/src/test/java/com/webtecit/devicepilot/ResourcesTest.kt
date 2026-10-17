package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.MemorySnapshot
import com.webtecit.devicepilot.domain.Pressure
import com.webtecit.devicepilot.domain.StorageSnapshot
import org.junit.Assert.assertEquals
import org.junit.Test

class ResourcesTest {
    private val gb = 1024L * 1024 * 1024

    @Test fun memoryMath() {
        val m = MemorySnapshot(8 * gb, 2 * gb, 200L * 1024 * 1024, false)
        assertEquals(6 * gb, m.usedBytes)
        assertEquals(75, m.usedPercent)
        assertEquals(Pressure.LOW, m.pressure)
    }
    @Test fun memoryPressure() {
        assertEquals(Pressure.HIGH, MemorySnapshot(8 * gb, 4 * gb, gb, true).pressure)
        assertEquals(Pressure.HIGH, MemorySnapshot(8 * gb, gb, gb, false).pressure)
        assertEquals(Pressure.MODERATE, MemorySnapshot(10 * gb, gb + gb / 2, gb / 2, false).pressure)
    }
    @Test fun storageMath() {
        val s = StorageSnapshot(128 * gb, 32 * gb)
        assertEquals(96 * gb, s.usedBytes)
        assertEquals(75, s.usedPercent)
        assertEquals(Pressure.LOW, s.pressure)
    }
    @Test fun storagePressure() {
        assertEquals(Pressure.HIGH, StorageSnapshot(128 * gb, gb / 2).pressure)
        assertEquals(Pressure.MODERATE, StorageSnapshot(32 * gb, 3 * gb).pressure)
        assertEquals(Pressure.MODERATE, StorageSnapshot(64 * gb, 6 * gb).pressure)
        assertEquals(Pressure.LOW, StorageSnapshot(0, 0).pressure)
    }
}

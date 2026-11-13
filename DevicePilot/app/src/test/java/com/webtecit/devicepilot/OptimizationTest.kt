package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.FindingId
import com.webtecit.devicepilot.domain.FindingStatus
import com.webtecit.devicepilot.domain.MemorySnapshot
import com.webtecit.devicepilot.domain.OptimizationEngine
import com.webtecit.devicepilot.domain.OptimizationInputs
import com.webtecit.devicepilot.domain.SettingsTarget
import com.webtecit.devicepilot.domain.StorageSnapshot
import com.webtecit.devicepilot.domain.ThermalLevel
import org.junit.Assert.assertEquals
import org.junit.Test

class OptimizationTest {
    private val gb = 1024L * 1024 * 1024
    private fun inputs(
        storageFree: Long = 64 * gb, access: Boolean = true, weekly: Long? = gb, anim: Float? = 1f,
        unused: Int? = 0, thermal: ThermalLevel? = ThermalLevel.NONE, temp: Float? = 30f,
    ) = OptimizationInputs(
        StorageSnapshot(128 * gb, storageFree), MemorySnapshot(8 * gb, 4 * gb, 200L * 1024 * 1024, false),
        temp, thermal, access, weekly, anim, false, unused, false, true,
    )
    private fun find(i: OptimizationInputs, id: FindingId) = OptimizationEngine.analyze(i).first { it.id == id }

    @Test fun lowStorageSuggestsStorageSettings() {
        val f = find(inputs(storageFree = gb / 2), FindingId.STORAGE)
        assertEquals(FindingStatus.SUGGESTION, f.status)
        assertEquals(SettingsTarget.STORAGE, f.target)
    }
    @Test fun noUsageAccessNeedsApproval() {
        assertEquals(FindingStatus.NEEDS_APPROVAL, find(inputs(access = false), FindingId.NETWORK_USAGE).status)
        assertEquals(FindingStatus.NEEDS_APPROVAL, find(inputs(access = false), FindingId.UNUSED_APPS).status)
    }
    @Test fun animations() {
        assertEquals(FindingStatus.SUGGESTION, find(inputs(anim = 1f), FindingId.ANIMATIONS).status)
        assertEquals(FindingStatus.OK, find(inputs(anim = 0.5f), FindingId.ANIMATIONS).status)
        assertEquals(FindingStatus.UNSUPPORTED, find(inputs(anim = null), FindingId.ANIMATIONS).status)
    }
    @Test fun heavyData() = assertEquals(FindingStatus.SUGGESTION,
        find(inputs(weekly = OptimizationEngine.HEAVY_WEEKLY_DATA), FindingId.NETWORK_USAGE).status)
    @Test fun unusedApps() = assertEquals(FindingStatus.SUGGESTION, find(inputs(unused = 3), FindingId.UNUSED_APPS).status)
    @Test fun thermal() {
        assertEquals(FindingStatus.SUGGESTION, find(inputs(thermal = ThermalLevel.MODERATE), FindingId.THERMAL).status)
        assertEquals(FindingStatus.UNSUPPORTED, find(inputs(thermal = null), FindingId.THERMAL).status)
    }
    @Test fun warmBattery() = assertEquals(FindingStatus.SUGGESTION, find(inputs(temp = 41f), FindingId.BATTERY_TEMP).status)
    @Test fun summaryCountsEveryFinding() {
        val f = OptimizationEngine.analyze(inputs())
        val s = OptimizationEngine.summarize(f)
        assertEquals(f.size, s.ok + s.suggestions + s.needsApproval + s.unsupported)
    }
}

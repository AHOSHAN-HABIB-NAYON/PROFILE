package com.webtecit.devicepilot.feature

import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.data.repository.LiveSnapshot
import com.webtecit.devicepilot.domain.model.CpuStatus
import com.webtecit.devicepilot.domain.model.MemoryStatus
import com.webtecit.devicepilot.domain.model.StorageStatus
import com.webtecit.devicepilot.domain.model.ThermalStatus
import com.webtecit.devicepilot.domain.model.TrafficSnapshot
import com.webtecit.devicepilot.domain.usecase.HealthScoreCalculator
import com.webtecit.devicepilot.feature.dashboard.healthTone
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.feature.performance.PerfHistory
import com.webtecit.devicepilot.feature.storage.StorageUi
import org.junit.Assert.assertEquals
import org.junit.Test

class PerfHistoryTest {
    private fun snap(cpu: Float, rx: Long) = LiveSnapshot(
        battery = null,
        memory = MemoryStatus(8_000, 2_000, 100, false),
        storage = StorageStatus(100, 40),
        cpu = CpuStatus(8, emptyList(), Reading.Estimated(cpu, "freq"), Reading.Unavailable(UnavailableReason.RESTRICTED), null),
        thermal = ThermalStatus(Reading.Unavailable(UnavailableReason.NOT_SUPPORTED), Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)),
        network = null,
        traffic = TrafficSnapshot(rx, 0, 0, 0),
        health = HealthScoreCalculator.Result(null, emptyList(), emptyList()),
    )

    @Test fun keepsLastSixtySamples() {
        var h = PerfHistory()
        repeat(75) { i -> h = h.plus(snap(i.toFloat(), i * 10L)) }
        assertEquals(60, h.cpu.size)
        assertEquals(15f, h.cpu.first())
        assertEquals(74f, h.cpu.last())
        assertEquals(75f, h.ram.last()) // 6000 / 8000
        assertEquals(740f, h.rx.last())
    }
}

class StorageLogicTest {
    @Test fun healthToneThresholds() {
        assertEquals(Tone.NEUTRAL, healthTone(HealthScoreCalculator.Result(null, emptyList(), emptyList())))
        assertEquals(Tone.GOOD, healthTone(HealthScoreCalculator.Result(90, emptyList(), emptyList())))
        assertEquals(Tone.WARNING, healthTone(HealthScoreCalculator.Result(55, emptyList(), emptyList())))
        assertEquals(Tone.BAD, healthTone(HealthScoreCalculator.Result(30, emptyList(), emptyList())))
    }

    @Test fun emptyStorageUiHasNoStats() {
        assertEquals(0, StorageUi().stats.size)
        assertEquals(0, StorageUi().allFiles.size)
    }
}

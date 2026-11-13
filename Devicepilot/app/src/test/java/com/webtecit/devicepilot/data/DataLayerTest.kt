package com.webtecit.devicepilot.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.webtecit.devicepilot.core.designsystem.ThemeMode
import com.webtecit.devicepilot.data.local.ChargingDao
import com.webtecit.devicepilot.data.local.ChargingSessionEntity
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.ChargingHistoryRepository
import com.webtecit.devicepilot.data.repository.FileClassifier
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.domain.model.BatteryHealth
import com.webtecit.devicepilot.domain.model.BatteryStatus
import com.webtecit.devicepilot.domain.model.ChargeState
import com.webtecit.devicepilot.domain.model.FileCategory
import com.webtecit.devicepilot.domain.model.PowerSource
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileClassifierTest {
    @Test fun classifiesByMimeAndExtension() {
        assertEquals(FileCategory.IMAGES, FileClassifier.classify("a.jpg", null))
        assertEquals(FileCategory.IMAGES, FileClassifier.classify("noext", "image/png"))
        assertEquals(FileCategory.VIDEOS, FileClassifier.classify("clip.MP4", null))
        assertEquals(FileCategory.AUDIO, FileClassifier.classify("song.opus", null))
        assertEquals(FileCategory.APKS, FileClassifier.classify("app.apk", null))
        assertEquals(FileCategory.APKS, FileClassifier.classify("x", "application/vnd.android.package-archive"))
        assertEquals(FileCategory.DOCUMENTS, FileClassifier.classify("report.pdf", "application/pdf"))
        assertEquals(FileCategory.ARCHIVES, FileClassifier.classify("backup.zip", null))
        assertEquals(FileCategory.DOWNLOADS, FileClassifier.classify("thing.bin", null, "Download/"))
        assertEquals(FileCategory.OTHER, FileClassifier.classify("thing.bin", null, "Android/"))
    }

    @Test fun temporaryFiles() {
        assertTrue(FileClassifier.isTemporary("cache.tmp"))
        assertTrue(FileClassifier.isTemporary("debug.LOG"))
        assertTrue(FileClassifier.isTemporary("video.mp4.part"))
        assertFalse(FileClassifier.isTemporary("photo.jpg"))
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsRepositoryTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun TestScope.repo() = SettingsRepository(
        PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { tmp.newFile("test.preferences_pb") }),
    )

    @Test fun defaults() = runTest(UnconfinedTestDispatcher()) {
        val s = repo().current()
        assertEquals(ThemeMode.LIGHT, s.themeMode)
        assertFalse(s.onboardingDone)
        assertEquals(2_000, s.refreshIntervalMs)
        assertEquals(FileCategory.entries.toSet(), s.scanCategories)
    }

    @Test fun persistsValues() = runTest(UnconfinedTestDispatcher()) {
        val r = repo()
        r.setThemeMode(ThemeMode.DARK)
        r.setOnboardingDone(true)
        r.setRefreshInterval(50) // clamped
        r.setScanCategories(setOf(FileCategory.IMAGES))
        r.setLargeFileThreshold(250)
        val s = r.current()
        assertEquals(ThemeMode.DARK, s.themeMode)
        assertTrue(s.onboardingDone)
        assertEquals(500, s.refreshIntervalMs)
        assertEquals(setOf(FileCategory.IMAGES), s.scanCategories)
        assertEquals(250, s.largeFileThresholdMb)
        r.resetAll()
        assertFalse(r.current().onboardingDone)
    }
}

private class FakeChargingDao : ChargingDao {
    val rows = MutableStateFlow<List<ChargingSessionEntity>>(emptyList())
    private var nextId = 1L
    override suspend fun insert(session: ChargingSessionEntity): Long {
        val id = nextId++
        rows.value = rows.value + session.copy(id = id)
        return id
    }
    override suspend fun openSession() = rows.value.filter { it.endTime == null }.maxByOrNull { it.startTime }
    override suspend fun close(id: Long, endTime: Long, endLevel: Int) {
        rows.value = rows.value.map { if (it.id == id) it.copy(endTime = endTime, endLevel = endLevel) else it }
    }
    override suspend fun updateMaxTemperature(id: Long, temp: Float) {
        rows.value = rows.value.map { if (it.id == id && (it.maxTemperatureC == null || it.maxTemperatureC < temp)) it.copy(maxTemperatureC = temp) else it }
    }
    override fun observeRecent(limit: Int): Flow<List<ChargingSessionEntity>> = rows.map { it.sortedByDescending { r -> r.startTime }.take(limit) }
    override suspend fun clear() { rows.value = emptyList() }
    override suspend fun deleteOlderThan(before: Long) { rows.value = rows.value.filter { it.startTime >= before } }
}

class ChargingHistoryRepositoryTest {
    private fun status(level: Int, source: PowerSource, temp: Float) = BatteryStatus(
        levelPercent = level,
        chargeState = if (source == PowerSource.BATTERY) ChargeState.DISCHARGING else ChargeState.CHARGING,
        source = source,
        health = BatteryHealth.GOOD,
        temperatureC = Reading.Measured(temp),
        voltageMv = Reading.Measured(4000),
        technology = Reading.Measured("Li-ion"),
        currentNowUa = Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
        chargeCounterUah = Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
        capacityEstimateMah = Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
        cycleCount = Reading.Unavailable(UnavailableReason.NOT_SUPPORTED),
        chargeTimeRemainingMs = Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
        present = true,
    )

    @Test fun recordsASession() = runTest {
        val dao = FakeChargingDao()
        val repo = ChargingHistoryRepository(dao)
        repo.sample(status(20, PowerSource.AC, 31f))
        repo.sample(status(40, PowerSource.AC, 38f))
        repo.sample(status(60, PowerSource.AC, 35f))
        val open = dao.openSession()
        assertNotNull(open)
        assertEquals(20, open!!.startLevel)
        assertEquals(38f, open.maxTemperatureC)
        repo.sample(status(61, PowerSource.BATTERY, 33f))
        assertNull(dao.openSession())
        val list = repo.recent().first()
        assertEquals(1, list.size)
        assertEquals(61, list.first().endLevel)
    }

    @Test fun pluggedInTwiceDoesNotDuplicate() = runTest {
        val dao = FakeChargingDao()
        val repo = ChargingHistoryRepository(dao)
        repo.onPluggedIn(status(10, PowerSource.USB, 30f))
        repo.onPluggedIn(status(11, PowerSource.USB, 30f))
        assertEquals(1, dao.rows.value.size)
    }
}

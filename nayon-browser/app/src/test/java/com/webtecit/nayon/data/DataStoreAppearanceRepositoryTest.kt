package com.webtecit.nayon.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import com.webtecit.nayon.data.settings.DataStoreAppearanceRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class DataStoreAppearanceRepositoryTest {

    @get:Rule val tmp = TemporaryFolder()

    private fun TestScope.newStore() = PreferenceDataStoreFactory.create(
        scope = backgroundScope,
        produceFile = { tmp.newFile("settings.preferences_pb").also { it.delete() } },
    )

    @Test fun defaultsWhenEmpty() = runTest(UnconfinedTestDispatcher()) {
        val repo = DataStoreAppearanceRepository(newStore())
        assertEquals(AppearanceSettings(), repo.appearance.first())
    }

    @Test fun persistsEveryField() = runTest(UnconfinedTestDispatcher()) {
        val repo = DataStoreAppearanceRepository(newStore())
        repo.setMode(ThemeMode.SCHEDULED)
        repo.setFamily(ThemeFamily.EMERALD)
        repo.setSchedule(21 * 60 + 30, 6 * 60)
        repo.setScheduleUsesAmoled(true)
        assertEquals(
            AppearanceSettings(ThemeMode.SCHEDULED, ThemeFamily.EMERALD, 21 * 60 + 30, 6 * 60, true),
            repo.appearance.first(),
        )
    }

    @Test fun unknownStoredValuesFallBackToDefaults() = runTest(UnconfinedTestDispatcher()) {
        val store = newStore()
        store.edit {
            it[stringPreferencesKey("theme_mode")] = "REMOVED_MODE"
            it[stringPreferencesKey("theme_family")] = "REMOVED_FAMILY"
        }
        val settings = DataStoreAppearanceRepository(store).appearance.first()
        assertEquals(ThemeMode.SYSTEM, settings.mode)
        assertEquals(ThemeFamily.AURORA, settings.family)
    }

    @Test fun scheduleIsClampedToValidMinutes() = runTest(UnconfinedTestDispatcher()) {
        val repo = DataStoreAppearanceRepository(newStore())
        repo.setSchedule(-5, 5000)
        val s = repo.appearance.first()
        assertEquals(0, s.darkStartMinute)
        assertEquals(24 * 60 - 1, s.darkEndMinute)
    }
}

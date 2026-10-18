package com.webtecit.nayon.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.MINUTES_PER_DAY
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.io.IOException

/** Persists appearance settings in a local Preferences DataStore (never synced or backed up). */
class DataStoreAppearanceRepository(
    private val dataStore: DataStore<Preferences>,
) : AppearanceRepository {

    private object Keys {
        val mode = stringPreferencesKey("theme_mode")
        val family = stringPreferencesKey("theme_family")
        val darkStart = intPreferencesKey("schedule_dark_start")
        val darkEnd = intPreferencesKey("schedule_dark_end")
        val scheduleAmoled = booleanPreferencesKey("schedule_amoled")
    }

    override val appearance: Flow<AppearanceSettings> = dataStore.data
        .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
        .map { prefs -> prefs.toAppearance() }
        .distinctUntilChanged()

    override suspend fun setMode(mode: ThemeMode) {
        dataStore.edit { it[Keys.mode] = mode.name }
    }

    override suspend fun setFamily(family: ThemeFamily) {
        dataStore.edit { it[Keys.family] = family.name }
    }

    override suspend fun setSchedule(darkStartMinute: Int, darkEndMinute: Int) {
        dataStore.edit {
            it[Keys.darkStart] = darkStartMinute.coerceMinute()
            it[Keys.darkEnd] = darkEndMinute.coerceMinute()
        }
    }

    override suspend fun setScheduleUsesAmoled(enabled: Boolean) {
        dataStore.edit { it[Keys.scheduleAmoled] = enabled }
    }

    private fun Preferences.toAppearance(): AppearanceSettings {
        val defaults = AppearanceSettings()
        return AppearanceSettings(
            mode = enumOrDefault(this[Keys.mode], defaults.mode),
            family = enumOrDefault(this[Keys.family], defaults.family),
            darkStartMinute = (this[Keys.darkStart] ?: defaults.darkStartMinute).coerceMinute(),
            darkEndMinute = (this[Keys.darkEnd] ?: defaults.darkEndMinute).coerceMinute(),
            scheduleUsesAmoled = this[Keys.scheduleAmoled] ?: defaults.scheduleUsesAmoled,
        )
    }

    private fun Int.coerceMinute() = coerceIn(0, MINUTES_PER_DAY - 1)

    private inline fun <reified T : Enum<T>> enumOrDefault(name: String?, default: T): T =
        name?.let { runCatching { enumValueOf<T>(it) }.getOrNull() } ?: default
}

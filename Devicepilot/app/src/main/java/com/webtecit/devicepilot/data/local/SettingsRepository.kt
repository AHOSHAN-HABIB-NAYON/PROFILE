package com.webtecit.devicepilot.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import com.webtecit.devicepilot.core.designsystem.ThemeMode
import com.webtecit.devicepilot.domain.model.FileCategory
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

data class AppSettings(
    val themeMode: ThemeMode = ThemeMode.LIGHT,
    val onboardingDone: Boolean = false,
    val refreshIntervalMs: Long = 2_000,
    val backgroundMonitoring: Boolean = true,
    val notificationsEnabled: Boolean = false,
    val chargingNotifications: Boolean = true,
    val overheatAlerts: Boolean = true,
    val storageWarnings: Boolean = true,
    val scanCategories: Set<FileCategory> = FileCategory.entries.toSet(),
    val largeFileThresholdMb: Int = 100,
)

@Singleton
class SettingsRepository @Inject constructor(private val dataStore: DataStore<Preferences>) {

    private object Keys {
        val theme = stringPreferencesKey("theme_mode")
        val onboarding = booleanPreferencesKey("onboarding_done")
        val refresh = longPreferencesKey("refresh_interval_ms")
        val monitoring = booleanPreferencesKey("background_monitoring")
        val notifications = booleanPreferencesKey("notifications_enabled")
        val charging = booleanPreferencesKey("charging_notifications")
        val overheat = booleanPreferencesKey("overheat_alerts")
        val storage = booleanPreferencesKey("storage_warnings")
        val categories = stringSetPreferencesKey("scan_categories")
        val largeFile = intPreferencesKey("large_file_threshold_mb")
        val lastOverheatAlert = longPreferencesKey("last_overheat_alert")
        val lastStorageAlert = longPreferencesKey("last_storage_alert")
        val fullChargeNotified = booleanPreferencesKey("full_charge_notified")
    }

    val settings: Flow<AppSettings> = dataStore.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { p ->
            AppSettings(
                themeMode = p[Keys.theme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.LIGHT,
                onboardingDone = p[Keys.onboarding] ?: false,
                refreshIntervalMs = p[Keys.refresh] ?: 2_000,
                backgroundMonitoring = p[Keys.monitoring] ?: true,
                notificationsEnabled = p[Keys.notifications] ?: false,
                chargingNotifications = p[Keys.charging] ?: true,
                overheatAlerts = p[Keys.overheat] ?: true,
                storageWarnings = p[Keys.storage] ?: true,
                scanCategories = p[Keys.categories]
                    ?.mapNotNull { name -> FileCategory.entries.firstOrNull { it.name == name } }?.toSet()
                    ?: FileCategory.entries.toSet(),
                largeFileThresholdMb = p[Keys.largeFile] ?: 100,
            )
        }

    suspend fun current(): AppSettings = settings.first()

    suspend fun setThemeMode(mode: ThemeMode) = dataStore.edit { it[Keys.theme] = mode.name }
    suspend fun setOnboardingDone(done: Boolean) = dataStore.edit { it[Keys.onboarding] = done }
    suspend fun setRefreshInterval(ms: Long) = dataStore.edit { it[Keys.refresh] = ms.coerceIn(500, 10_000) }
    suspend fun setBackgroundMonitoring(enabled: Boolean) = dataStore.edit { it[Keys.monitoring] = enabled }
    suspend fun setNotificationsEnabled(enabled: Boolean) = dataStore.edit { it[Keys.notifications] = enabled }
    suspend fun setChargingNotifications(enabled: Boolean) = dataStore.edit { it[Keys.charging] = enabled }
    suspend fun setOverheatAlerts(enabled: Boolean) = dataStore.edit { it[Keys.overheat] = enabled }
    suspend fun setStorageWarnings(enabled: Boolean) = dataStore.edit { it[Keys.storage] = enabled }
    suspend fun setLargeFileThreshold(mb: Int) = dataStore.edit { it[Keys.largeFile] = mb.coerceIn(10, 4096) }
    suspend fun setScanCategories(categories: Set<FileCategory>) =
        dataStore.edit { it[Keys.categories] = categories.map { c -> c.name }.toSet() }

    // Alert throttling state used by the background monitor.
    suspend fun lastOverheatAlert(): Long = dataStore.data.first()[Keys.lastOverheatAlert] ?: 0
    suspend fun setLastOverheatAlert(time: Long) = dataStore.edit { it[Keys.lastOverheatAlert] = time }
    suspend fun lastStorageAlert(): Long = dataStore.data.first()[Keys.lastStorageAlert] ?: 0
    suspend fun setLastStorageAlert(time: Long) = dataStore.edit { it[Keys.lastStorageAlert] = time }
    suspend fun fullChargeNotified(): Boolean = dataStore.data.first()[Keys.fullChargeNotified] ?: false
    suspend fun setFullChargeNotified(value: Boolean) = dataStore.edit { it[Keys.fullChargeNotified] = value }

    /** "Reset onboarding" / clear preferences from Settings. */
    suspend fun resetAll() = dataStore.edit { it.clear() }
}

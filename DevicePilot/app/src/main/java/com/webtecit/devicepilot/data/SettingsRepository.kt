package com.webtecit.devicepilot.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.domain.FirewallRules
import com.webtecit.devicepilot.domain.TemperatureUnit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException

enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class AppSettings(
    val theme: ThemeMode = ThemeMode.SYSTEM,
    val temperatureUnit: TemperatureUnit = TemperatureUnit.CELSIUS,
    val onboardingDone: Boolean = false,
    val refreshSeconds: Int = 3,
    val notifyTemperature: Boolean = false,
    val temperatureThresholdC: Int = 42,
    val notifyThermal: Boolean = false,
    val notifyStorage: Boolean = false,
    val notifyData: Boolean = false,
    val dataThresholdMb: Int = 2048,
    val notifyFirewall: Boolean = true,
    val billingDay: Int = 1,
    val firewallRules: Map<String, AppRule> = emptyMap(),
    val firewallWanted: Boolean = false,
    val apkUris: Set<String> = emptySet(),
    val permissionsSetupDone: Boolean = false,
) {
    val anyNotification: Boolean get() = notifyTemperature || notifyThermal || notifyStorage || notifyData
}

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "devicepilot_settings")

/** Every setting lives only on this device (DataStore). Nothing is uploaded. */
class SettingsRepository(private val context: Context) {

    private object Keys {
        val theme = stringPreferencesKey("theme")
        val unit = stringPreferencesKey("temp_unit")
        val onboarding = booleanPreferencesKey("onboarding_done")
        val refresh = intPreferencesKey("refresh_seconds")
        val notifyTemp = booleanPreferencesKey("notify_temp")
        val tempThreshold = intPreferencesKey("temp_threshold")
        val notifyThermal = booleanPreferencesKey("notify_thermal")
        val notifyStorage = booleanPreferencesKey("notify_storage")
        val notifyData = booleanPreferencesKey("notify_data")
        val dataThreshold = intPreferencesKey("data_threshold_mb")
        val notifyFirewall = booleanPreferencesKey("notify_firewall")
        val billingDay = intPreferencesKey("billing_day")
        val firewallRules = stringSetPreferencesKey("firewall_rules")
        val firewallWanted = booleanPreferencesKey("firewall_wanted")
        val apkUris = stringSetPreferencesKey("apk_uris")
        val lastDataAlert = stringPreferencesKey("last_data_alert")
        val permissionsDone = booleanPreferencesKey("permissions_setup_done")
    }

    val settings: Flow<AppSettings> = context.dataStore.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { p ->
            AppSettings(
                theme = p[Keys.theme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM,
                temperatureUnit = p[Keys.unit]?.let { runCatching { TemperatureUnit.valueOf(it) }.getOrNull() }
                    ?: TemperatureUnit.CELSIUS,
                onboardingDone = p[Keys.onboarding] ?: false,
                refreshSeconds = (p[Keys.refresh] ?: 3).coerceIn(1, 30),
                notifyTemperature = p[Keys.notifyTemp] ?: false,
                temperatureThresholdC = p[Keys.tempThreshold] ?: 42,
                notifyThermal = p[Keys.notifyThermal] ?: false,
                notifyStorage = p[Keys.notifyStorage] ?: false,
                notifyData = p[Keys.notifyData] ?: false,
                dataThresholdMb = p[Keys.dataThreshold] ?: 2048,
                notifyFirewall = p[Keys.notifyFirewall] ?: true,
                billingDay = p[Keys.billingDay] ?: 1,
                firewallRules = FirewallRules.decodeAll(p[Keys.firewallRules] ?: emptySet()),
                firewallWanted = p[Keys.firewallWanted] ?: false,
                apkUris = p[Keys.apkUris] ?: emptySet(),
                permissionsSetupDone = p[Keys.permissionsDone] ?: false,
            )
        }

    suspend fun current(): AppSettings = settings.first()

    suspend fun setTheme(v: ThemeMode) = context.dataStore.edit { it[Keys.theme] = v.name }
    suspend fun setTemperatureUnit(v: TemperatureUnit) = context.dataStore.edit { it[Keys.unit] = v.name }
    suspend fun setOnboardingDone() = context.dataStore.edit { it[Keys.onboarding] = true }
    suspend fun setRefreshSeconds(v: Int) = context.dataStore.edit { it[Keys.refresh] = v }
    suspend fun setNotifyTemperature(v: Boolean) = context.dataStore.edit { it[Keys.notifyTemp] = v }
    suspend fun setTemperatureThreshold(v: Int) = context.dataStore.edit { it[Keys.tempThreshold] = v }
    suspend fun setNotifyThermal(v: Boolean) = context.dataStore.edit { it[Keys.notifyThermal] = v }
    suspend fun setNotifyStorage(v: Boolean) = context.dataStore.edit { it[Keys.notifyStorage] = v }
    suspend fun setNotifyData(v: Boolean) = context.dataStore.edit { it[Keys.notifyData] = v }
    suspend fun setDataThresholdMb(v: Int) = context.dataStore.edit { it[Keys.dataThreshold] = v }
    suspend fun setNotifyFirewall(v: Boolean) = context.dataStore.edit { it[Keys.notifyFirewall] = v }
    suspend fun setBillingDay(v: Int) = context.dataStore.edit { it[Keys.billingDay] = v.coerceIn(1, 28) }
    suspend fun setPermissionsSetupDone() = context.dataStore.edit { it[Keys.permissionsDone] = true }
    suspend fun setFirewallWanted(v: Boolean) = context.dataStore.edit { it[Keys.firewallWanted] = v }

    suspend fun setRule(rule: AppRule) = context.dataStore.edit { p ->
        val current = FirewallRules.decodeAll(p[Keys.firewallRules] ?: emptySet()).toMutableMap()
        if (rule.isActive) current[rule.packageName] = rule else current.remove(rule.packageName)
        p[Keys.firewallRules] = FirewallRules.encodeAll(current.values)
    }

    suspend fun clearRules() = context.dataStore.edit { it[Keys.firewallRules] = emptySet() }

    suspend fun addApkUris(uris: Collection<String>) = context.dataStore.edit {
        it[Keys.apkUris] = (it[Keys.apkUris] ?: emptySet()) + uris
    }

    suspend fun removeApkUri(uri: String) = context.dataStore.edit {
        it[Keys.apkUris] = (it[Keys.apkUris] ?: emptySet()) - uri
    }

    /** Remembers which billing period already triggered a data alert, to avoid repeats. */
    suspend fun lastDataAlertKey(): String? = context.dataStore.data.first()[Keys.lastDataAlert]
    suspend fun setLastDataAlertKey(v: String) = context.dataStore.edit { it[Keys.lastDataAlert] = v }
}

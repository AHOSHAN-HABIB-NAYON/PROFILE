package com.webtecit.filepilot.core.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.webtecit.filepilot.core.storage.SortField
import com.webtecit.filepilot.core.storage.SortOrder
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

enum class ThemeMode(val label: String) { LIGHT("Light"), DARK("Dark"), SYSTEM("System") }

enum class AccentColor(val label: String) {
    ROYAL_BLUE("Royal blue"), TEAL("Teal"), INDIGO("Indigo"), EMERALD("Emerald"), CRIMSON("Crimson"),
}

enum class ViewMode { LIST, GRID }

enum class StartLocation(val label: String) { OVERVIEW("Storage overview"), INTERNAL("Internal storage") }

data class UserPreferences(
    val themeMode: ThemeMode = ThemeMode.LIGHT,
    val accent: AccentColor = AccentColor.ROYAL_BLUE,
    val dynamicColor: Boolean = false,
    val animations: Boolean = true,
    val highRefreshRate: Boolean = true,
    val showHidden: Boolean = false,
    val showExtensions: Boolean = true,
    val sortOrder: SortOrder = SortOrder(),
    val viewMode: ViewMode = ViewMode.LIST,
    val startLocation: StartLocation = StartLocation.OVERVIEW,
    val onboardingDone: Boolean = false,
    val permissionsSetupDone: Boolean = false,
)

private val Context.settingsStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

@Module
@InstallIn(SingletonComponent::class)
object PreferencesModule {
    @Provides
    @Singleton
    fun dataStore(@ApplicationContext context: Context): DataStore<Preferences> = context.settingsStore
}

@Singleton
class PreferencesRepository @Inject constructor(
    private val store: DataStore<Preferences>,
) {
    private object Keys {
        val theme = stringPreferencesKey("theme")
        val accent = stringPreferencesKey("accent")
        val dynamic = booleanPreferencesKey("dynamic_color")
        val animations = booleanPreferencesKey("animations")
        val highRefresh = booleanPreferencesKey("high_refresh")
        val hidden = booleanPreferencesKey("show_hidden")
        val extensions = booleanPreferencesKey("show_extensions")
        val sortField = stringPreferencesKey("sort_field")
        val sortAsc = booleanPreferencesKey("sort_ascending")
        val foldersFirst = booleanPreferencesKey("folders_first")
        val viewMode = stringPreferencesKey("view_mode")
        val start = stringPreferencesKey("start_location")
        val onboarding = booleanPreferencesKey("onboarding_done")
        val permissions = booleanPreferencesKey("permissions_setup_done")
    }

    val preferences: Flow<UserPreferences> = store.data.map { p ->
        val d = UserPreferences()
        UserPreferences(
            themeMode = enumOr(p[Keys.theme], d.themeMode),
            accent = enumOr(p[Keys.accent], d.accent),
            dynamicColor = p[Keys.dynamic] ?: d.dynamicColor,
            animations = p[Keys.animations] ?: d.animations,
            highRefreshRate = p[Keys.highRefresh] ?: d.highRefreshRate,
            showHidden = p[Keys.hidden] ?: d.showHidden,
            showExtensions = p[Keys.extensions] ?: d.showExtensions,
            sortOrder = SortOrder(
                field = enumOr(p[Keys.sortField], SortField.NAME),
                ascending = p[Keys.sortAsc] ?: true,
                foldersFirst = p[Keys.foldersFirst] ?: true,
            ),
            viewMode = enumOr(p[Keys.viewMode], d.viewMode),
            startLocation = enumOr(p[Keys.start], d.startLocation),
            onboardingDone = p[Keys.onboarding] ?: false,
            permissionsSetupDone = p[Keys.permissions] ?: false,
        )
    }

    suspend fun current(): UserPreferences = preferences.first()

    suspend fun setThemeMode(v: ThemeMode) = set { it[Keys.theme] = v.name }
    suspend fun setAccent(v: AccentColor) = set { it[Keys.accent] = v.name }
    suspend fun setDynamicColor(v: Boolean) = set { it[Keys.dynamic] = v }
    suspend fun setAnimations(v: Boolean) = set { it[Keys.animations] = v }
    suspend fun setHighRefreshRate(v: Boolean) = set { it[Keys.highRefresh] = v }
    suspend fun setShowHidden(v: Boolean) = set { it[Keys.hidden] = v }
    suspend fun setShowExtensions(v: Boolean) = set { it[Keys.extensions] = v }
    suspend fun setViewMode(v: ViewMode) = set { it[Keys.viewMode] = v.name }
    suspend fun setStartLocation(v: StartLocation) = set { it[Keys.start] = v.name }
    suspend fun setOnboardingDone(done: Boolean = true) = set { it[Keys.onboarding] = done }
    suspend fun setPermissionsSetupDone(done: Boolean = true) = set { it[Keys.permissions] = done }

    suspend fun setSortOrder(v: SortOrder) = set {
        it[Keys.sortField] = v.field.name
        it[Keys.sortAsc] = v.ascending
        it[Keys.foldersFirst] = v.foldersFirst
    }

    private suspend fun set(block: (MutablePreferences) -> Unit) {
        store.edit { block(it) }
    }

    private inline fun <reified T : Enum<T>> enumOr(name: String?, default: T): T =
        name?.let { runCatching { enumValueOf<T>(it) }.getOrNull() } ?: default
}

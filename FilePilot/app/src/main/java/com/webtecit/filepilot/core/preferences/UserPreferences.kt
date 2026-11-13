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

enum class EditorTheme(val label: String) { LIGHT("Light"), DARK("Dark"), APP("Same as app") }

enum class EditorFont(val label: String, val css: String) {
    MONO("Monospace", "monospace"), SANS("Sans serif", "sans-serif"), SERIF("Serif", "serif"),
}

enum class PreviewDevice(val label: String) { MOBILE("Mobile"), TABLET("Tablet"), DESKTOP("Desktop") }

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
    val editorFontSize: Int = 14,
    val editorWrap: Boolean = false,
    val editorLineNumbers: Boolean = true,
    val editorTabSize: Int = 4,
    val editorAutoIndent: Boolean = true,
    val editorAutoSave: Boolean = false,
    val editorTheme: EditorTheme = EditorTheme.LIGHT,
    val editorFont: EditorFont = EditorFont.MONO,
    val previewDevice: PreviewDevice = PreviewDevice.MOBILE,
    val previewConsole: Boolean = true,
    val recycleBin: Boolean = true,
    val appLock: Boolean = false,
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
        val edSize = androidx.datastore.preferences.core.intPreferencesKey("editor_font_size")
        val edWrap = booleanPreferencesKey("editor_wrap")
        val edLines = booleanPreferencesKey("editor_line_numbers")
        val edTab = androidx.datastore.preferences.core.intPreferencesKey("editor_tab_size")
        val edIndent = booleanPreferencesKey("editor_auto_indent")
        val edAutoSave = booleanPreferencesKey("editor_auto_save")
        val edTheme = stringPreferencesKey("editor_theme")
        val edFont = stringPreferencesKey("editor_font")
        val pvDevice = stringPreferencesKey("preview_device")
        val pvConsole = booleanPreferencesKey("preview_console")
        val recycle = booleanPreferencesKey("recycle_bin")
        val appLock = booleanPreferencesKey("app_lock")
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
            editorFontSize = p[Keys.edSize] ?: d.editorFontSize,
            editorWrap = p[Keys.edWrap] ?: d.editorWrap,
            editorLineNumbers = p[Keys.edLines] ?: d.editorLineNumbers,
            editorTabSize = p[Keys.edTab] ?: d.editorTabSize,
            editorAutoIndent = p[Keys.edIndent] ?: d.editorAutoIndent,
            editorAutoSave = p[Keys.edAutoSave] ?: d.editorAutoSave,
            editorTheme = enumOr(p[Keys.edTheme], d.editorTheme),
            editorFont = enumOr(p[Keys.edFont], d.editorFont),
            previewDevice = enumOr(p[Keys.pvDevice], d.previewDevice),
            previewConsole = p[Keys.pvConsole] ?: d.previewConsole,
            recycleBin = p[Keys.recycle] ?: d.recycleBin,
            appLock = p[Keys.appLock] ?: d.appLock,
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

    suspend fun setEditorFontSize(v: Int) = set { it[Keys.edSize] = v.coerceIn(8, 32) }
    suspend fun setEditorWrap(v: Boolean) = set { it[Keys.edWrap] = v }
    suspend fun setEditorLineNumbers(v: Boolean) = set { it[Keys.edLines] = v }
    suspend fun setEditorTabSize(v: Int) = set { it[Keys.edTab] = v }
    suspend fun setEditorAutoIndent(v: Boolean) = set { it[Keys.edIndent] = v }
    suspend fun setEditorAutoSave(v: Boolean) = set { it[Keys.edAutoSave] = v }
    suspend fun setEditorTheme(v: EditorTheme) = set { it[Keys.edTheme] = v.name }
    suspend fun setEditorFont(v: EditorFont) = set { it[Keys.edFont] = v.name }
    suspend fun setPreviewDevice(v: PreviewDevice) = set { it[Keys.pvDevice] = v.name }
    suspend fun setPreviewConsole(v: Boolean) = set { it[Keys.pvConsole] = v }
    suspend fun setRecycleBin(v: Boolean) = set { it[Keys.recycle] = v }
    suspend fun setAppLock(v: Boolean) = set { it[Keys.appLock] = v }

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

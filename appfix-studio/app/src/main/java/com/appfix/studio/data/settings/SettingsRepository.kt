package com.appfix.studio.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import com.appfix.core.ai.AiConfig
import kotlinx.serialization.json.Json

enum class ThemeMode { LIGHT, DARK, SYSTEM }

data class AppSettings(
    val themeMode: ThemeMode = ThemeMode.LIGHT,
    val dynamicColor: Boolean = false,
    val editorFontSize: Int = 14,
    val editorWordWrap: Boolean = false,
    val currentProjectId: String? = null,
    val autoBackupBeforeChanges: Boolean = true,
    /** owner/name of the GitHub repository used for cloud builds. */
    val buildRepo: String = "",
    /** AI provider settings. The API key is not part of this; it lives encrypted in SecretStore. */
    val aiConfig: AiConfig = AiConfig(),
)

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private object Keys {
        val theme = stringPreferencesKey("theme_mode")
        val dynamic = booleanPreferencesKey("dynamic_color")
        val fontSize = intPreferencesKey("editor_font_size")
        val wrap = booleanPreferencesKey("editor_word_wrap")
        val current = stringPreferencesKey("current_project")
        val autoBackup = booleanPreferencesKey("auto_backup")
        val buildRepo = stringPreferencesKey("build_repo")
        val aiConfig = stringPreferencesKey("ai_config")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            themeMode = p[Keys.theme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.LIGHT,
            dynamicColor = p[Keys.dynamic] ?: false,
            editorFontSize = (p[Keys.fontSize] ?: 14).coerceIn(10, 24),
            editorWordWrap = p[Keys.wrap] ?: false,
            currentProjectId = p[Keys.current],
            autoBackupBeforeChanges = p[Keys.autoBackup] ?: true,
            buildRepo = p[Keys.buildRepo].orEmpty(),
            aiConfig = p[Keys.aiConfig]?.let { runCatching { json.decodeFromString(AiConfig.serializer(), it) }.getOrNull() } ?: AiConfig(),
        )
    }

    suspend fun setThemeMode(mode: ThemeMode) = context.dataStore.edit { it[Keys.theme] = mode.name }
    suspend fun setDynamicColor(enabled: Boolean) = context.dataStore.edit { it[Keys.dynamic] = enabled }
    suspend fun setEditorFontSize(size: Int) = context.dataStore.edit { it[Keys.fontSize] = size.coerceIn(10, 24) }
    suspend fun setEditorWordWrap(enabled: Boolean) = context.dataStore.edit { it[Keys.wrap] = enabled }
    suspend fun setAiConfig(config: AiConfig) = context.dataStore.edit { it[Keys.aiConfig] = json.encodeToString(AiConfig.serializer(), config) }
    suspend fun setBuildRepo(repo: String) = context.dataStore.edit { it[Keys.buildRepo] = repo.trim() }
    suspend fun setAutoBackup(enabled: Boolean) = context.dataStore.edit { it[Keys.autoBackup] = enabled }
    suspend fun setCurrentProject(id: String?) = context.dataStore.edit {
        if (id == null) it.remove(Keys.current) else it[Keys.current] = id
    }
}

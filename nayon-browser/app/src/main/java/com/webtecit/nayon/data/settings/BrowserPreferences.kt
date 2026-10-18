package com.webtecit.nayon.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webtecit.nayon.core.browser.SearchEngine
import com.webtecit.nayon.core.browser.SearchTemplates
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.io.IOException

/** Where the browser controls live. TOP mirrors Chrome; TOP_AND_BOTTOM adds a thumb-reach bottom bar. */
enum class ToolbarLayout { TOP, TOP_AND_BOTTOM }

data class BrowserPreferences(
    val searchEngine: SearchEngine = SearchEngine.GOOGLE,
    val customSearchTemplate: String = "",
    val javaScriptEnabled: Boolean = true,
    val restoreTabs: Boolean = true,
    val showShortcuts: Boolean = true,
    val showRecentOnHome: Boolean = true,
    val toolbarLayout: ToolbarLayout = ToolbarLayout.TOP,
    val hideToolbarsOnScroll: Boolean = true,
    val pullToRefresh: Boolean = true,
) {
    /** Search URL template in effect. Falls back to Google if the custom one is invalid. */
    val searchTemplate: String
        get() = if (searchEngine == SearchEngine.CUSTOM) {
            if (SearchTemplates.validate(customSearchTemplate) == SearchTemplates.Validation.OK) {
                customSearchTemplate.trim()
            } else {
                SearchEngine.GOOGLE.template
            }
        } else {
            searchEngine.template
        }
}

class BrowserPreferencesRepository(private val dataStore: DataStore<Preferences>) {

    private object Keys {
        val engine = stringPreferencesKey("search_engine")
        val customTemplate = stringPreferencesKey("search_custom_template")
        val javaScript = booleanPreferencesKey("javascript_enabled")
        val restoreTabs = booleanPreferencesKey("restore_tabs")
        val shortcuts = booleanPreferencesKey("home_shortcuts")
        val recent = booleanPreferencesKey("home_recent")
        val toolbar = stringPreferencesKey("toolbar_layout")
        val hideBars = booleanPreferencesKey("hide_toolbars_on_scroll")
        val pullRefresh = booleanPreferencesKey("pull_to_refresh")
    }

    val preferences: Flow<BrowserPreferences> = dataStore.data
        .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
        .map { p ->
            val d = BrowserPreferences()
            BrowserPreferences(
                searchEngine = p[Keys.engine]?.let { runCatching { SearchEngine.valueOf(it) }.getOrNull() } ?: d.searchEngine,
                customSearchTemplate = p[Keys.customTemplate] ?: d.customSearchTemplate,
                javaScriptEnabled = p[Keys.javaScript] ?: d.javaScriptEnabled,
                restoreTabs = p[Keys.restoreTabs] ?: d.restoreTabs,
                showShortcuts = p[Keys.shortcuts] ?: d.showShortcuts,
                showRecentOnHome = p[Keys.recent] ?: d.showRecentOnHome,
                toolbarLayout = p[Keys.toolbar]?.let { runCatching { ToolbarLayout.valueOf(it) }.getOrNull() } ?: d.toolbarLayout,
                hideToolbarsOnScroll = p[Keys.hideBars] ?: d.hideToolbarsOnScroll,
                pullToRefresh = p[Keys.pullRefresh] ?: d.pullToRefresh,
            )
        }
        .distinctUntilChanged()

    suspend fun setSearchEngine(engine: SearchEngine) = dataStore.edit { it[Keys.engine] = engine.name }
    suspend fun setCustomSearch(template: String) = dataStore.edit {
        it[Keys.customTemplate] = template.trim()
        it[Keys.engine] = SearchEngine.CUSTOM.name
    }
    suspend fun setJavaScriptEnabled(enabled: Boolean) = dataStore.edit { it[Keys.javaScript] = enabled }
    suspend fun setRestoreTabs(enabled: Boolean) = dataStore.edit { it[Keys.restoreTabs] = enabled }
    suspend fun setShowShortcuts(enabled: Boolean) = dataStore.edit { it[Keys.shortcuts] = enabled }
    suspend fun setShowRecentOnHome(enabled: Boolean) = dataStore.edit { it[Keys.recent] = enabled }
    suspend fun setToolbarLayout(layout: ToolbarLayout) = dataStore.edit { it[Keys.toolbar] = layout.name }
    suspend fun setHideToolbarsOnScroll(enabled: Boolean) = dataStore.edit { it[Keys.hideBars] = enabled }
    suspend fun setPullToRefresh(enabled: Boolean) = dataStore.edit { it[Keys.pullRefresh] = enabled }
}

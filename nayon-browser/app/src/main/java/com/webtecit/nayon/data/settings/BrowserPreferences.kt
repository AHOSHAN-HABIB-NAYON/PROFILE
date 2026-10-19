package com.webtecit.nayon.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
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
    /** Web page text size in percent (Chrome's "Text scaling"). */
    val textZoom: Int = 100,
    val searchSuggestions: Boolean = true,
    /** Offer to save passwords after signing in (normal tabs only). */
    val savePasswords: Boolean = true,
    /** Offer to save and fill cards (Payments). */
    val savePayments: Boolean = true,
    /** Offer to save and fill addresses (Contact info). */
    val saveAddresses: Boolean = true,
    /** Ask for fingerprint / screen lock before filling a card. */
    val verifyPayments: Boolean = true,
    /** Let Android autofill apps (Google, 1Password, ...) fill inside NAYON pages too. */
    val otherAutofillApps: Boolean = true,
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

/** A user-editable home-page shortcut. */
data class HomeShortcut(val label: String, val url: String)

val DefaultHomeShortcuts = listOf(
    HomeShortcut("Google", "https://www.google.com"),
    HomeShortcut("YouTube", "https://m.youtube.com"),
    HomeShortcut("Facebook", "https://m.facebook.com"),
    HomeShortcut("Wikipedia", "https://www.wikipedia.org"),
    HomeShortcut("WebTecIT", "https://webtecit.com"),
    HomeShortcut("GitHub", "https://github.com"),
    HomeShortcut("Gmail", "https://mail.google.com"),
)

class BrowserPreferencesRepository(private val dataStore: DataStore<Preferences>) {

    private val shortcutsKey = stringPreferencesKey("home_shortcuts_json")

    val shortcuts: Flow<List<HomeShortcut>> = dataStore.data
        .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
        .map { p ->
            p[shortcutsKey]?.let { json ->
                runCatching {
                    val arr = org.json.JSONArray(json)
                    (0 until arr.length()).map { i -> arr.getJSONObject(i).let { HomeShortcut(it.getString("label"), it.getString("url")) } }
                }.getOrNull()
            } ?: DefaultHomeShortcuts
        }
        .distinctUntilChanged()

    suspend fun setShortcuts(list: List<HomeShortcut>) = dataStore.edit {
        val arr = org.json.JSONArray()
        list.forEach { s -> arr.put(org.json.JSONObject().put("label", s.label).put("url", s.url)) }
        it[shortcutsKey] = arr.toString()
    }

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
        val textZoom = intPreferencesKey("text_zoom")
        val suggestions = booleanPreferencesKey("search_suggestions")
        val savePasswords = booleanPreferencesKey("save_passwords")
        val savePayments = booleanPreferencesKey("save_payments")
        val saveAddresses = booleanPreferencesKey("save_addresses")
        val verifyPayments = booleanPreferencesKey("verify_payments")
        val otherAutofill = booleanPreferencesKey("other_autofill_apps")
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
                textZoom = (p[Keys.textZoom] ?: d.textZoom).coerceIn(50, 200),
                searchSuggestions = p[Keys.suggestions] ?: d.searchSuggestions,
                savePasswords = p[Keys.savePasswords] ?: d.savePasswords,
                savePayments = p[Keys.savePayments] ?: d.savePayments,
                saveAddresses = p[Keys.saveAddresses] ?: d.saveAddresses,
                verifyPayments = p[Keys.verifyPayments] ?: d.verifyPayments,
                otherAutofillApps = p[Keys.otherAutofill] ?: d.otherAutofillApps,
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
    suspend fun setTextZoom(percent: Int) = dataStore.edit { it[Keys.textZoom] = percent.coerceIn(50, 200) }
    suspend fun setSearchSuggestions(enabled: Boolean) = dataStore.edit { it[Keys.suggestions] = enabled }
    suspend fun setSavePasswords(enabled: Boolean) = dataStore.edit { it[Keys.savePasswords] = enabled }
    suspend fun setSavePayments(enabled: Boolean) = dataStore.edit { it[Keys.savePayments] = enabled }
    suspend fun setSaveAddresses(enabled: Boolean) = dataStore.edit { it[Keys.saveAddresses] = enabled }
    suspend fun setVerifyPayments(enabled: Boolean) = dataStore.edit { it[Keys.verifyPayments] = enabled }
    suspend fun setOtherAutofillApps(enabled: Boolean) = dataStore.edit { it[Keys.otherAutofill] = enabled }
}

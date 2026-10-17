package com.filepilot.app.data

import android.content.Context
import android.net.Uri
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SortField
import com.filepilot.app.core.model.SortOrder
import com.filepilot.app.core.model.ThemeMode
import com.filepilot.app.core.model.ViewMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "filepilot")

data class AppSettings(
    val theme: ThemeMode = ThemeMode.LIGHT,
    val viewMode: ViewMode = ViewMode.LIST,
    val sort: SortOrder = SortOrder(),
    val showExtensions: Boolean = true,
    val showHidden: Boolean = false,
    val onboardingDone: Boolean = false,
)

data class RecentEntry(val item: FileItem, val openedAt: Long)

enum class OperationStatus { SUCCESS, FAILED, CANCELLED, PARTIAL }

data class HistoryEntry(
    val id: Long,
    val title: String,
    val detail: String,
    val status: OperationStatus,
    val itemCount: Int,
    val bytes: Long,
    val finishedAt: Long,
)

/** A folder the user granted through the system folder picker. */
data class PickedFolder(val treeUri: Uri, val name: String, val addedAt: Long)

/** Tracks which runtime permissions were already requested, so a denial is never re-prompted on its own. */
data class PermissionMemory(val mediaRequested: Boolean, val legacyRequested: Boolean)

/**
 * All persistent app data. Everything stays on this device; nothing is synced or uploaded.
 * Small lists are stored as JSON strings inside one Preferences DataStore.
 */
class LocalStore(context: Context) {
    private val store = context.applicationContext.dataStore

    private object Keys {
        val theme = stringPreferencesKey("theme")
        val viewMode = stringPreferencesKey("view_mode")
        val sortField = stringPreferencesKey("sort_field")
        val sortAsc = booleanPreferencesKey("sort_asc")
        val showExt = booleanPreferencesKey("show_ext")
        val showHidden = booleanPreferencesKey("show_hidden")
        val onboarding = booleanPreferencesKey("onboarding_done")
        val favorites = stringPreferencesKey("favorites")
        val recents = stringPreferencesKey("recents")
        val history = stringPreferencesKey("history")
        val folders = stringPreferencesKey("picked_folders")
        val searches = stringPreferencesKey("search_history")
        val mediaRequested = booleanPreferencesKey("perm_media_requested")
        val legacyRequested = booleanPreferencesKey("perm_legacy_requested")
        val historySeq = longPreferencesKey("history_seq")
    }

    val settings: Flow<AppSettings> = store.data.map { p ->
        AppSettings(
            theme = p[Keys.theme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.LIGHT,
            viewMode = p[Keys.viewMode]?.let { runCatching { ViewMode.valueOf(it) }.getOrNull() } ?: ViewMode.LIST,
            sort = SortOrder(
                field = p[Keys.sortField]?.let { runCatching { SortField.valueOf(it) }.getOrNull() } ?: SortField.NAME,
                ascending = p[Keys.sortAsc] ?: true,
            ),
            showExtensions = p[Keys.showExt] ?: true,
            showHidden = p[Keys.showHidden] ?: false,
            onboardingDone = p[Keys.onboarding] ?: false,
        )
    }.distinctUntilChanged()

    suspend fun setTheme(mode: ThemeMode) = store.edit { it[Keys.theme] = mode.name }
    suspend fun setViewMode(mode: ViewMode) = store.edit { it[Keys.viewMode] = mode.name }
    suspend fun setSort(order: SortOrder) = store.edit {
        it[Keys.sortField] = order.field.name
        it[Keys.sortAsc] = order.ascending
    }
    suspend fun setShowExtensions(show: Boolean) = store.edit { it[Keys.showExt] = show }
    suspend fun setShowHidden(show: Boolean) = store.edit { it[Keys.showHidden] = show }
    suspend fun setOnboardingDone() = store.edit { it[Keys.onboarding] = true }

    // ---- Permission memory ----
    val permissionMemory: Flow<PermissionMemory> = store.data.map {
        PermissionMemory(it[Keys.mediaRequested] ?: false, it[Keys.legacyRequested] ?: false)
    }.distinctUntilChanged()

    suspend fun markMediaRequested() = store.edit { it[Keys.mediaRequested] = true }
    suspend fun markLegacyRequested() = store.edit { it[Keys.legacyRequested] = true }

    // ---- Favorites ----
    val favorites: Flow<List<FileItem>> = store.data.map { p -> parseItems(p[Keys.favorites]) }.distinctUntilChanged()

    suspend fun toggleFavorite(item: FileItem): Boolean {
        var added = false
        store.edit { p ->
            val list = parseItems(p[Keys.favorites]).toMutableList()
            val idx = list.indexOfFirst { it.id == item.id }
            if (idx >= 0) list.removeAt(idx) else {
                list.add(0, item)
                added = true
            }
            p[Keys.favorites] = writeItems(list)
        }
        return added
    }

    suspend fun removeFavorites(ids: Set<String>) = store.edit { p ->
        p[Keys.favorites] = writeItems(parseItems(p[Keys.favorites]).filterNot { it.id in ids })
    }

    suspend fun clearFavorites() = store.edit { it.remove(Keys.favorites) }

    // ---- Recently opened ----
    val recents: Flow<List<RecentEntry>> = store.data.map { p ->
        val arr = p[Keys.recents]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val o = arr.getJSONObject(i)
                RecentEntry(FileItem.fromJson(o.getJSONObject("item")), o.getLong("at"))
            }.getOrNull()
        }
    }.distinctUntilChanged()

    suspend fun addRecent(item: FileItem) = store.edit { p ->
        val arr = p[Keys.recents]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        val out = JSONArray()
        out.put(JSONObject().put("item", item.toJson()).put("at", System.currentTimeMillis()))
        for (i in 0 until arr.length()) {
            if (out.length() >= MAX_RECENTS) break
            val o = arr.optJSONObject(i) ?: continue
            val existing = o.optJSONObject("item")?.let { runCatching { FileItem.fromJson(it) }.getOrNull() } ?: continue
            if (existing.id != item.id) out.put(o)
        }
        p[Keys.recents] = out.toString()
    }

    suspend fun removeRecents(ids: Set<String>) = editRecents { it.id !in ids }

    suspend fun clearRecents() = store.edit { it.remove(Keys.recents) }

    private suspend fun editRecents(keep: (FileItem) -> Boolean) = store.edit { p ->
        val arr = p[Keys.recents]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return@edit
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val item = o.optJSONObject("item")?.let { runCatching { FileItem.fromJson(it) }.getOrNull() } ?: continue
            if (keep(item)) out.put(o)
        }
        p[Keys.recents] = out.toString()
    }

    /** Keep favorites and recents pointing at the right place after a rename or move. */
    suspend fun replaceItem(oldId: String, newItem: FileItem) {
        store.edit { p ->
            val favs = parseItems(p[Keys.favorites])
            if (favs.any { it.id == oldId }) {
                p[Keys.favorites] = writeItems(favs.map { if (it.id == oldId) newItem else it })
            }
        }
        editRecentsMap { if (it.id == oldId) newItem else it }
    }

    /** Drop references to deleted files. */
    suspend fun forget(ids: Set<String>) {
        store.edit { p ->
            val favs = parseItems(p[Keys.favorites])
            if (favs.any { it.id in ids }) p[Keys.favorites] = writeItems(favs.filterNot { it.id in ids })
        }
        editRecents { it.id !in ids }
    }

    private suspend fun editRecentsMap(transform: (FileItem) -> FileItem) = store.edit { p ->
        val arr = p[Keys.recents]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return@edit
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val item = o.optJSONObject("item")?.let { runCatching { FileItem.fromJson(it) }.getOrNull() } ?: continue
            out.put(JSONObject().put("item", transform(item).toJson()).put("at", o.optLong("at")))
        }
        p[Keys.recents] = out.toString()
    }

    // ---- Operation history ----
    val history: Flow<List<HistoryEntry>> = store.data.map { p ->
        val arr = p[Keys.history]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val o = arr.getJSONObject(i)
                HistoryEntry(
                    id = o.getLong("id"),
                    title = o.getString("title"),
                    detail = o.optString("detail"),
                    status = OperationStatus.valueOf(o.getString("status")),
                    itemCount = o.optInt("count"),
                    bytes = o.optLong("bytes"),
                    finishedAt = o.getLong("at"),
                )
            }.getOrNull()
        }
    }.distinctUntilChanged()

    suspend fun addHistory(title: String, detail: String, status: OperationStatus, itemCount: Int, bytes: Long) =
        store.edit { p ->
            val seq = (p[Keys.historySeq] ?: 0L) + 1
            p[Keys.historySeq] = seq
            val arr = p[Keys.history]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
            val out = JSONArray()
            out.put(
                JSONObject().put("id", seq).put("title", title).put("detail", detail).put("status", status.name)
                    .put("count", itemCount).put("bytes", bytes).put("at", System.currentTimeMillis()),
            )
            for (i in 0 until minOf(arr.length(), MAX_HISTORY - 1)) arr.optJSONObject(i)?.let { out.put(it) }
            p[Keys.history] = out.toString()
        }

    suspend fun clearHistory() = store.edit { it.remove(Keys.history) }

    // ---- Picked folders (SAF) ----
    val pickedFolders: Flow<List<PickedFolder>> = store.data.map { p ->
        val arr = p[Keys.folders]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val o = arr.getJSONObject(i)
                PickedFolder(Uri.parse(o.getString("uri")), o.getString("name"), o.optLong("at"))
            }.getOrNull()
        }
    }.distinctUntilChanged()

    suspend fun addPickedFolder(folder: PickedFolder) = store.edit { p ->
        val existing = readFolders(p).filterNot { it.treeUri == folder.treeUri }
        writeFolders(p, existing + folder)
    }

    suspend fun removePickedFolder(treeUri: Uri) = store.edit { p ->
        writeFolders(p, readFolders(p).filterNot { it.treeUri == treeUri })
    }

    private fun readFolders(p: Preferences): List<PickedFolder> {
        val arr = p[Keys.folders]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val o = arr.getJSONObject(i)
                PickedFolder(Uri.parse(o.getString("uri")), o.getString("name"), o.optLong("at"))
            }.getOrNull()
        }
    }

    private fun writeFolders(p: MutablePreferences, list: List<PickedFolder>) {
        val arr = JSONArray()
        list.forEach { arr.put(JSONObject().put("uri", it.treeUri.toString()).put("name", it.name).put("at", it.addedAt)) }
        p[Keys.folders] = arr.toString()
    }

    // ---- Search history ----
    val searchHistory: Flow<List<String>> = store.data.map { p ->
        val arr = p[Keys.searches]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotBlank() } }
    }.distinctUntilChanged()

    suspend fun addSearch(query: String) {
        val q = query.trim()
        if (q.isEmpty()) return
        store.edit { p ->
            val arr = p[Keys.searches]?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
            val list = mutableListOf(q)
            for (i in 0 until arr.length()) {
                val s = arr.optString(i)
                if (s.isNotBlank() && !s.equals(q, ignoreCase = true) && list.size < MAX_SEARCHES) list.add(s)
            }
            p[Keys.searches] = JSONArray(list).toString()
        }
    }

    suspend fun clearSearchHistory() = store.edit { it.remove(Keys.searches) }

    private fun parseItems(json: String?): List<FileItem> {
        if (json.isNullOrEmpty()) return emptyList()
        val arr = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { runCatching { FileItem.fromJson(it) }.getOrNull() } }
    }

    private fun writeItems(items: List<FileItem>): String {
        val arr = JSONArray()
        items.forEach { arr.put(it.toJson()) }
        return arr.toString()
    }

    private companion object {
        const val MAX_RECENTS = 100
        const val MAX_HISTORY = 200
        const val MAX_SEARCHES = 15
    }
}

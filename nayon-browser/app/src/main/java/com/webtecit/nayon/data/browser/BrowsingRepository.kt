package com.webtecit.nayon.data.browser

import kotlinx.coroutines.flow.Flow

/** History and bookmarks. Private tabs never call [recordVisit]. */
class BrowsingRepository(
    private val history: HistoryDao,
    private val bookmarks: BookmarkDao,
    private val savedTabs: SavedTabDao,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun recentHistory(limit: Int = 500): Flow<List<HistoryEntry>> = history.recent(limit)
    fun searchHistory(query: String, limit: Int = 500): Flow<List<HistoryEntry>> = history.search(query, limit)

    /**
     * Records a visit. Reloading the same page within a minute updates the existing
     * entry instead of adding a duplicate.
     */
    suspend fun recordVisit(url: String, title: String) {
        val now = clock()
        val last = history.latest()
        if (last != null && last.url == url && now - last.visitedAt < DUPLICATE_WINDOW_MS) {
            history.touch(last.id, title.ifBlank { last.title }, now)
        } else {
            history.insert(HistoryEntry(url = url, title = title, visitedAt = now))
        }
    }

    suspend fun updateTitle(url: String, title: String) {
        if (title.isNotBlank()) history.updateLatestTitle(url, title)
    }

    suspend fun deleteHistory(id: Long) = history.delete(id)
    suspend fun clearHistory() = history.clear()
    suspend fun clearHistorySince(since: Long) = if (since <= 0L) history.clear() else history.deleteSince(since)
    fun historyCountSince(since: Long): Flow<Int> = history.countSince(since)

    fun bookmarks(): Flow<List<Bookmark>> = bookmarks.all()
    fun searchBookmarks(query: String): Flow<List<Bookmark>> = bookmarks.search(query)
    fun bookmarkedUrls(): Flow<List<String>> = bookmarks.urls()

    suspend fun addBookmark(url: String, title: String) {
        bookmarks.upsert(Bookmark(url = url, title = title.ifBlank { url }, createdAt = clock()))
    }

    suspend fun removeBookmark(url: String) = bookmarks.deleteByUrl(url)
    suspend fun deleteBookmark(id: Long) = bookmarks.delete(id)
    suspend fun renameBookmark(id: Long, title: String) = bookmarks.rename(id, title)

    suspend fun loadSavedTabs(): List<SavedTab> = savedTabs.all()
    suspend fun saveTabs(tabs: List<SavedTab>) = savedTabs.replaceAll(tabs)
    suspend fun clearSavedTabs() = savedTabs.clear()

    companion object {
        const val DUPLICATE_WINDOW_MS = 60_000L
    }
}

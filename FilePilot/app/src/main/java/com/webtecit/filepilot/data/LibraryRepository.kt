package com.webtecit.filepilot.data

import com.webtecit.filepilot.core.database.BookmarkEntity
import com.webtecit.filepilot.core.database.FavoriteEntity
import com.webtecit.filepilot.core.database.LibraryDao
import com.webtecit.filepilot.core.database.RecentEntity
import com.webtecit.filepilot.core.storage.FileItem
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** A saved reference to a file or folder (favorite, bookmark or recent). */
data class LibraryEntry(
    val id: String,
    val name: String,
    val isDirectory: Boolean,
    val time: Long,
)

/** Favorites, bookmarks and recent files, stored on the device only. */
@Singleton
class LibraryRepository @Inject constructor(
    private val dao: LibraryDao,
) {
    val favorites: Flow<List<LibraryEntry>> =
        dao.favorites().map { list -> list.map { LibraryEntry(it.id, it.name, it.isDirectory, it.addedAt) } }

    val favoriteIds: Flow<Set<String>> = dao.favorites().map { list -> list.mapTo(HashSet()) { it.id } }

    val bookmarks: Flow<List<LibraryEntry>> =
        dao.bookmarks().map { list -> list.map { LibraryEntry(it.id, it.label, true, it.addedAt) } }

    val recents: Flow<List<LibraryEntry>> =
        dao.recents(MAX_RECENTS).map { list -> list.map { LibraryEntry(it.id, it.name, it.isDirectory, it.openedAt) } }

    suspend fun setFavorite(items: List<FileItem>, favorite: Boolean) {
        val now = System.currentTimeMillis()
        for (item in items) {
            if (favorite) dao.upsertFavorite(FavoriteEntity(item.id, item.name, item.isDirectory, now))
            else dao.deleteFavorite(item.id)
        }
    }

    suspend fun removeFavorite(id: String) = dao.deleteFavorite(id)

    suspend fun addBookmark(id: String, label: String) =
        dao.upsertBookmark(BookmarkEntity(id, label, System.currentTimeMillis()))

    suspend fun removeBookmark(id: String) = dao.deleteBookmark(id)

    suspend fun addRecent(item: FileItem) {
        dao.upsertRecent(RecentEntity(item.id, item.name, item.isDirectory, System.currentTimeMillis()))
        dao.trimRecents(MAX_RECENTS)
    }

    suspend fun removeRecent(id: String) = dao.deleteRecent(id)

    suspend fun clearRecents() = dao.clearRecents()

    /** Keeps saved references pointing at an item after it was renamed or moved. */
    suspend fun onRenamed(oldId: String, newItem: FileItem) {
        dao.renameFavorite(oldId, newItem.id, newItem.name)
        dao.moveBookmark(oldId, newItem.id)
        dao.renameRecent(oldId, newItem.id, newItem.name)
    }

    suspend fun onDeleted(ids: Collection<String>) {
        for (id in ids) {
            dao.deleteFavorite(id)
            dao.deleteBookmark(id)
            dao.deleteRecent(id)
        }
    }

    private companion object {
        const val MAX_RECENTS = 100
    }
}

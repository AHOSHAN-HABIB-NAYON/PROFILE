package com.webtecit.nayon.data.browser

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "history", indices = [Index("visitedAt"), Index("url")])
data class HistoryEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val url: String,
    val title: String,
    val visitedAt: Long,
)

@Entity(tableName = "bookmarks", indices = [Index(value = ["url"], unique = true)])
data class Bookmark(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val url: String,
    val title: String,
    val createdAt: Long,
)

/** Normal (non-private) tabs, saved so they can be restored on the next launch. */
@Entity(tableName = "saved_tabs")
data class SavedTab(
    @PrimaryKey val id: String,
    val url: String?,
    val title: String,
    val position: Int,
    val isSelected: Boolean,
)

@Dao
interface HistoryDao {
    @Query("SELECT * FROM history ORDER BY visitedAt DESC LIMIT :limit")
    fun recent(limit: Int): Flow<List<HistoryEntry>>

    @Query(
        "SELECT * FROM history WHERE title LIKE '%' || :q || '%' OR url LIKE '%' || :q || '%' " +
            "ORDER BY visitedAt DESC LIMIT :limit",
    )
    fun search(q: String, limit: Int): Flow<List<HistoryEntry>>

    @Query("SELECT * FROM history WHERE id = (SELECT MAX(id) FROM history)")
    suspend fun latest(): HistoryEntry?

    @Insert
    suspend fun insert(entry: HistoryEntry): Long

    @Query("UPDATE history SET title = :title WHERE id = (SELECT MAX(id) FROM history WHERE url = :url)")
    suspend fun updateLatestTitle(url: String, title: String)

    @Query("UPDATE history SET visitedAt = :time, title = :title WHERE id = :id")
    suspend fun touch(id: Long, title: String, time: Long)

    @Query("DELETE FROM history WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM history")
    suspend fun clear()

    @Query("DELETE FROM history WHERE visitedAt >= :since")
    suspend fun deleteSince(since: Long)

    @Query("SELECT COUNT(*) FROM history WHERE visitedAt >= :since")
    fun countSince(since: Long): Flow<Int>

    @Query("DELETE FROM history WHERE visitedAt < :before")
    suspend fun deleteOlderThan(before: Long)
}

@Dao
interface BookmarkDao {
    @Query("SELECT * FROM bookmarks ORDER BY createdAt DESC")
    fun all(): Flow<List<Bookmark>>

    @Query("SELECT * FROM bookmarks WHERE title LIKE '%' || :q || '%' OR url LIKE '%' || :q || '%' ORDER BY createdAt DESC")
    fun search(q: String): Flow<List<Bookmark>>

    @Query("SELECT url FROM bookmarks")
    fun urls(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(bookmark: Bookmark): Long

    @Query("UPDATE bookmarks SET title = :title WHERE id = :id")
    suspend fun rename(id: Long, title: String)

    @Query("DELETE FROM bookmarks WHERE url = :url")
    suspend fun deleteByUrl(url: String)

    @Query("DELETE FROM bookmarks WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface SavedTabDao {
    @Query("SELECT * FROM saved_tabs ORDER BY position")
    suspend fun all(): List<SavedTab>

    @Query("DELETE FROM saved_tabs")
    suspend fun clear()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(tabs: List<SavedTab>)

    @Transaction
    suspend fun replaceAll(tabs: List<SavedTab>) {
        clear()
        insertAll(tabs)
    }
}

@Database(entities = [HistoryEntry::class, Bookmark::class, SavedTab::class], version = 1, exportSchema = false)
abstract class BrowserDatabase : RoomDatabase() {
    abstract fun historyDao(): HistoryDao
    abstract fun bookmarkDao(): BookmarkDao
    abstract fun savedTabDao(): SavedTabDao
}

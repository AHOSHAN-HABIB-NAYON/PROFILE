package com.webtecit.nayon.data.downloads

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

object DownloadStatus {
    const val QUEUED = 0
    const val RUNNING = 1
    const val PAUSED = 2
    const val COMPLETED = 3
    const val FAILED = 4
}

/** One download. Progress of each parallel segment is kept in [segments] so it can resume. */
@Entity(tableName = "downloads")
data class DownloadRecord(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val url: String,
    val fileName: String,
    val mimeType: String?,
    val totalBytes: Long = -1,
    val downloadedBytes: Long = 0,
    val status: Int = DownloadStatus.QUEUED,
    /** content:// (MediaStore, Android 10+) or file:// (app folder, Android 7–9). */
    val destUri: String? = null,
    /** "start:end:done;…" — empty until the first connection probes the server. */
    val segments: String = "",
    val rangeSupported: Boolean = false,
    val createdAt: Long,
    val finishedAt: Long = 0,
    val sourceHost: String = "",
    val userAgent: String? = null,
    /** Kept only while the download is unfinished, so it can resume after a restart. */
    val cookies: String? = null,
    val referer: String? = null,
    val error: String? = null,
    val isPrivate: Boolean = false,
)

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY createdAt DESC")
    fun all(): Flow<List<DownloadRecord>>

    @Query("SELECT * FROM downloads WHERE id = :id")
    suspend fun get(id: Long): DownloadRecord?

    @Insert
    suspend fun insert(record: DownloadRecord): Long

    @Update
    suspend fun update(record: DownloadRecord)

    @Query("UPDATE downloads SET downloadedBytes = :done, segments = :segments WHERE id = :id")
    suspend fun saveProgress(id: Long, done: Long, segments: String)

    @Query("DELETE FROM downloads WHERE id = :id")
    suspend fun delete(id: Long)

    /** Downloads cut off by the app being closed become "paused" so they can resume. */
    @Query("UPDATE downloads SET status = 2 WHERE status IN (0, 1)")
    suspend fun markInterrupted()
}

@Database(entities = [DownloadRecord::class], version = 1, exportSchema = false)
abstract class DownloadsDatabase : RoomDatabase() {
    abstract fun downloads(): DownloadDao
}

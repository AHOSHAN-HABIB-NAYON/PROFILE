package com.appfix.studio.data.db

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/** Kind of imported project. */
enum class ProjectKind { APK, SOURCE }

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val kind: ProjectKind,
    /** Framework display name for source projects, or the main detected framework for APKs. */
    val framework: String,
    val packageName: String?,
    val versionName: String?,
    val sizeBytes: Long,
    val sha256: String?,
    /** Where it came from: file name, GitHub URL, folder name or "Bundled sample". */
    val origin: String,
    val createdAt: Long,
    val updatedAt: Long,
    val lastErrorCount: Int? = null,
    val lastWarningCount: Int? = null,
)

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE id = :id")
    fun observe(id: String): Flow<ProjectEntity?>

    @Query("SELECT * FROM projects WHERE id = :id")
    suspend fun get(id: String): ProjectEntity?

    @Upsert
    suspend fun upsert(project: ProjectEntity)

    @Query("DELETE FROM projects WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE projects SET updatedAt = :time WHERE id = :id")
    suspend fun touch(id: String, time: Long = System.currentTimeMillis())

    @Query("UPDATE projects SET lastErrorCount = :errors, lastWarningCount = :warnings, updatedAt = :time WHERE id = :id")
    suspend fun setAnalysisCounts(id: String, errors: Int, warnings: Int, time: Long = System.currentTimeMillis())
}

@Database(entities = [ProjectEntity::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun projects(): ProjectDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "appfix.db").build()
    }
}

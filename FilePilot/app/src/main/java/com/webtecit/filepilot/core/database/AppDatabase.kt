package com.webtecit.filepilot.core.database

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey val id: String,
    val name: String,
    val isDirectory: Boolean,
    val addedAt: Long,
)

@Entity(tableName = "bookmarks")
data class BookmarkEntity(
    @PrimaryKey val id: String,
    val label: String,
    val addedAt: Long,
)

@Entity(tableName = "recents")
data class RecentEntity(
    @PrimaryKey val id: String,
    val name: String,
    val isDirectory: Boolean,
    val openedAt: Long,
)

/** A folder tree the user granted through the system folder picker (persisted URI permission). */
@Entity(tableName = "saf_roots")
data class SafRootEntity(
    @PrimaryKey val treeUri: String,
    val label: String,
    val addedAt: Long,
)

/** An item in the Recycle Bin: where it came from and where it is kept now. */
@Entity(tableName = "trash")
data class TrashEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val originalPath: String,
    val trashPath: String,
    val name: String,
    val isDirectory: Boolean,
    val size: Long,
    val deletedAt: Long,
)

/** A file stored encrypted in the Secure Folder. */
@Entity(tableName = "vault")
data class VaultEntity(
    @PrimaryKey val id: String,
    val name: String,
    val size: Long,
    val mime: String,
    val addedAt: Long,
)

@Dao
interface VaultDao {
    @Query("SELECT * FROM vault ORDER BY addedAt DESC")
    fun all(): Flow<List<VaultEntity>>

    @Upsert
    suspend fun upsert(entity: VaultEntity)

    @Query("DELETE FROM vault WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface TrashDao {
    @Query("SELECT * FROM trash ORDER BY deletedAt DESC")
    fun all(): Flow<List<TrashEntity>>

    @Query("SELECT * FROM trash WHERE deletedAt < :before")
    suspend fun olderThan(before: Long): List<TrashEntity>

    @androidx.room.Insert
    suspend fun insert(entity: TrashEntity): Long

    @Query("DELETE FROM trash WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface LibraryDao {
    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    fun favorites(): Flow<List<FavoriteEntity>>

    @Upsert
    suspend fun upsertFavorite(entity: FavoriteEntity)

    @Query("DELETE FROM favorites WHERE id = :id")
    suspend fun deleteFavorite(id: String)

    @Query("SELECT * FROM bookmarks ORDER BY addedAt DESC")
    fun bookmarks(): Flow<List<BookmarkEntity>>

    @Upsert
    suspend fun upsertBookmark(entity: BookmarkEntity)

    @Query("DELETE FROM bookmarks WHERE id = :id")
    suspend fun deleteBookmark(id: String)

    @Query("SELECT * FROM recents ORDER BY openedAt DESC LIMIT :limit")
    fun recents(limit: Int): Flow<List<RecentEntity>>

    @Upsert
    suspend fun upsertRecent(entity: RecentEntity)

    @Query("DELETE FROM recents WHERE id = :id")
    suspend fun deleteRecent(id: String)

    @Query("DELETE FROM recents WHERE id NOT IN (SELECT id FROM recents ORDER BY openedAt DESC LIMIT :keep)")
    suspend fun trimRecents(keep: Int)

    @Query("DELETE FROM recents")
    suspend fun clearRecents()

    @Query("UPDATE favorites SET id = :newId, name = :newName WHERE id = :oldId")
    suspend fun renameFavorite(oldId: String, newId: String, newName: String)

    @Query("UPDATE bookmarks SET id = :newId WHERE id = :oldId")
    suspend fun moveBookmark(oldId: String, newId: String)

    @Query("UPDATE recents SET id = :newId, name = :newName WHERE id = :oldId")
    suspend fun renameRecent(oldId: String, newId: String, newName: String)

    @Query("SELECT * FROM saf_roots ORDER BY addedAt ASC")
    fun safRoots(): Flow<List<SafRootEntity>>

    @Upsert
    suspend fun upsertSafRoot(entity: SafRootEntity)

    @Query("DELETE FROM saf_roots WHERE treeUri = :treeUri")
    suspend fun deleteSafRoot(treeUri: String)
}

@Database(
    entities = [FavoriteEntity::class, BookmarkEntity::class, RecentEntity::class, SafRootEntity::class, TrashEntity::class, VaultEntity::class],
    version = 3,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun libraryDao(): LibraryDao
    abstract fun trashDao(): TrashDao
    abstract fun vaultDao(): VaultDao
}

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "filepilot.db")
            .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
            .build()

    @Provides
    fun libraryDao(db: AppDatabase): LibraryDao = db.libraryDao()

    @Provides
    fun trashDao(db: AppDatabase): TrashDao = db.trashDao()

    @Provides
    fun vaultDao(db: AppDatabase): VaultDao = db.vaultDao()

    val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
        override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS `vault` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `size` INTEGER NOT NULL, " +
                    "`mime` TEXT NOT NULL, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            )
        }
    }

    val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
        override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS `trash` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `originalPath` TEXT NOT NULL, " +
                    "`trashPath` TEXT NOT NULL, `name` TEXT NOT NULL, `isDirectory` INTEGER NOT NULL, `size` INTEGER NOT NULL, `deletedAt` INTEGER NOT NULL)",
            )
        }
    }
}

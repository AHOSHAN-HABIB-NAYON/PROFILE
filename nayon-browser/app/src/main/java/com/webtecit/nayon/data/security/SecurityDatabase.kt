package com.webtecit.nayon.data.security

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/** A saved sign-in. The username and password are stored encrypted (see [VaultCrypto]). */
@Entity(tableName = "credentials", indices = [Index("origin")])
data class CredentialEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** Scheme + host (+ port), e.g. "https://accounts.google.com". */
    val origin: String,
    val usernameCipher: String,
    val passwordCipher: String,
    val createdAt: Long,
    val updatedAt: Long,
    val lastUsedAt: Long = 0,
)

/** Sites where the user chose "Never" for saving passwords. */
@Entity(tableName = "never_save")
data class NeverSaveEntity(@PrimaryKey val origin: String, val createdAt: Long)

/** A remembered website permission decision (camera, microphone, location, protected media). */
@Entity(tableName = "site_permissions", primaryKeys = ["origin", "kind"])
data class SitePermissionEntity(val origin: String, val kind: String, val allowed: Boolean, val updatedAt: Long)

@Dao
interface CredentialDao {
    @Query("SELECT * FROM credentials ORDER BY origin, id")
    fun all(): Flow<List<CredentialEntity>>

    @Query("SELECT * FROM credentials WHERE origin = :origin ORDER BY lastUsedAt DESC, id")
    suspend fun forOrigin(origin: String): List<CredentialEntity>

    @Query("SELECT * FROM credentials WHERE id = :id")
    suspend fun byId(id: Long): CredentialEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CredentialEntity): Long

    @Query("UPDATE credentials SET lastUsedAt = :time WHERE id = :id")
    suspend fun markUsed(id: Long, time: Long)

    @Query("DELETE FROM credentials WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM credentials")
    suspend fun clear()

    @Query("SELECT COUNT(*) FROM credentials WHERE origin = :origin")
    suspend fun countFor(origin: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addNeverSave(entity: NeverSaveEntity)

    @Query("SELECT COUNT(*) FROM never_save WHERE origin = :origin")
    suspend fun isNeverSave(origin: String): Int

    @Query("SELECT * FROM never_save ORDER BY origin")
    fun neverSave(): Flow<List<NeverSaveEntity>>

    @Query("DELETE FROM never_save WHERE origin = :origin")
    suspend fun removeNeverSave(origin: String)
}

@Dao
interface SitePermissionDao {
    @Query("SELECT * FROM site_permissions ORDER BY origin, kind")
    fun all(): Flow<List<SitePermissionEntity>>

    @Query("SELECT * FROM site_permissions WHERE origin = :origin")
    suspend fun forOrigin(origin: String): List<SitePermissionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun set(entity: SitePermissionEntity)

    @Query("DELETE FROM site_permissions WHERE origin = :origin AND kind = :kind")
    suspend fun remove(origin: String, kind: String)

    @Query("DELETE FROM site_permissions WHERE origin = :origin")
    suspend fun removeOrigin(origin: String)

    @Query("DELETE FROM site_permissions")
    suspend fun clear()
}

@Database(
    entities = [CredentialEntity::class, NeverSaveEntity::class, SitePermissionEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class SecurityDatabase : RoomDatabase() {
    abstract fun credentials(): CredentialDao
    abstract fun sitePermissions(): SitePermissionDao
}

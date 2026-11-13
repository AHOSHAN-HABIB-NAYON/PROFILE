package com.webtecit.devicepilot.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import com.webtecit.devicepilot.domain.model.ChargingSession
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "charging_sessions")
data class ChargingSessionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val startTime: Long,
    val endTime: Long? = null,
    val startLevel: Int,
    val endLevel: Int? = null,
    val source: String,
    val maxTemperatureC: Float? = null,
) {
    fun toDomain() = ChargingSession(id, startTime, endTime, startLevel, endLevel, source, maxTemperatureC)
}

@Dao
interface ChargingDao {
    @Insert
    suspend fun insert(session: ChargingSessionEntity): Long

    @Query("SELECT * FROM charging_sessions WHERE endTime IS NULL ORDER BY startTime DESC LIMIT 1")
    suspend fun openSession(): ChargingSessionEntity?

    @Query("UPDATE charging_sessions SET endTime = :endTime, endLevel = :endLevel WHERE id = :id")
    suspend fun close(id: Long, endTime: Long, endLevel: Int)

    @Query("UPDATE charging_sessions SET maxTemperatureC = :temp WHERE id = :id AND (maxTemperatureC IS NULL OR maxTemperatureC < :temp)")
    suspend fun updateMaxTemperature(id: Long, temp: Float)

    @Query("SELECT * FROM charging_sessions ORDER BY startTime DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<ChargingSessionEntity>>

    @Query("DELETE FROM charging_sessions")
    suspend fun clear()

    @Query("DELETE FROM charging_sessions WHERE startTime < :before")
    suspend fun deleteOlderThan(before: Long)
}

@Database(entities = [ChargingSessionEntity::class], version = 1, exportSchema = true)
abstract class DevicepilotDatabase : RoomDatabase() {
    abstract fun chargingDao(): ChargingDao
}

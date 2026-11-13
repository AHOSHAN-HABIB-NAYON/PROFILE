package com.webtecit.devicepilot.data.repository

import com.webtecit.devicepilot.data.local.ChargingDao
import com.webtecit.devicepilot.data.local.ChargingSessionEntity
import com.webtecit.devicepilot.domain.model.BatteryStatus
import com.webtecit.devicepilot.domain.model.ChargingSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChargingHistoryRepository @Inject constructor(private val dao: ChargingDao) {

    fun recent(limit: Int = 30): Flow<List<ChargingSession>> = dao.observeRecent(limit).map { list -> list.map { it.toDomain() } }

    /** Called when power is connected (receiver) or when a plugged-in state is first seen. */
    suspend fun onPluggedIn(status: BatteryStatus) {
        if (dao.openSession() != null) return
        dao.insert(
            ChargingSessionEntity(
                startTime = System.currentTimeMillis(),
                startLevel = status.levelPercent,
                source = status.source.label,
                maxTemperatureC = status.temperatureC.valueOrNull,
            ),
        )
        dao.deleteOlderThan(System.currentTimeMillis() - 90L * 24 * 3_600_000)
    }

    suspend fun onUnplugged(status: BatteryStatus) {
        val open = dao.openSession() ?: return
        dao.close(open.id, System.currentTimeMillis(), status.levelPercent)
    }

    /** Keeps the open session's peak temperature up to date while the app or the monitor runs. */
    suspend fun sample(status: BatteryStatus) {
        if (status.isPluggedIn) {
            if (dao.openSession() == null) onPluggedIn(status)
            val open = dao.openSession() ?: return
            status.temperatureC.valueOrNull?.let { dao.updateMaxTemperature(open.id, it) }
        } else {
            onUnplugged(status)
        }
    }

    suspend fun clear() = dao.clear()
}

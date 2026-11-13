package com.webtecit.devicepilot.data.repository

import com.webtecit.devicepilot.domain.model.BatteryStatus
import com.webtecit.devicepilot.domain.model.CpuStatus
import com.webtecit.devicepilot.domain.model.MemoryStatus
import com.webtecit.devicepilot.domain.model.NetworkStatus
import com.webtecit.devicepilot.domain.model.StorageStatus
import com.webtecit.devicepilot.domain.model.ThermalStatus
import com.webtecit.devicepilot.domain.model.TrafficSnapshot
import com.webtecit.devicepilot.domain.usecase.HealthScoreCalculator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.onStart
import javax.inject.Inject
import javax.inject.Singleton

data class LiveSnapshot(
    val battery: BatteryStatus?,
    val memory: MemoryStatus,
    val storage: StorageStatus,
    val cpu: CpuStatus,
    val thermal: ThermalStatus,
    val network: NetworkStatus?,
    val traffic: TrafficSnapshot?,
    val health: HealthScoreCalculator.Result,
)

/** One polling loop shared by the dashboard, health and performance screens. */
@Singleton
class LiveStatusRepository @Inject constructor(
    private val battery: BatteryRepository,
    private val system: SystemRepository,
    private val network: NetworkRepository,
    private val history: ChargingHistoryRepository,
    private val calculator: HealthScoreCalculator,
) {

    private data class Tick(val battery: BatteryStatus?, val memory: MemoryStatus, val storage: StorageStatus, val cpu: CpuStatus, val thermal: ThermalStatus)

    private fun ticks(intervalMs: Long): Flow<Tick> = flow {
        var storage = system.storage()
        var n = 0
        while (true) {
            if (n++ % 10 == 0) storage = system.storage() // storage changes slowly; StatFs is cheaper every 10th tick
            val bat = battery.current()
            bat?.let { runCatching { history.sample(it) } }
            emit(Tick(bat, system.memory(), storage, system.cpu(), system.thermal()))
            delay(intervalMs)
        }
    }.flowOn(Dispatchers.IO)

    fun snapshots(intervalMs: Long): Flow<LiveSnapshot> {
        val networkFlow: Flow<NetworkStatus?> = network.observe()
        return combine(
        ticks(intervalMs),
        networkFlow.onStart { emit(null) },
        network.traffic(intervalMs).onStart { emit(null) },
    ) { t, net, traffic ->
        LiveSnapshot(
            battery = t.battery,
            memory = t.memory,
            storage = t.storage,
            cpu = t.cpu,
            thermal = t.thermal,
            network = net,
            traffic = traffic,
            health = calculator.calculate(
                HealthScoreCalculator.Inputs(
                    batteryHealth = t.battery?.health,
                    batteryTemperatureC = t.battery?.temperatureC?.valueOrNull,
                    storageFreeFraction = t.storage.freeFraction.takeIf { t.storage.totalBytes > 0 },
                    ramAvailableFraction = t.memory.availableFraction.takeIf { t.memory.totalBytes > 0 },
                    thermalLevel = t.thermal.level.valueOrNull,
                ),
            ),
        )
    }
    }
}

package com.webtecit.devicepilot.data.system

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.BatteryRepository
import com.webtecit.devicepilot.data.repository.ChargingHistoryRepository
import com.webtecit.devicepilot.data.repository.SystemRepository
import com.webtecit.devicepilot.domain.model.ChargeState
import com.webtecit.devicepilot.core.navigation.Routes
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * Lightweight periodic check (every 15 minutes, the WorkManager minimum). It reads a few values
 * and exits; no foreground service or wake locks are used.
 */
@HiltWorker
class MonitorWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val battery: BatteryRepository,
    private val system: SystemRepository,
    private val history: ChargingHistoryRepository,
    private val settings: SettingsRepository,
    private val notifier: Notifier,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val prefs = settings.current()
        val status = battery.current() ?: return Result.success()
        history.sample(status)
        if (!prefs.notificationsEnabled) return Result.success()
        val now = System.currentTimeMillis()

        val temp = status.temperatureC.valueOrNull
        if (prefs.overheatAlerts && temp != null && temp >= OVERHEAT_C && now - settings.lastOverheatAlert() > 60 * 60_000) {
            notifier.post(Notifier.ID_OVERHEAT, Notifier.CHANNEL_ALERTS, "Phone is getting hot",
                "Battery temperature is ${Formatters.celsius(temp)}. Let the phone rest and avoid charging or gaming until it cools.", Routes.COOLING)
            settings.setLastOverheatAlert(now)
        }

        val storage = system.storage()
        if (prefs.storageWarnings && storage.freeFraction < LOW_STORAGE && now - settings.lastStorageAlert() > 24 * 60 * 60_000) {
            notifier.post(Notifier.ID_STORAGE, Notifier.CHANNEL_ALERTS, "Storage is almost full",
                "Only ${Formatters.bytes(storage.freeBytes)} free. Review large and duplicate files.", Routes.STORAGE)
            settings.setLastStorageAlert(now)
        }

        if (prefs.chargingNotifications && status.isPluggedIn &&
            (status.chargeState == ChargeState.FULL || status.levelPercent >= 100) && !settings.fullChargeNotified()
        ) {
            notifier.post(Notifier.ID_FULL, Notifier.CHANNEL_CHARGING, "Battery fully charged", "You can unplug the charger.", Routes.CHARGING)
            settings.setFullChargeNotified(true)
        }
        return Result.success()
    }

    companion object {
        private const val NAME = "device_monitor"
        const val OVERHEAT_C = 45f
        const val LOW_STORAGE = 0.10f

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<MonitorWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}

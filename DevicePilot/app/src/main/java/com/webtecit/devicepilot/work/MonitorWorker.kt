package com.webtecit.devicepilot.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.webtecit.devicepilot.DevicePilotApp
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.Pressure
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import com.webtecit.devicepilot.ui.common.thermalLabelRes
import java.util.concurrent.TimeUnit

/**
 * Periodic (15 min minimum, battery-friendly) check that posts the optional alerts the
 * user enabled. It never runs if no alert is enabled.
 */
class MonitorWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val c = DevicePilotApp.container(applicationContext)
        val s = c.settings.current()
        if (!s.anyNotification) return Result.success()
        val ctx = applicationContext

        if (s.notifyTemperature) {
            val b = c.monitor.battery()
            val t = b.celsius
            if (t != null && t >= s.temperatureThresholdC) {
                Notifier.temperature(ctx, TemperatureUtils.format(t, s.temperatureUnit))
            }
        }
        if (s.notifyThermal) {
            val th = c.monitor.thermal()
            if (th.supported && th.level.isSerious) {
                Notifier.thermal(ctx, ctx.getString(thermalLabelRes(th.level)))
            }
        }
        if (s.notifyStorage) {
            val st = c.monitor.storage()
            if (st != null && st.pressure == Pressure.HIGH) Notifier.storage(ctx, Formatters.bytes(st.freeBytes))
        }
        if (s.notifyData && c.usage.hasUsageAccess()) {
            val range = UsagePeriods.range(UsagePeriod.BILLING_CYCLE, System.currentTimeMillis(), s.billingDay)
            val totals = c.usage.deviceTotals(range)
            val mobile = totals.mobileTotal
            val key = "${range.start}"
            if (mobile != null && mobile >= s.dataThresholdMb * 1024L * 1024L && c.settings.lastDataAlertKey() != key) {
                Notifier.data(ctx, Formatters.bytes(mobile))
                c.settings.setLastDataAlertKey(key)
            }
        }
        return Result.success()
    }

    companion object {
        private const val NAME = "devicepilot_monitor"

        fun schedule(context: Context, enabled: Boolean) {
            val wm = WorkManager.getInstance(context)
            if (enabled) {
                val req = PeriodicWorkRequestBuilder<MonitorWorker>(15, TimeUnit.MINUTES).build()
                wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
            } else {
                wm.cancelUniqueWork(NAME)
            }
        }
    }
}

package com.webtecit.devicepilot.data.system

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.BatteryRepository
import com.webtecit.devicepilot.data.repository.ChargingHistoryRepository
import com.webtecit.devicepilot.di.AppScope
import com.webtecit.devicepilot.core.navigation.Routes
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Records charging sessions and posts optional charger notifications. */
@AndroidEntryPoint
class PowerConnectionReceiver : BroadcastReceiver() {

    @Inject lateinit var battery: BatteryRepository
    @Inject lateinit var history: ChargingHistoryRepository
    @Inject lateinit var settings: SettingsRepository
    @Inject lateinit var notifier: Notifier
    @Inject @AppScope lateinit var scope: CoroutineScope

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_POWER_CONNECTED && action != Intent.ACTION_POWER_DISCONNECTED) return
        val pending = goAsync()
        scope.launch {
            try {
                val status = battery.current() ?: return@launch
                val prefs = settings.current()
                if (action == Intent.ACTION_POWER_CONNECTED) {
                    history.onPluggedIn(status)
                    settings.setFullChargeNotified(false)
                    if (prefs.notificationsEnabled && prefs.chargingNotifications) {
                        notifier.post(Notifier.ID_CHARGING, Notifier.CHANNEL_CHARGING, "Charger connected",
                            "Battery at ${status.levelPercent}% · ${status.source.label}", Routes.CHARGING)
                    }
                } else {
                    history.onUnplugged(status)
                    if (prefs.notificationsEnabled && prefs.chargingNotifications) {
                        notifier.post(Notifier.ID_CHARGING, Notifier.CHANNEL_CHARGING, "Charger disconnected",
                            "Battery at ${status.levelPercent}%", Routes.CHARGING)
                    }
                }
            } finally {
                pending.finish()
            }
        }
    }
}

package com.webtecit.devicepilot

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.system.MonitorWorker
import com.webtecit.devicepilot.data.system.Notifier
import com.webtecit.devicepilot.di.AppScope
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class DevicepilotApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var notifier: Notifier
    @Inject lateinit var settings: SettingsRepository
    @Inject @AppScope lateinit var appScope: CoroutineScope

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        notifier.createChannels()
        appScope.launch {
            if (settings.current().backgroundMonitoring) MonitorWorker.schedule(this@DevicepilotApp)
            else MonitorWorker.cancel(this@DevicepilotApp)
        }
    }
}

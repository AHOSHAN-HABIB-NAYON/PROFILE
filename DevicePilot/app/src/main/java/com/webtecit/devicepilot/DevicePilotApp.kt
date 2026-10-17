package com.webtecit.devicepilot

import android.app.Application
import android.content.Context
import com.webtecit.devicepilot.data.AppsRepository
import com.webtecit.devicepilot.data.DeviceMonitor
import com.webtecit.devicepilot.data.SettingsRepository
import com.webtecit.devicepilot.data.UsageRepository
import com.webtecit.devicepilot.data.install.ApkInspector
import com.webtecit.devicepilot.data.install.AppInstaller
import com.webtecit.devicepilot.work.Notifier

/** Simple manual dependency container (no reflection, no DI framework needed). */
class AppContainer(context: Context) {
    val settings = SettingsRepository(context)
    val monitor = DeviceMonitor(context)
    val apps = AppsRepository(context)
    val usage = UsageRepository(context, apps)
    val hider = com.webtecit.devicepilot.hider.AppHider(context)
    val online = com.webtecit.devicepilot.data.OnlineLookup(context)
    val hardware = com.webtecit.devicepilot.data.HardwareInfo(context)
    val details = com.webtecit.devicepilot.data.DeviceDetailsReader(context)
    val running = com.webtecit.devicepilot.data.RunningAppsRepository(context, apps)
    val apkInspector = ApkInspector(context)
    val installer = AppInstaller(context)
    val temperatureHistory = TemperatureHistory()
}

/** In-memory history of readings taken while monitoring is visible (cleared when the app process ends). */
class TemperatureHistory(private val capacity: Int = 120) {
    data class Point(val time: Long, val batteryC: Float)

    private val points = ArrayDeque<Point>()

    @Synchronized
    fun add(p: Point) {
        val last = points.lastOrNull()
        if (last != null && p.time - last.time < 1000) return
        points.addLast(p)
        while (points.size > capacity) points.removeFirst()
    }

    @Synchronized
    fun snapshot(): List<Point> = points.toList()
}

class DevicePilotApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifier.createChannels(this)
    }

    companion object {
        fun container(context: Context): AppContainer =
            (context.applicationContext as DevicePilotApp).container
    }
}

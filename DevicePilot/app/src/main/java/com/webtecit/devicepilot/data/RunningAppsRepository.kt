package com.webtecit.devicepilot.data

import android.app.ActivityManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class RunState { FOREGROUND, BACKGROUND_SERVICE, RECENT }

data class RunningApp(
    val packageName: String,
    val label: String,
    val state: RunState,
    val lastActive: Long,
    val serviceCount: Int,
    val isSystem: Boolean,
)

/**
 * Android 8+ hides other apps' processes from regular apps, so "running" is derived from the
 * official usage event log (needs Usage Access): apps whose foreground service started and has
 * not stopped (Android 10+ reports these events), and apps used recently that Android usually
 * keeps cached in memory.
 */
class RunningAppsRepository(private val context: Context, private val apps: AppsRepository) {

    private val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

    suspend fun load(recentWindowMs: Long = 60 * 60 * 1000L): List<RunningApp> = withContext(Dispatchers.IO) {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(now - 12 * 60 * 60 * 1000L, now)
        val e = UsageEvents.Event()
        val services = HashMap<String, MutableSet<String>>()
        val last = HashMap<String, Long>()
        val resumed = HashMap<String, Boolean>()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val pkg = e.packageName ?: continue
            last[pkg] = maxOf(last[pkg] ?: 0L, e.timeStamp)
            when (e.eventType) {
                EVENT_RESUMED -> resumed[pkg] = true
                EVENT_PAUSED, EVENT_STOPPED -> resumed[pkg] = false
                EVENT_FGS_START -> services.getOrPut(pkg) { mutableSetOf() }.add(e.className ?: "")
                EVENT_FGS_STOP -> services[pkg]?.remove(e.className ?: "")
            }
        }
        val own = context.packageName
        last.keys.asSequence()
            .filter { it != own && apps.isInstalled(it) }
            .mapNotNull { pkg ->
                val svc = services[pkg]?.size ?: 0
                val lastTime = last[pkg] ?: 0L
                val state = when {
                    resumed[pkg] == true -> RunState.FOREGROUND
                    svc > 0 -> RunState.BACKGROUND_SERVICE
                    now - lastTime <= recentWindowMs -> RunState.RECENT
                    else -> return@mapNotNull null
                }
                val entry = apps.getApp(pkg)
                RunningApp(pkg, entry?.label ?: apps.labelFor(pkg), state, lastTime, svc, entry?.isSystem ?: false)
            }
            .sortedWith(compareBy<RunningApp> { it.state.ordinal }.thenByDescending { it.lastActive })
            .toList()
    }

    /**
     * Asks Android to close the app's cached background process. Apps that are visible or run a
     * foreground service are not affected, and Android may restart an app later.
     */
    fun closeBackground(pkg: String): Boolean = runCatching { am.killBackgroundProcesses(pkg); true }.getOrDefault(false)

    private companion object {
        // UsageEvents.Event constants (ACTIVITY_RESUMED = MOVE_TO_FOREGROUND, etc.).
        const val EVENT_RESUMED = 1
        const val EVENT_PAUSED = 2
        const val EVENT_FGS_START = 19
        const val EVENT_FGS_STOP = 20
        const val EVENT_STOPPED = 23
    }
}

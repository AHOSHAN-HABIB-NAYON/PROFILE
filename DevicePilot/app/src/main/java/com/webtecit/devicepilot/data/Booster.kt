package com.webtecit.devicepilot.data

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.provider.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File

data class BoostResult(
    val appsClosed: Int,
    val availableBefore: Long,
    val availableAfter: Long,
    val cacheFreed: Long,
) {
    val ramFreed: Long get() = availableAfter - availableBefore
}

/**
 * One-tap "Boost": asks Android to close the cached background processes of every user app
 * (ActivityManager.killBackgroundProcesses), clears DevicePilot's own cache and measures the
 * real free RAM before and after. Apps on screen, the launcher, the keyboard and apps running a
 * foreground service are not affected by Android.
 */
class Booster(private val context: Context, private val monitor: DeviceMonitor) {
    private val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

    private fun protectedPackages(): Set<String> {
        val pm = context.packageManager
        val home = runCatching {
            pm.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
                ?.activityInfo?.packageName
        }.getOrNull()
        val ime = runCatching {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)?.substringBefore('/')
        }.getOrNull()
        return setOfNotNull(context.packageName, home, ime)
    }

    @Suppress("DEPRECATION")
    suspend fun boost(): BoostResult = withContext(Dispatchers.IO) {
        val before = monitor.memory().availableBytes
        val skip = protectedPackages()
        val candidates = context.packageManager.getInstalledApplications(0)
            .filter { ai ->
                ai.packageName !in skip &&
                    (ai.flags and ApplicationInfo.FLAG_SYSTEM == 0 || ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0)
            }
        var closed = 0
        for (ai in candidates) {
            if (runCatching { am.killBackgroundProcesses(ai.packageName) }.isSuccess) closed++
        }
        val freed = clearOwnCache()
        delay(1_500) // give Android time to reclaim memory before measuring again
        val after = monitor.memory().availableBytes
        BoostResult(closed, before, after, freed)
    }

    private fun clearOwnCache(): Long {
        var freed = 0L
        context.cacheDir.listFiles()?.forEach { f ->
            val size = f.walkBottomUp().filter { it.isFile }.sumOf(File::length)
            if (f.deleteRecursively()) freed += size
        }
        return freed
    }
}

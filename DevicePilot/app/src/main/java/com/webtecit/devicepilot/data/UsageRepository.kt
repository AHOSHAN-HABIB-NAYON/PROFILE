package com.webtecit.devicepilot.data

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.Build
import android.os.Process
import com.webtecit.devicepilot.domain.AppDataUsage
import com.webtecit.devicepilot.domain.PermissionLogic
import com.webtecit.devicepilot.domain.PermissionStatus
import com.webtecit.devicepilot.domain.TimeRange
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class AppUsageInfo(val packageName: String, val foregroundMs: Long, val lastUsed: Long)

data class DeviceDataTotals(
    val wifiRx: Long?, val wifiTx: Long?, val mobileRx: Long?, val mobileTx: Long?,
) {
    val wifiTotal: Long? get() = if (wifiRx == null || wifiTx == null) null else wifiRx + wifiTx
    val mobileTotal: Long? get() = if (mobileRx == null || mobileTx == null) null else mobileRx + mobileTx
}

/** Usage Access–gated statistics: app usage time and network usage. */
class UsageRepository(private val context: Context, private val apps: AppsRepository) {

    fun usageAccessStatus(): PermissionStatus {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        val granted = context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) ==
            PackageManager.PERMISSION_GRANTED
        return PermissionLogic.usageAccess(mode, granted)
    }

    fun hasUsageAccess(): Boolean = usageAccessStatus() == PermissionStatus.GRANTED

    suspend fun appUsage(range: TimeRange): Map<String, AppUsageInfo> = withContext(Dispatchers.IO) {
        if (!hasUsageAccess()) return@withContext emptyMap()
        runCatching {
            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            usm.queryAndAggregateUsageStats(range.start, range.end).mapValues { (pkg, s) ->
                AppUsageInfo(pkg, s.totalTimeInForeground, s.lastTimeUsed)
            }
        }.getOrDefault(emptyMap())
    }

    /** App standby bucket of DevicePilot itself is not interesting; this returns the system's bucket for others when allowed. */
    fun isAppInactive(pkg: String): Boolean? = runCatching {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        usm.isAppInactive(pkg)
    }.getOrNull()

    suspend fun deviceTotals(range: TimeRange): DeviceDataTotals = withContext(Dispatchers.IO) {
        val nsm = context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
        fun query(type: Int): Pair<Long, Long>? = runCatching {
            val b = nsm.querySummaryForDevice(type, null, range.start, range.end)
            b.rxBytes to b.txBytes
        }.getOrNull()
        val wifi = query(ConnectivityManager.TYPE_WIFI)
        val mobile = query(ConnectivityManager.TYPE_MOBILE)
        DeviceDataTotals(wifi?.first, wifi?.second, mobile?.first, mobile?.second)
    }

    /** Per-app (per-UID) usage. Needs Usage Access; returns null when unavailable. */
    suspend fun perAppUsage(range: TimeRange): List<AppDataUsage>? = withContext(Dispatchers.IO) {
        if (!hasUsageAccess()) return@withContext null
        val nsm = context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
        val totals = HashMap<Int, LongArray>() // wifiRx, wifiTx, mobileRx, mobileTx
        var anySuccess = false
        for ((type, offset) in listOf(ConnectivityManager.TYPE_WIFI to 0, ConnectivityManager.TYPE_MOBILE to 2)) {
            runCatching {
                val stats = nsm.querySummary(type, null, range.start, range.end)
                val bucket = NetworkStats.Bucket()
                while (stats.hasNextBucket()) {
                    stats.getNextBucket(bucket)
                    val arr = totals.getOrPut(bucket.uid) { LongArray(4) }
                    arr[offset] += bucket.rxBytes
                    arr[offset + 1] += bucket.txBytes
                }
                stats.close()
                anySuccess = true
            }
        }
        if (!anySuccess) return@withContext null
        totals.map { (uid, a) ->
            val (label, pkg) = describeUid(uid)
            AppDataUsage(uid, label, pkg, a[0], a[1], a[2], a[3])
        }
    }

    private fun describeUid(uid: Int): Pair<String, String?> = when (uid) {
        NetworkStats.Bucket.UID_REMOVED -> "Removed apps" to null
        NetworkStats.Bucket.UID_TETHERING -> "Hotspot & tethering" to null
        Process.SYSTEM_UID -> "Android system" to "android"
        0 -> "Android OS (root)" to null
        else -> {
            val pkgs = apps.packageNamesForUid(uid)
            when {
                pkgs.isEmpty() -> "UID $uid" to null
                pkgs.size == 1 -> apps.labelFor(pkgs[0]) to pkgs[0]
                else -> "${apps.labelFor(pkgs[0])} +${pkgs.size - 1}" to pkgs[0]
            }
        }
    }
}

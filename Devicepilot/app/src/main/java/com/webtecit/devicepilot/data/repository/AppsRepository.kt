package com.webtecit.devicepilot.data.repository

import android.app.AppOpsManager
import android.app.usage.StorageStatsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.PermissionInfo
import android.graphics.Bitmap
import android.os.Build
import android.os.Process
import android.util.LruCache
import androidx.core.graphics.drawable.toBitmap
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.domain.model.AppEntry
import com.webtecit.devicepilot.domain.model.AppPermission
import com.webtecit.devicepilot.domain.model.AppSize
import com.webtecit.devicepilot.domain.model.AppUsage
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lists apps that have a launcher entry. This follows Android 11+ package visibility rules
 * through a <queries> element instead of QUERY_ALL_PACKAGES.
 */
@Singleton
class AppsRepository @Inject constructor(@ApplicationContext private val context: Context) {

    private val pm: PackageManager = context.packageManager
    private val iconCache = LruCache<String, Bitmap>(120)

    suspend fun launchableApps(): List<AppEntry> = withContext(Dispatchers.IO) {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = if (Build.VERSION.SDK_INT >= 33) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION") pm.queryIntentActivities(intent, 0)
        }
        resolved.map { it.activityInfo.packageName }.distinct().mapNotNull { pkg -> entry(pkg) }
            .sortedBy { it.label.lowercase() }
    }

    fun entry(packageName: String): AppEntry? = try {
        val info = packageInfo(packageName, 0)
        val app = info.applicationInfo ?: return null
        AppEntry(
            packageName = packageName,
            label = app.loadLabel(pm).toString(),
            versionName = info.versionName,
            versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong(),
            firstInstallTime = info.firstInstallTime,
            lastUpdateTime = info.lastUpdateTime,
            isSystem = app.flags and ApplicationInfo.FLAG_SYSTEM != 0,
            targetSdk = app.targetSdkVersion,
            minSdk = if (Build.VERSION.SDK_INT >= 24) app.minSdkVersion else null,
            installer = installerOf(packageName),
        )
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    private fun installerOf(pkg: String): String? = try {
        val installerPkg = if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(pkg).installingPackageName
        else @Suppress("DEPRECATION") pm.getInstallerPackageName(pkg)
        when (installerPkg) {
            null -> null
            "com.android.vending" -> "Google Play Store"
            "com.sec.android.app.samsungapps" -> "Galaxy Store"
            "com.xiaomi.market", "com.xiaomi.mipicks" -> "Xiaomi GetApps"
            "com.huawei.appmarket" -> "Huawei AppGallery"
            "com.google.android.packageinstaller", "com.android.packageinstaller" -> "Package installer (sideloaded)"
            else -> installerPkg
        }
    } catch (e: Exception) {
        null
    }

    fun icon(packageName: String, sizePx: Int): Bitmap? {
        iconCache.get(packageName)?.let { return it }
        return try {
            pm.getApplicationIcon(packageName).toBitmap(sizePx, sizePx).also { iconCache.put(packageName, it) }
        } catch (e: Exception) {
            null
        }
    }

    fun permissions(packageName: String): List<AppPermission> = try {
        val info = packageInfo(packageName, PackageManager.GET_PERMISSIONS)
        val names = info.requestedPermissions ?: emptyArray()
        val flags = info.requestedPermissionsFlags ?: IntArray(0)
        names.mapIndexed { i, name ->
            val granted = flags.getOrNull(i)?.and(PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0
            val dangerous = runCatching {
                val p = pm.getPermissionInfo(name, 0)
                val base = if (Build.VERSION.SDK_INT >= 28) p.protection else @Suppress("DEPRECATION") (p.protectionLevel and PermissionInfo.PROTECTION_MASK_BASE)
                base == PermissionInfo.PROTECTION_DANGEROUS
            }.getOrDefault(false)
            AppPermission(name, granted, dangerous)
        }.sortedWith(compareByDescending<AppPermission> { it.dangerous }.thenBy { it.name })
    } catch (e: Exception) {
        emptyList()
    }

    // ------------------------------------------------------------- usage access (optional, user-granted)

    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION") appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    suspend fun size(packageName: String): Reading<AppSize> = withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@withContext Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        if (!hasUsageAccess() && packageName != context.packageName) return@withContext Reading.Unavailable(UnavailableReason.PERMISSION_REQUIRED)
        try {
            val ssm = context.getSystemService(StorageStatsManager::class.java)
            val app = pm.getApplicationInfo(packageName, 0)
            val stats = ssm.queryStatsForPackage(app.storageUuid, packageName, Process.myUserHandle())
            Reading.Measured(AppSize(stats.appBytes, stats.dataBytes, stats.cacheBytes))
        } catch (e: SecurityException) {
            Reading.Unavailable(UnavailableReason.PERMISSION_REQUIRED)
        } catch (e: Exception) {
            Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        }
    }

    /** Foreground time over the last [hours]. Requires usage access granted by the user. */
    suspend fun recentUsage(hours: Int = 24): Reading<List<AppUsage>> = withContext(Dispatchers.IO) {
        if (!hasUsageAccess()) return@withContext Reading.Unavailable(UnavailableReason.PERMISSION_REQUIRED)
        try {
            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val end = System.currentTimeMillis()
            val start = end - hours * 3_600_000L
            val stats = usm.queryAndAggregateUsageStats(start, end)
            val list = stats.values
                .filter { it.totalTimeInForeground > 60_000 && it.packageName != context.packageName }
                .mapNotNull { s ->
                    val label = runCatching { pm.getApplicationInfo(s.packageName, 0).loadLabel(pm).toString() }.getOrNull()
                        ?: return@mapNotNull null
                    AppUsage(s.packageName, label, s.totalTimeInForeground, s.lastTimeUsed)
                }
                .sortedByDescending { it.foregroundMillis }
            Reading.Measured(list)
        } catch (e: Exception) {
            Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        }
    }

    fun launchIntent(packageName: String): Intent? = pm.getLaunchIntentForPackage(packageName)

    private fun packageInfo(pkg: String, flags: Int): PackageInfo =
        if (Build.VERSION.SDK_INT >= 33) pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(flags.toLong()))
        else @Suppress("DEPRECATION") pm.getPackageInfo(pkg, flags)
}

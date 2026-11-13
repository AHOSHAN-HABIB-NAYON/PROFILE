package com.webtecit.devicepilot.data

import android.app.usage.StorageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.os.Process
import android.os.storage.StorageManager
import android.util.LruCache
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.withContext

data class AppEntry(
    val packageName: String,
    val label: String,
    val versionName: String?,
    val versionCode: Long,
    val isSystem: Boolean,
    val isUpdatedSystem: Boolean,
    val firstInstall: Long,
    val lastUpdate: Long,
    val uid: Int,
    val enabled: Boolean,
    val launchable: Boolean,
    val targetSdk: Int,
    val minSdk: Int?,
    val installer: String?,
) {
    val isUserApp: Boolean get() = !isSystem
}

data class AppSize(val appBytes: Long, val dataBytes: Long, val cacheBytes: Long) {
    val total: Long get() = appBytes + dataBytes
}

class AppsRepository(private val context: Context) {

    private val pm: PackageManager = context.packageManager
    private val iconCache = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    suspend fun loadApps(): List<AppEntry> = withContext(Dispatchers.IO) {
        val launchable = runCatching {
            val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            pm.queryIntentActivitiesCompat(i).map { it.activityInfo.packageName }.toSet()
        }.getOrDefault(emptySet())
        pm.getInstalledPackagesCompat().mapNotNull { info -> info.toEntry(launchable) }
            .sortedBy { it.label.lowercase() }
    }

    fun getApp(packageName: String): AppEntry? = runCatching {
        val info = pm.getPackageInfoCompat(packageName)
        val launch = pm.getLaunchIntentForPackage(packageName) != null
        info.toEntry(if (launch) setOf(packageName) else emptySet())
    }.getOrNull()

    fun isInstalled(packageName: String): Boolean =
        runCatching { pm.getPackageInfoCompat(packageName); true }.getOrDefault(false)

    fun installedVersionCode(packageName: String): Long? =
        runCatching { pm.getPackageInfoCompat(packageName).longVersion() }.getOrNull()

    fun requestedPermissions(packageName: String): List<String> = runCatching {
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
        }
        info.requestedPermissions?.toList().orEmpty()
    }.getOrDefault(emptyList())

    suspend fun icon(packageName: String, sizePx: Int): Bitmap? {
        val key = "$packageName@$sizePx"
        iconCache.get(key)?.let { return it }
        return withContext(Dispatchers.IO) {
            runCatching { pm.getApplicationIcon(packageName).toBitmap(sizePx, sizePx) }.getOrNull()
                ?.also { iconCache.put(key, it) }
        }
    }

    /** Requires Usage Access on Android 8+. Returns null when not permitted or not available. */
    suspend fun appSize(packageName: String): AppSize? = withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < 26) return@withContext null
        runCatching {
            val ssm = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
            val stats = ssm.queryStatsForPackage(StorageManager.UUID_DEFAULT, packageName, Process.myUserHandle())
            AppSize(stats.appBytes, stats.dataBytes, stats.cacheBytes)
        }.getOrNull()
    }

    fun packageNamesForUid(uid: Int): List<String> = pm.getPackagesForUid(uid)?.toList().orEmpty()

    fun labelFor(packageName: String): String = runCatching {
        pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    }.getOrDefault(packageName)

    /** Emits whenever an app is installed, removed or updated. */
    fun packageChanges(): Flow<String?> = callbackFlow {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                trySend(intent?.data?.schemeSpecificPart)
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
        awaitClose { context.unregisterReceiver(receiver) }
    }

    private fun PackageInfo.toEntry(launchable: Set<String>): AppEntry? {
        val ai = applicationInfo ?: return null
        val system = ai.flags and ApplicationInfo.FLAG_SYSTEM != 0
        return AppEntry(
            packageName = packageName,
            label = runCatching { ai.loadLabel(pm).toString() }.getOrDefault(packageName),
            versionName = versionName,
            versionCode = longVersion(),
            isSystem = system,
            isUpdatedSystem = ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0,
            firstInstall = firstInstallTime,
            lastUpdate = lastUpdateTime,
            uid = ai.uid,
            enabled = ai.enabled,
            launchable = packageName in launchable,
            targetSdk = ai.targetSdkVersion,
            minSdk = ai.minSdkVersion,
            installer = installerOf(packageName),
        )
    }

    @Suppress("DEPRECATION")
    private fun installerOf(pkg: String): String? = runCatching {
        if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(pkg).installingPackageName
        else pm.getInstallerPackageName(pkg)
    }.getOrNull()
}

@Suppress("DEPRECATION")
fun PackageInfo.longVersion(): Long =
    if (Build.VERSION.SDK_INT >= 28) longVersionCode else versionCode.toLong()

@Suppress("DEPRECATION")
fun PackageManager.getInstalledPackagesCompat(): List<PackageInfo> =
    if (Build.VERSION.SDK_INT >= 33) getInstalledPackages(PackageManager.PackageInfoFlags.of(0))
    else getInstalledPackages(0)

@Suppress("DEPRECATION")
fun PackageManager.getPackageInfoCompat(pkg: String): PackageInfo =
    if (Build.VERSION.SDK_INT >= 33) getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
    else getPackageInfo(pkg, 0)

@Suppress("DEPRECATION")
fun PackageManager.queryIntentActivitiesCompat(intent: Intent) =
    if (Build.VERSION.SDK_INT >= 33) queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
    else queryIntentActivities(intent, 0)

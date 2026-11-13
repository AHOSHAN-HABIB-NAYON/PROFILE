package com.webtecit.filepilot.core.storage

import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.storage.StorageManager
import android.os.storage.StorageVolume
import com.webtecit.filepilot.core.common.IoDispatcher
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

enum class VolumeType { INTERNAL, SD_CARD, USB }

data class StorageVolumeInfo(
    /** Absolute path of the volume's root folder. */
    val rootId: String,
    val label: String,
    val type: VolumeType,
    val totalBytes: Long,
    val freeBytes: Long,
) {
    val usedBytes: Long get() = (totalBytes - freeBytes).coerceAtLeast(0)
    val usedFraction: Float get() = if (totalBytes > 0) usedBytes.toFloat() / totalBytes else 0f
}

/** Mounted storage volumes: internal shared storage, SD cards and (where mounted as a path) USB drives. */
@Singleton
class StorageVolumes @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    @Volatile
    private var cached: List<StorageVolumeInfo> = emptyList()

    /** The last result of [load], for synchronous lookups such as breadcrumbs. */
    val last: List<StorageVolumeInfo> get() = cached

    suspend fun load(): List<StorageVolumeInfo> = withContext(io) {
        val manager = context.getSystemService(StorageManager::class.java)
        val roots = LinkedHashMap<String, StorageVolume?>()
        val primaryPath = Environment.getExternalStorageDirectory().absolutePath
        roots[primaryPath] = runCatching { manager?.getStorageVolume(File(primaryPath)) }.getOrNull()
        if (Build.VERSION.SDK_INT >= 30 && manager != null) {
            for (v in manager.storageVolumes) {
                val state = v.state
                if (state != Environment.MEDIA_MOUNTED && state != Environment.MEDIA_MOUNTED_READ_ONLY) continue
                val dir = v.directory ?: continue
                roots.getOrPut(dir.absolutePath) { v }
            }
        }
        // Android 7–10 (and extra volumes on newer versions): derive roots from the app's own folders.
        for (dir in context.getExternalFilesDirs(null).filterNotNull()) {
            val path = dir.absolutePath
            val index = path.indexOf("/Android/data/")
            if (index <= 0) continue
            val root = path.substring(0, index)
            if (root !in roots) roots[root] = runCatching { manager?.getStorageVolume(File(root)) }.getOrNull()
        }
        val result = roots.mapNotNull { (path, volume) -> describe(path, volume, path == primaryPath) }
        cached = result
        result
    }

    /** The volume that contains [path], if any. */
    fun volumeOf(path: String): StorageVolumeInfo? =
        cached.filter { path == it.rootId || path.startsWith(it.rootId + "/") }.maxByOrNull { it.rootId.length }

    fun primaryRoot(): String = Environment.getExternalStorageDirectory().absolutePath

    private fun describe(path: String, volume: StorageVolume?, primary: Boolean): StorageVolumeInfo? {
        val stat = runCatching { StatFs(path) }.getOrNull() ?: return null
        val description = runCatching { volume?.getDescription(context) }.getOrNull().orEmpty()
        val type = when {
            primary || volume?.isPrimary == true -> VolumeType.INTERNAL
            description.contains("usb", ignoreCase = true) -> VolumeType.USB
            else -> VolumeType.SD_CARD
        }
        val label = when (type) {
            VolumeType.INTERNAL -> "Internal storage"
            VolumeType.USB -> description.ifBlank { "USB drive" }
            VolumeType.SD_CARD -> description.ifBlank { "SD card" }
        }
        return StorageVolumeInfo(
            rootId = path,
            label = label,
            type = type,
            totalBytes = stat.totalBytes,
            freeBytes = stat.availableBytes,
        )
    }
}

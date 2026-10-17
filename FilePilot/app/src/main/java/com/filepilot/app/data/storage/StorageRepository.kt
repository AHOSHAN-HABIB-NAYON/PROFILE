package com.filepilot.app.data.storage

import android.app.usage.StorageStatsManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.storage.StorageManager
import android.os.storage.StorageVolume
import com.filepilot.app.data.files.LocalFiles
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class VolumeInfo(
    val id: String,
    val label: String,
    /** Filesystem root, when known. */
    val path: String?,
    val isPrimary: Boolean,
    val isRemovable: Boolean,
    val totalBytes: Long,
    val freeBytes: Long,
    val readOnly: Boolean,
    /** The volume's StorageVolume, used to open the system folder picker at its root. */
    val volume: StorageVolume?,
) {
    val usedBytes: Long get() = (totalBytes - freeBytes).coerceAtLeast(0)
    val usedFraction: Float get() = if (totalBytes > 0) usedBytes.toFloat() / totalBytes else 0f
    val hasStats: Boolean get() = totalBytes > 0
}

/** Reads real capacity values from the system. Nothing here is estimated or invented. */
class StorageRepository(private val context: Context) {
    private val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager

    suspend fun volumes(): List<VolumeInfo> = withContext(Dispatchers.IO) {
        val result = mutableListOf<VolumeInfo>()
        result += primary()
        result += removable()
        result
    }

    private fun primary(): VolumeInfo {
        var total = 0L
        var free = 0L
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val stats = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
                total = stats.getTotalBytes(StorageManager.UUID_DEFAULT)
                free = stats.getFreeBytes(StorageManager.UUID_DEFAULT)
            } catch (_: Exception) {
                // Fall through to StatFs.
            }
        }
        if (total <= 0) {
            runCatching {
                val fs = StatFs(Environment.getDataDirectory().path)
                total = fs.totalBytes
                free = fs.availableBytes
            }
        }
        val primaryVolume = runCatching { storageManager.primaryStorageVolume }.getOrNull()
        return VolumeInfo(
            id = "primary",
            label = "Internal storage",
            path = LocalFiles.primaryRoot,
            isPrimary = true,
            isRemovable = false,
            totalBytes = total,
            freeBytes = free,
            readOnly = false,
            volume = primaryVolume,
        )
    }

    private fun removable(): List<VolumeInfo> {
        val volumes = runCatching { storageManager.storageVolumes }.getOrDefault(emptyList())
        return volumes.filter { v ->
            v.isRemovable && (v.state == Environment.MEDIA_MOUNTED || v.state == Environment.MEDIA_MOUNTED_READ_ONLY)
        }.mapNotNull { v ->
            val root = rootOf(v)
            var total = 0L
            var free = 0L
            if (root != null) {
                runCatching {
                    val fs = StatFs(root.path)
                    total = fs.totalBytes
                    free = fs.availableBytes
                }
            }
            VolumeInfo(
                id = v.uuid ?: root?.path ?: return@mapNotNull null,
                label = v.getDescription(context) ?: "SD card",
                path = root?.absolutePath,
                isPrimary = false,
                isRemovable = true,
                totalBytes = total,
                freeBytes = free,
                readOnly = v.state == Environment.MEDIA_MOUNTED_READ_ONLY,
                volume = v,
            )
        }
    }

    /** Volume root directory without reflection: API 30 exposes it, older versions derive it from app dirs. */
    private fun rootOf(volume: StorageVolume): File? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return volume.directory
        val dirs = context.getExternalFilesDirs(null)
        for (dir in dirs) {
            if (dir == null) continue
            val v = runCatching { storageManager.getStorageVolume(dir) }.getOrNull() ?: continue
            if (v == volume || (v.uuid != null && v.uuid == volume.uuid)) {
                val path = dir.absolutePath
                val idx = path.indexOf("/Android/data/")
                if (idx > 0) return File(path.substring(0, idx))
            }
        }
        return null
    }

    /** Free bytes for the volume holding [path]; -1 when unknown. */
    fun freeBytesAt(path: String): Long = runCatching { StatFs(path).availableBytes }.getOrDefault(-1L)
}

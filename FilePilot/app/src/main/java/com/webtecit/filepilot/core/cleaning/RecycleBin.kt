package com.webtecit.filepilot.core.cleaning

import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.database.TrashDao
import com.webtecit.filepilot.core.database.TrashEntity
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FsError
import com.webtecit.filepilot.core.storage.FsException
import com.webtecit.filepilot.core.storage.NameRules
import com.webtecit.filepilot.core.storage.StorageVolumes
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

/**
 * Keeps deleted files for 30 days in a hidden ".FilePilotTrash" folder on the same storage volume,
 * so moving there is an instant rename and restoring puts them back where they were.
 */
@Singleton
class RecycleBin @Inject constructor(
    private val dao: TrashDao,
    private val volumes: StorageVolumes,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    val items: Flow<List<TrashEntity>> = dao.all()

    /** True when [item] can go to the Recycle Bin (files on device storage). */
    fun supports(item: FileItem): Boolean = item.id.startsWith("/") && !item.id.contains("/$DIR_NAME/")

    /** Moves items to the Recycle Bin. Returns the ids that were moved; failures are listed in the exception. */
    suspend fun trash(items: List<FileItem>): List<String> = trashEntries(items).map { it.originalPath }

    /** Moves items to the Recycle Bin and returns their bin entries, so the move can be undone with [undo]. */
    suspend fun trashEntries(items: List<FileItem>): List<TrashEntity> = withContext(io) {
        if (volumes.last.isEmpty()) runCatching { volumes.load() }
        val moved = ArrayList<TrashEntity>()
        val failed = ArrayList<String>()
        for (item in items) {
            val source = File(item.id)
            val root = volumes.volumeOf(item.id)?.rootId ?: source.parentFile?.absolutePath ?: continue
            val dir = File(root, DIR_NAME).apply { mkdirs() }
            File(dir, ".nomedia").takeIf { !it.exists() }?.createNewFile()
            val target = File(dir, "${System.currentTimeMillis()}_${item.name}".take(240))
            // Folder sizes aren't counted here, so moving to the bin stays instant.
            val size = if (item.isDirectory) 0L else item.size
            if (source.renameTo(target)) {
                val entity = TrashEntity(originalPath = item.id, trashPath = target.absolutePath, name = item.name,
                    isDirectory = item.isDirectory, size = size, deletedAt = System.currentTimeMillis())
                val id = dao.insert(entity)
                moved += entity.copy(id = id)
            } else {
                failed += item.name
            }
        }
        if (failed.isNotEmpty()) throw FsException(FsError.ACCESS_DENIED, "Couldn't move ${failed.joinToString()} to the Recycle Bin.")
        moved
    }

    /** Puts an item back; if its place is taken it gets a "(1)" name. Returns the restored path. */
    suspend fun restore(entry: TrashEntity): String = withContext(io) {
        val source = File(entry.trashPath)
        if (!source.exists()) {
            dao.delete(entry.id)
            throw FsException(FsError.NOT_FOUND, "\"${entry.name}\" is no longer in the Recycle Bin.")
        }
        val original = File(entry.originalPath)
        val parent = original.parentFile ?: throw FsException(FsError.NOT_FOUND, "The original folder is unknown.")
        parent.mkdirs()
        val name = NameRules.uniqueName(original.name, parent.list()?.toList().orEmpty(), entry.isDirectory)
        val target = File(parent, name)
        if (!source.renameTo(target)) throw FsException(FsError.ACCESS_DENIED, "\"${entry.name}\" couldn't be restored.")
        dao.delete(entry.id)
        target.absolutePath
    }

    /** Puts just-trashed items back where they were (Undo). */
    suspend fun undo(entries: List<TrashEntity>) {
        entries.forEach { runCatching { restore(it) } }
    }

    suspend fun deleteForever(entry: TrashEntity) = withContext(io) {
        val f = File(entry.trashPath)
        if (f.exists() && !f.deleteRecursively()) throw FsException(FsError.ACCESS_DENIED, "\"${entry.name}\" couldn't be deleted.")
        dao.delete(entry.id)
    }

    /** Removes items kept longer than [KEEP_DAYS] days. */
    suspend fun purgeExpired() = withContext(io) {
        val before = System.currentTimeMillis() - KEEP_DAYS * DAY_MS
        dao.olderThan(before).forEach { runCatching { deleteForever(it) } }
    }

    companion object {
        const val DIR_NAME = ".FilePilotTrash"
        const val KEEP_DAYS = 30L
        const val DAY_MS = 24L * 60 * 60 * 1000
    }
}

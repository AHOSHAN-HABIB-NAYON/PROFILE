package com.filepilot.app.data.tools

import com.filepilot.app.core.model.FileItem
import com.filepilot.app.data.files.FileRepository
import com.filepilot.app.data.files.LocalFiles
import com.filepilot.app.permissions.AccessState
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

data class DuplicateGroup(val key: String, val size: Long, val items: List<FileItem>) {
    /** Space freed by keeping one copy. */
    val reclaimable: Long get() = size * (items.size - 1)
}

data class ScanProgress(val done: Int, val total: Int, val current: String)

/**
 * On-demand cleanup helpers. They only read; any removal goes through the normal,
 * confirmed delete flow.
 */
class CleanupRepository(private val repo: FileRepository) {

    /**
     * Finds files with identical size and extension. With [verifyContent], each candidate is
     * hashed with SHA-256 so only byte-identical files are grouped.
     */
    suspend fun findDuplicates(
        access: AccessState,
        verifyContent: Boolean,
        onProgress: (ScanProgress) -> Unit,
    ): List<DuplicateGroup> = withContext(Dispatchers.IO) {
        val files = repo.media.filesForDuplicateScan(access, MIN_DUPLICATE_SIZE)
            .filterNot { it.isDirectory || it.isHidden }
            .distinctBy { it.id }
        val bySize = files.groupBy { it.size to it.extension }.filter { it.value.size > 1 }
        if (!verifyContent) {
            return@withContext bySize.map { (k, v) -> DuplicateGroup("${k.first}:${k.second}", k.first, v) }
                .sortedByDescending { it.reclaimable }
        }
        val candidates = bySize.values.flatten()
        val total = candidates.size
        var done = 0
        val groups = mutableListOf<DuplicateGroup>()
        for ((key, items) in bySize) {
            val byHash = HashMap<String, MutableList<FileItem>>()
            for (item in items) {
                currentCoroutineContext().ensureActive()
                onProgress(ScanProgress(done, total, item.name))
                val hash = runCatching { sha256(item) }.getOrNull()
                done++
                if (hash != null) byHash.getOrPut(hash) { mutableListOf() }.add(item)
            }
            byHash.forEach { (hash, list) ->
                if (list.size > 1) groups += DuplicateGroup(hash, key.first, list)
            }
        }
        onProgress(ScanProgress(total, total, ""))
        groups.sortedByDescending { it.reclaimable }
    }

    private suspend fun sha256(item: FileItem): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(128 * 1024)
        repo.openInput(item).use { input ->
            while (true) {
                currentCoroutineContext().ensureActive()
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * Walks shared storage (full access only) and returns folders with no files and no
     * subfolders. App-private folders are skipped, as Android requires.
     */
    suspend fun findEmptyFolders(roots: List<String>, onProgress: (ScanProgress) -> Unit): List<FileItem> =
        withContext(Dispatchers.IO) {
            val result = mutableListOf<FileItem>()
            var visited = 0
            suspend fun walk(dir: File, depth: Int) {
                currentCoroutineContext().ensureActive()
                if (depth > MAX_DEPTH || visited > MAX_DIRS) return
                if (LocalFiles.isRestricted(dir.absolutePath)) return
                visited++
                if (visited % 50 == 0) onProgress(ScanProgress(visited, 0, dir.name))
                val children = dir.listFiles() ?: return
                if (children.isEmpty()) {
                    if (depth > 0) result += LocalFiles.toItem(dir, countChildren = false)
                    return
                }
                children.filter { it.isDirectory && !it.name.startsWith(".") }.forEach { walk(it, depth + 1) }
            }
            roots.forEach { walk(File(it), 0) }
            result.sortedBy { it.path }
        }

    private companion object {
        const val MIN_DUPLICATE_SIZE = 1024L
        const val MAX_DEPTH = 32
        const val MAX_DIRS = 100_000
    }
}

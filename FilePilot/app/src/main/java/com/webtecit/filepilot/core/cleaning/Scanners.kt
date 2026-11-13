package com.webtecit.filepilot.core.cleaning

import com.webtecit.filepilot.core.operations.Checksums
import com.webtecit.filepilot.core.operations.HashAlgorithm
import java.io.File
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/** Pure-Kotlin scanners used by the Cleaner; covered by JVM unit tests. */
object Scanners {

    /** Walks [root], skipping protected app folders and the Recycle Bin, calling [onFile] for files and [onDir] for folders. */
    suspend fun walk(root: File, onDir: (File) -> Unit = {}, onFile: (File) -> Unit) {
        val stack = ArrayDeque<File>()
        stack.addLast(root)
        while (stack.isNotEmpty()) {
            currentCoroutineContext().ensureActive()
            val dir = stack.removeLast()
            if (skip(root, dir)) continue
            onDir(dir)
            for (c in dir.listFiles().orEmpty()) if (c.isDirectory) stack.addLast(c) else onFile(c)
        }
    }

    private fun skip(root: File, dir: File): Boolean {
        val rel = dir.absolutePath.removePrefix(root.absolutePath).trim('/')
        return rel == "Android/data" || rel == "Android/obb" || rel.startsWith("Android/data/") || rel.startsWith("Android/obb/") ||
            dir.name == RecycleBin.DIR_NAME
    }

    /**
     * Groups identical files: first by size (cheap), then by SHA-256 of the content. Files smaller
     * than [minSize] are ignored. Each returned group has at least two files, newest first.
     */
    suspend fun duplicates(files: List<File>, minSize: Long = 1024, onProgress: (Int, Int) -> Unit = { _, _ -> }): List<List<File>> {
        val bySize = files.filter { it.length() >= minSize }.groupBy { it.length() }.values.filter { it.size > 1 }
        val total = bySize.sumOf { it.size }
        var done = 0
        val groups = ArrayList<List<File>>()
        for (candidates in bySize) {
            val byHash = HashMap<String, MutableList<File>>()
            for (f in candidates) {
                currentCoroutineContext().ensureActive()
                val hash = runCatching { Checksums.compute(f.inputStream(), HashAlgorithm.SHA256) }.getOrNull()
                done++
                onProgress(done, total)
                if (hash != null) byHash.getOrPut(hash) { ArrayList() }.add(f)
            }
            byHash.values.filter { it.size > 1 }.forEach { g -> groups += g.sortedByDescending { it.lastModified() } }
        }
        return groups.sortedByDescending { g -> g.first().length() * (g.size - 1) }
    }

    /** Folders that contain nothing at all (recursively), deepest first. */
    fun emptyFolders(dirs: List<File>): List<File> =
        dirs.filter { d -> d.walkTopDown().all { it.isDirectory } && d.list()?.isEmpty() != null }
            .sortedByDescending { it.absolutePath.count { c -> c == '/' } }

    private val tempExt = setOf("tmp", "temp", "bak", "old", "partial", "crdownload", "part", "dmp", "chk")

    fun isTemporary(f: File): Boolean {
        val name = f.name.lowercase()
        return name.substringAfterLast('.', "") in tempExt || name == "thumbs.db" || name == ".ds_store" ||
            f.parentFile?.name == ".thumbnails" || name.endsWith(".fmp-part")
    }
}

package com.appfix.core.archive

import com.appfix.core.util.CancelToken
import com.appfix.core.util.ProgressListener
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Writes a directory tree into a ZIP file (used for backups and source export). */
object DirectoryZipper {
    fun zip(
        root: File,
        output: File,
        exclude: (relativePath: String, isDirectory: Boolean) -> Boolean = { _, _ -> false },
        cancel: CancelToken = CancelToken.NONE,
        progress: ProgressListener = ProgressListener.NONE,
    ): Int {
        output.parentFile?.mkdirs()
        val tmp = File(output.parentFile, output.name + ".part")
        var count = 0
        try {
            ZipOutputStream(tmp.outputStream().buffered()).use { zos ->
                val base = root.canonicalFile
                fun walk(dir: File, prefix: String) {
                    val children = dir.listFiles()?.sortedBy { it.name } ?: return
                    for (child in children) {
                        cancel.throwIfCancelled()
                        // Never follow symlinks out of the tree.
                        if (child.canonicalFile.path != File(dir.canonicalFile, child.name).path) continue
                        val rel = if (prefix.isEmpty()) child.name else "$prefix/${child.name}"
                        if (exclude(rel, child.isDirectory)) continue
                        if (child.isDirectory) {
                            walk(child, rel)
                        } else if (child.isFile) {
                            val entry = ZipEntry(rel).apply { time = child.lastModified() }
                            zos.putNextEntry(entry)
                            child.inputStream().use { it.copyTo(zos, 64 * 1024) }
                            zos.closeEntry()
                            count++
                            progress.onProgress(count.toLong(), -1, rel)
                        }
                    }
                }
                walk(base, "")
            }
            if (output.exists()) output.delete()
            if (!tmp.renameTo(output)) throw java.io.IOException("Could not finalise ${output.name}")
        } finally {
            if (tmp.exists()) tmp.delete()
        }
        return count
    }
}

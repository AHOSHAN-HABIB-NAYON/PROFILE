package com.appfix.core.backup

import com.appfix.core.archive.DirectoryZipper
import com.appfix.core.archive.ExtractionPolicy
import com.appfix.core.archive.SafeZipExtractor
import com.appfix.core.util.CancelToken
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Serializable
data class Snapshot(val id: String, val label: String, val createdAt: Long, val fileCount: Int, val sizeBytes: Long)

/** Full-workspace backups stored as ZIP files outside the workspace. */
class SnapshotManager(private val workspace: File, private val backupDir: File) {
    private val json = Json { ignoreUnknownKeys = true }

    fun create(label: String, cancel: CancelToken = CancelToken.NONE): Snapshot {
        backupDir.mkdirs()
        val id = SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).format(Date())
        val zip = File(backupDir, "$id.zip")
        val count = DirectoryZipper.zip(workspace, zip, exclude = { rel, isDir -> isDir && rel.substringAfterLast('/') in EXCLUDED }, cancel = cancel)
        val snap = Snapshot(id, label.take(120), System.currentTimeMillis(), count, zip.length())
        File(backupDir, "$id.json").writeText(json.encodeToString(Snapshot.serializer(), snap))
        return snap
    }

    fun list(): List<Snapshot> = backupDir.listFiles { f -> f.extension == "json" }.orEmpty()
        .mapNotNull { runCatching { json.decodeFromString(Snapshot.serializer(), it.readText()) }.getOrNull() }
        .filter { File(backupDir, "${it.id}.zip").isFile }
        .sortedByDescending { it.createdAt }

    /** Replaces the workspace with the snapshot contents. The old workspace is swapped out atomically. */
    fun restore(id: String, cancel: CancelToken = CancelToken.NONE) {
        require(id.matches(Regex("[0-9-]{1,40}"))) { "Bad snapshot id" }
        val zip = File(backupDir, "$id.zip")
        require(zip.isFile) { "Backup not found" }
        val parent = workspace.absoluteFile.parentFile
        val staging = File(parent, ".restore-$id")
        staging.deleteRecursively()
        SafeZipExtractor(ExtractionPolicy(skipBuildOutputs = false, blockedExtensions = emptySet())).extract(zip, staging, cancel)
        val old = File(parent, ".old-${workspace.name}")
        old.deleteRecursively()
        if (workspace.exists() && !workspace.renameTo(old)) { staging.deleteRecursively(); throw java.io.IOException("Could not move the current workspace aside") }
        if (!staging.renameTo(workspace)) {
            old.renameTo(workspace)
            throw java.io.IOException("Could not restore the backup")
        }
        old.deleteRecursively()
    }

    fun delete(id: String) {
        require(id.matches(Regex("[0-9-]{1,40}"))) { "Bad snapshot id" }
        File(backupDir, "$id.zip").delete()
        File(backupDir, "$id.json").delete()
    }

    companion object {
        private val EXCLUDED = setOf("build", ".gradle", ".idea", ".cxx", ".kotlin", "node_modules", ".dart_tool")
    }
}

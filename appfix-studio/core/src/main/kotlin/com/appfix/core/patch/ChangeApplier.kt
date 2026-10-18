package com.appfix.core.patch

import com.appfix.core.util.PathSafety
import kotlinx.serialization.json.Json
import java.io.File
import com.appfix.core.util.B64

class ChangeConflictException(message: String) : RuntimeException(message)

/**
 * Applies and undoes [ChangeSet]s inside a project workspace.
 *
 * - Every path is validated to stay inside the workspace.
 * - A change is only applied if each file still matches its `before` content, so edits made
 *   elsewhere are never silently overwritten.
 * - Every applied change is recorded in [historyDir] so it can be undone later.
 */
class ChangeApplier(private val workspace: File, private val historyDir: File) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }

    fun validate(set: ChangeSet): List<String> {
        val problems = mutableListOf<String>()
        val seen = HashSet<String>()
        for (c in set.changes) {
            val target = PathSafety.resolveInside(workspace, c.path)
            if (target == null) { problems += "Unsafe path rejected: ${c.path}"; continue }
            if (!seen.add(PathSafety.normalizeRelative(c.path)!!)) problems += "Path appears twice in one change: ${c.path}"
            when (c.kind) {
                FileChange.Kind.CREATE -> if (target.exists()) problems += "${c.path} already exists"
                FileChange.Kind.MODIFY, FileChange.Kind.DELETE -> when {
                    !target.isFile -> problems += "${c.path} no longer exists"
                    !matches(target, c.before!!, c.isBinary) -> problems += "${c.path} changed since this proposal was made"
                }
            }
        }
        return problems
    }

    fun apply(set: ChangeSet): ChangeRecord {
        val problems = validate(set)
        if (problems.isNotEmpty()) throw ChangeConflictException(problems.joinToString("\n"))
        val record = ChangeRecord(set, System.currentTimeMillis(), ChangeState.APPLIED)
        save(record) // Persist first so an interrupted apply can still be undone.
        val done = mutableListOf<FileChange>()
        try {
            for (c in set.changes) {
                write(PathSafety.resolveInside(workspace, c.path)!!, c.after, c.isBinary)
                done += c
            }
        } catch (t: Throwable) {
            // Roll back what was written.
            done.asReversed().forEach { c -> runCatching { write(PathSafety.resolveInside(workspace, c.path)!!, c.before, c.isBinary) } }
            recordFile(set.id).delete()
            throw t
        }
        return record
    }

    /** Undoes an applied change. Fails if files were modified after the change, unless [force]. */
    fun undo(changeId: String, force: Boolean = false): ChangeRecord {
        val record = load(changeId) ?: throw IllegalArgumentException("Unknown change $changeId")
        check(record.state == ChangeState.APPLIED) { "Change is already undone" }
        val set = record.changeSet
        if (!force) {
            val conflicts = set.changes.mapNotNull { c ->
                val f = PathSafety.resolveInside(workspace, c.path)!!
                val ok = if (c.after == null) !f.exists() else f.isFile && matches(f, c.after, c.isBinary)
                if (ok) null else "${c.path} was edited after this change"
            }
            if (conflicts.isNotEmpty()) throw ChangeConflictException(conflicts.joinToString("\n"))
        }
        set.changes.asReversed().forEach { c -> write(PathSafety.resolveInside(workspace, c.path)!!, c.before, c.isBinary) }
        val updated = record.copy(state = ChangeState.UNDONE, undoneAt = System.currentTimeMillis())
        save(updated)
        return updated
    }

    fun history(): List<ChangeRecord> =
        historyDir.listFiles { f -> f.extension == "json" }.orEmpty()
            .mapNotNull { runCatching { json.decodeFromString(ChangeRecord.serializer(), it.readText()) }.getOrNull() }
            .sortedByDescending { it.appliedAt }

    fun load(id: String): ChangeRecord? = recordFile(id).takeIf { it.isFile }?.let { json.decodeFromString(ChangeRecord.serializer(), it.readText()) }

    private fun recordFile(id: String): File {
        require(id.matches(Regex("[A-Za-z0-9-]{1,64}"))) { "Bad change id" }
        return File(historyDir, "$id.json")
    }

    private fun save(record: ChangeRecord) {
        historyDir.mkdirs()
        atomicWrite(recordFile(record.changeSet.id), json.encodeToString(ChangeRecord.serializer(), record).toByteArray())
    }

    private fun matches(file: File, expected: String, binary: Boolean): Boolean =
        if (binary) file.readBytes().contentEquals(B64.decode(expected)) else file.readText() == expected

    private fun write(target: File, content: String?, binary: Boolean) {
        if (content == null) {
            target.delete()
            // Remove now-empty parent folders, but never the workspace itself.
            var p = target.parentFile
            while (p != null && p.canonicalPath != workspace.canonicalPath && p.list()?.isEmpty() == true) {
                p.delete(); p = p.parentFile
            }
            return
        }
        target.parentFile?.mkdirs()
        atomicWrite(target, if (binary) B64.decode(content) else content.toByteArray())
    }

    companion object {
        fun atomicWrite(target: File, bytes: ByteArray) {
            val tmp = File(target.parentFile, ".${target.name}.appfix-tmp")
            tmp.writeBytes(bytes)
            if (!tmp.renameTo(target)) {
                target.delete()
                if (!tmp.renameTo(target)) { tmp.delete(); throw java.io.IOException("Could not write ${target.name}") }
            }
        }
    }
}

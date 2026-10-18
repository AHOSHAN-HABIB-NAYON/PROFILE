package com.appfix.core.patch

import com.appfix.core.build.BuildPlanner
import com.appfix.core.util.PathSafety
import com.appfix.core.util.TextFiles
import java.io.File

/** One `@@ -a,b +c,d @@` block. Lines keep their leading ' ', '-' or '+'. */
data class Hunk(val oldStart: Int, val oldCount: Int, val newStart: Int, val newCount: Int, val lines: List<String>) {
    val oldLines: List<String> get() = lines.filter { it[0] != '+' }.map { it.substring(1) }
    val newLines: List<String> get() = lines.filter { it[0] != '-' }.map { it.substring(1) }
}

data class FilePatch(val oldPath: String?, val newPath: String?, val hunks: List<Hunk>) {
    val path: String get() = newPath ?: oldPath ?: ""
    val isCreate: Boolean get() = oldPath == null
    val isDelete: Boolean get() = newPath == null
}

class PatchParseException(message: String) : Exception(message)

/** Result of turning a patch into a reviewable [ChangeSet]. Nothing is written to disk here. */
data class PatchResult(val changeSet: ChangeSet?, val problems: List<String>, val files: List<FilePatch>) {
    val ok: Boolean get() = changeSet != null && problems.isEmpty()
}

/**
 * Parses and applies unified diffs (as produced by `git diff` or an AI assistant) to text files in a workspace.
 *
 * It is deliberately strict: every path must stay inside the project, secrets and binary files are refused,
 * and each hunk's context and removed lines must match the current file (a small line offset is tolerated).
 * A patch that does not match is rejected, never "best effort" applied.
 */
object UnifiedPatch {
    private val hunkHeader = Regex("""^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$""")
    const val MAX_FILES = 50
    const val MAX_FILE_BYTES = 2L * 1024 * 1024
    private const val MAX_OFFSET = 60

    fun parse(text: String): List<FilePatch> {
        val lines = text.replace("\r\n", "\n").split("\n")
        if (lines.any { it.startsWith("GIT binary patch") || it.startsWith("Binary files ") }) throw PatchParseException("Binary patches are not supported")
        val out = mutableListOf<FilePatch>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            if (!line.startsWith("--- ") || i + 1 >= lines.size || !lines[i + 1].startsWith("+++ ")) { i++; continue }
            val oldPath = pathOf(line.substring(4))
            val newPath = pathOf(lines[i + 1].substring(4))
            if (oldPath == null && newPath == null) throw PatchParseException("A file header names /dev/null twice")
            i += 2
            val hunks = mutableListOf<Hunk>()
            while (i < lines.size && lines[i].startsWith("@@")) {
                val m = hunkHeader.matchEntire(lines[i]) ?: throw PatchParseException("Malformed hunk header: ${lines[i]}")
                val oldStart = m.groupValues[1].toInt(); val oldCount = m.groupValues[2].ifEmpty { "1" }.toInt()
                val newStart = m.groupValues[3].toInt(); val newCount = m.groupValues[4].ifEmpty { "1" }.toInt()
                i++
                val body = mutableListOf<String>()
                var seenOld = 0; var seenNew = 0
                while (i < lines.size && (seenOld < oldCount || seenNew < newCount)) {
                    val l = lines[i]
                    when {
                        l.startsWith("\\") -> { i++; continue } // "\ No newline at end of file"
                        l.isEmpty() -> { body += " "; seenOld++; seenNew++ } // some tools strip the space of blank context lines
                        l[0] == ' ' -> { body += l; seenOld++; seenNew++ }
                        l[0] == '-' -> { body += l; seenOld++ }
                        l[0] == '+' -> { body += l; seenNew++ }
                        else -> throw PatchParseException("Unexpected line in hunk for ${newPath ?: oldPath}: $l")
                    }
                    i++
                }
                if (seenOld != oldCount || seenNew != newCount) throw PatchParseException("Hunk line counts do not match its header in ${newPath ?: oldPath}")
                while (i < lines.size && lines[i].startsWith("\\")) i++
                hunks += Hunk(oldStart, oldCount, newStart, newCount, body)
            }
            if (hunks.isEmpty()) throw PatchParseException("No hunks for ${newPath ?: oldPath}")
            out += FilePatch(oldPath, newPath, hunks)
        }
        if (out.isEmpty()) throw PatchParseException("No unified diff was found")
        return out
    }

    /** Extracts diff text from a chat answer: fenced ```diff / ```patch blocks, or the raw text if it already is a diff. */
    fun extract(answer: String): String? {
        val fence = Regex("```(?:diff|patch|udiff)?[ \\t]*\\n(.*?)```", RegexOption.DOT_MATCHES_ALL)
        val blocks = fence.findAll(answer).map { it.groupValues[1] }.filter { it.contains("\n+++ ") || it.startsWith("--- ") }.toList()
        if (blocks.isNotEmpty()) return blocks.joinToString("\n")
        return answer.takeIf { Regex("(?m)^--- .*\\n\\+\\+\\+ ").containsMatchIn(it) }
    }

    /**
     * Applies [patch] to the files under [root] in memory and returns a [ChangeSet] to review.
     * [allowPath] lets callers add their own restrictions (for example, read-only paths).
     */
    fun toChangeSet(root: File, patch: String, title: String, source: String, description: String = "", allowPath: (String) -> Boolean = { true }): PatchResult {
        val files = try { parse(patch) } catch (e: PatchParseException) { return PatchResult(null, listOf(e.message ?: "Invalid patch"), emptyList()) }
        val problems = mutableListOf<String>()
        if (files.size > MAX_FILES) return PatchResult(null, listOf("The patch touches ${files.size} files; at most $MAX_FILES are allowed"), files)
        if (files.map { it.path }.toSet().size != files.size) problems += "The patch changes the same file more than once"
        val changes = mutableListOf<FileChange>()
        for (fp in files) {
            if (fp.oldPath != null && fp.newPath != null && fp.oldPath != fp.newPath) { problems += "Renames are not supported (${fp.oldPath} → ${fp.newPath})"; continue }
            val rel = PathSafety.normalizeRelative(fp.path)
            if (rel == null) { problems += "Unsafe path rejected: ${fp.path}"; continue }
            val file = PathSafety.resolveInside(root, rel)
            if (file == null) { problems += "Path escapes the project: ${fp.path}"; continue }
            if (BuildPlanner.isSecret(rel)) { problems += "Changes to signing or secret files are not allowed: $rel"; continue }
            if (rel.split('/').any { it == ".git" }) { problems += "Changes inside .git are not allowed: $rel"; continue }
            if (!allowPath(rel)) { problems += "Changes to $rel are not allowed here"; continue }
            if (fp.isCreate) {
                if (file.exists()) { problems += "$rel already exists; the patch expects to create it"; continue }
                val hunk = fp.hunks.singleOrNull()
                if (hunk == null || hunk.lines.any { it[0] != '+' }) { problems += "A new file must consist of added lines only: $rel"; continue }
                changes += FileChange(rel, null, hunk.newLines.joinToString("\n") + "\n")
                continue
            }
            if (!file.isFile) { problems += "$rel does not exist"; continue }
            if (file.length() > MAX_FILE_BYTES || !TextFiles.isProbablyText(file)) { problems += "$rel is binary or too large to patch"; continue }
            val original = file.readText()
            val result = applyHunks(original, fp.hunks)
            result.error?.let { problems += "$rel: $it"; continue }
            val after = result.text!!
            if (fp.isDelete) {
                if (after.isNotEmpty()) { problems += "$rel: the delete patch does not remove the whole file"; continue }
                changes += FileChange(rel, original, null)
            } else {
                changes += FileChange(rel, original, after)
            }
        }
        if (problems.isNotEmpty()) return PatchResult(null, problems, files)
        val set = ChangeSet(title = title, description = description, source = source, changes = changes,
            followUps = listOf("Review every change before applying.", "Rebuild the project — the patch is not verified until a build passes."))
        if (set.isEmpty) return PatchResult(null, listOf("The patch does not change anything"), files)
        return PatchResult(set, emptyList(), files)
    }

    private data class Applied(val text: String?, val error: String?)

    private fun applyHunks(original: String, hunks: List<Hunk>): Applied {
        val crlf = original.contains("\r\n")
        val src = original.replace("\r\n", "\n")
        val endsWithNewline = src.endsWith("\n")
        val lines = if (src.isEmpty()) mutableListOf() else src.removeSuffix("\n").split("\n").toMutableList()
        var shift = 0 // lines added minus removed by earlier hunks
        var minIndex = 0
        for ((n, h) in hunks.withIndex()) {
            val expected = h.oldLines
            val hint = (if (h.oldCount == 0) h.oldStart else h.oldStart - 1) + shift
            val at = locate(lines, expected, hint, minIndex)
                ?: return Applied(null, "hunk ${n + 1} (line ${h.oldStart}) does not match the current file — it may have changed since the patch was written")
            repeat(expected.size) { lines.removeAt(at) }
            lines.addAll(at, h.newLines)
            shift += h.newLines.size - expected.size
            minIndex = at + h.newLines.size
        }
        var text = lines.joinToString("\n")
        if (lines.isNotEmpty() && (endsWithNewline || src.isEmpty())) text += "\n"
        if (crlf) text = text.replace("\n", "\r\n")
        return Applied(text, null)
    }

    private fun locate(lines: List<String>, expected: List<String>, hint: Int, minIndex: Int): Int? {
        fun matchesAt(i: Int) = i >= minIndex && i + expected.size <= lines.size && expected.indices.all { lines[i + it].trimEnd() == expected[it].trimEnd() }
        if (expected.isEmpty()) return hint.coerceIn(minIndex, lines.size)
        for (d in 0..MAX_OFFSET) {
            if (matchesAt(hint + d)) return hint + d
            if (d > 0 && matchesAt(hint - d)) return hint - d
        }
        return null
    }

    private fun pathOf(raw: String): String? {
        val p = raw.substringBefore('\t').trim().removeSurrounding("\"")
        if (p == "/dev/null") return null
        return if (p.startsWith("a/") || p.startsWith("b/")) p.substring(2) else p
    }
}

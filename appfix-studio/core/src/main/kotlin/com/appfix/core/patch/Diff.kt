package com.appfix.core.patch

import com.github.difflib.DiffUtils
import com.github.difflib.UnifiedDiffUtils
import com.github.difflib.patch.AbstractDelta
import com.github.difflib.patch.DeltaType

data class DiffLine(val type: Type, val oldLine: Int?, val newLine: Int?, val text: String) {
    enum class Type { CONTEXT, ADDED, REMOVED, HUNK }
}

data class FileDiff(val path: String, val kind: FileChange.Kind, val lines: List<DiffLine>, val added: Int, val removed: Int, val isBinary: Boolean)

object Diff {
    fun lines(text: String?): List<String> = text?.let { if (it.isEmpty()) emptyList() else it.split("\n") } ?: emptyList()

    fun unified(change: FileChange, context: Int = 3): String {
        if (change.isBinary) return "Binary file ${change.path} ${change.kind.name.lowercase()}d\n"
        val a = lines(change.before)
        val b = lines(change.after)
        val patch = DiffUtils.diff(a, b)
        val from = if (change.before == null) "/dev/null" else "a/${change.path}"
        val to = if (change.after == null) "/dev/null" else "b/${change.path}"
        return UnifiedDiffUtils.generateUnifiedDiff(from, to, a, patch, context).joinToString("\n") + "\n"
    }

    fun unified(set: ChangeSet): String = set.changes.joinToString("") { unified(it) }

    /** Structured diff with [context] lines around each change, for display. */
    fun structured(change: FileChange, context: Int = 3): FileDiff {
        if (change.isBinary) return FileDiff(change.path, change.kind, emptyList(), 0, 0, true)
        val a = lines(change.before)
        val b = lines(change.after)
        val deltas: List<AbstractDelta<String>> = DiffUtils.diff(a, b).deltas
        val out = mutableListOf<DiffLine>()
        var added = 0
        var removed = 0
        var i = 0
        while (i < deltas.size) {
            // Group deltas whose context windows overlap into one hunk.
            var j = i
            while (j + 1 < deltas.size && deltas[j + 1].source.position - (deltas[j].source.position + deltas[j].source.size()) <= context * 2) j++
            val first = deltas[i]
            val last = deltas[j]
            val startOld = maxOf(0, first.source.position - context)
            val endOld = minOf(a.size, last.source.position + last.source.size() + context)
            val startNew = startOld + (first.target.position - first.source.position)
            out += DiffLine(DiffLine.Type.HUNK, null, null, "@@ -${startOld + 1} +${startNew + 1} @@")
            var oldPos = startOld
            var newPos = startNew
            for (k in i..j) {
                val d = deltas[k]
                while (oldPos < d.source.position) { out += DiffLine(DiffLine.Type.CONTEXT, oldPos + 1, newPos + 1, a[oldPos]); oldPos++; newPos++ }
                if (d.type == DeltaType.DELETE || d.type == DeltaType.CHANGE) {
                    d.source.lines.forEach { out += DiffLine(DiffLine.Type.REMOVED, oldPos + 1, null, it); oldPos++; removed++ }
                }
                if (d.type == DeltaType.INSERT || d.type == DeltaType.CHANGE) {
                    d.target.lines.forEach { out += DiffLine(DiffLine.Type.ADDED, null, newPos + 1, it); newPos++; added++ }
                }
            }
            while (oldPos < endOld) { out += DiffLine(DiffLine.Type.CONTEXT, oldPos + 1, newPos + 1, a[oldPos]); oldPos++; newPos++ }
            i = j + 1
        }
        return FileDiff(change.path, change.kind, out, added, removed, false)
    }
}

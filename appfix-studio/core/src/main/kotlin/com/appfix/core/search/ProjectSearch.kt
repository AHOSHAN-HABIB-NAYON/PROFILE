package com.appfix.core.search

import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.FileChange
import com.appfix.core.util.CancelToken
import com.appfix.core.util.TextFiles
import java.io.File

data class SearchQuery(
    val text: String,
    val regex: Boolean = false,
    val caseSensitive: Boolean = false,
    val wholeWord: Boolean = false,
    /** Lower-case extensions to include; empty means all text files. */
    val extensions: Set<String> = emptySet(),
    val maxResults: Int = 2000,
    val maxFileBytes: Long = 2L * 1024 * 1024,
)

data class SearchMatch(val path: String, val line: Int, val column: Int, val length: Int, val preview: String)

data class SearchResult(val matches: List<SearchMatch>, val filesSearched: Int, val truncated: Boolean)

/** Text search and replace across a project. Replacements are returned as a reviewable [ChangeSet]. */
object ProjectSearch {
    private val skipDirs = setOf("build", ".gradle", ".git", ".idea", "node_modules", ".dart_tool", ".kotlin", ".cxx")

    fun compile(q: SearchQuery): Regex {
        require(q.text.isNotEmpty()) { "Search text is empty" }
        var pattern = if (q.regex) q.text else Regex.escape(q.text)
        if (q.wholeWord) pattern = "\\b(?:$pattern)\\b"
        val opts = if (q.caseSensitive) emptySet() else setOf(RegexOption.IGNORE_CASE)
        return Regex(pattern, opts)
    }

    fun files(root: File, q: SearchQuery): Sequence<File> = root.walkTopDown()
        .onEnter { it == root || it.name !in skipDirs }
        .filter { it.isFile && it.length() <= q.maxFileBytes }
        .filter { q.extensions.isEmpty() || it.extension.lowercase() in q.extensions }
        .filter { TextFiles.isProbablyText(it) }

    fun search(root: File, q: SearchQuery, cancel: CancelToken = CancelToken.NONE): SearchResult {
        val regex = compile(q)
        val out = mutableListOf<SearchMatch>()
        var count = 0
        var truncated = false
        loop@ for (f in files(root, q)) {
            cancel.throwIfCancelled()
            count++
            val rel = f.relativeTo(root).invariantSeparatorsPath
            f.useLines { lines ->
                lines.forEachIndexed { idx, line ->
                    for (m in regex.findAll(line)) {
                        if (out.size >= q.maxResults) { truncated = true; return@useLines }
                        out += SearchMatch(rel, idx + 1, m.range.first + 1, m.value.length, line.trim().take(200))
                    }
                }
            }
            if (truncated) break@loop
        }
        return SearchResult(out, count, truncated)
    }

    /** Produces a ChangeSet that replaces every match. Regex replacements may use $1 group references. */
    fun replaceAll(root: File, q: SearchQuery, replacement: String, cancel: CancelToken = CancelToken.NONE): ChangeSet {
        val regex = compile(q)
        val changes = mutableListOf<FileChange>()
        for (f in files(root, q)) {
            cancel.throwIfCancelled()
            val before = f.readText()
            if (!regex.containsMatchIn(before)) continue
            val after = if (q.regex) regex.replace(before, replacement) else regex.replace(before, Regex.escapeReplacement(replacement))
            if (after != before) changes += FileChange(f.relativeTo(root).invariantSeparatorsPath, before, after)
        }
        return ChangeSet(title = "Replace \"${q.text.take(40)}\" with \"${replacement.take(40)}\"", source = "search-replace", changes = changes,
            description = "${changes.size} file(s) changed")
    }
}

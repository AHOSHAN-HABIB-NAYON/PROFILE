package com.webtecit.filepilot.feature.devtools

import java.io.File
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/** Pure-Kotlin file utilities (split, merge, text search), covered by JVM unit tests. */
object FileToolsLogic {

    /** Splits [source] into parts of [partSize] bytes named "name.001", "name.002"… in [targetDir]. */
    suspend fun split(source: File, targetDir: File, partSize: Long): List<File> {
        require(partSize > 0)
        val parts = ArrayList<File>()
        source.inputStream().buffered().use { input ->
            val buffer = ByteArray(256 * 1024)
            var index = 1
            while (true) {
                currentCoroutineContext().ensureActive()
                var written = 0L
                val part = File(targetDir, "${source.name}.${index.toString().padStart(3, '0')}")
                var first = true
                part.outputStream().use { out ->
                    while (written < partSize) {
                        val n = input.read(buffer, 0, minOf(buffer.size.toLong(), partSize - written).toInt())
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        written += n
                        first = false
                    }
                }
                if (first || written == 0L) { part.delete(); break }
                parts += part
                index++
                if (written < partSize) break
            }
        }
        return parts
    }

    /** All parts of a split set, given any one of them ("video.mp4.002" → .001, .002, …). */
    fun partsOf(anyPart: File): List<File> {
        val base = anyPart.name.substringBeforeLast('.')
        val dir = anyPart.parentFile ?: return emptyList()
        return generateSequence(1) { it + 1 }.map { File(dir, "$base.${it.toString().padStart(3, '0')}") }.takeWhile { it.isFile }.toList()
    }

    suspend fun merge(parts: List<File>, target: File) {
        target.outputStream().buffered().use { out ->
            for (p in parts) {
                currentCoroutineContext().ensureActive()
                p.inputStream().use { it.copyTo(out, 256 * 1024) }
            }
        }
    }

    data class Match(val path: String, val line: Int, val text: String)

    /** Finds lines containing [query] in text files under [root] (files up to 5 MB). */
    private val textExtensions = setOf("txt", "md", "html", "htm", "css", "js", "mjs", "json", "xml", "csv", "log", "kt", "java", "py", "php", "c", "h", "cpp",
        "sql", "yaml", "yml", "ini", "conf", "properties", "sh", "ts", "tsx", "jsx", "gradle", "kts", "toml", "svg", "smali", "vue", "scss", "less")

    /** The pattern for a search: plain text, whole word or regular expression. */
    fun pattern(query: String, regex: Boolean, ignoreCase: Boolean, wholeWord: Boolean = false): Regex {
        val body = if (regex) query else Regex.escape(query).let { if (wholeWord) "\\b$it\\b" else it }
        return if (ignoreCase) Regex(body, RegexOption.IGNORE_CASE) else Regex(body)
    }

    private suspend fun textFiles(root: File, visit: suspend (File) -> Boolean) {
        val stack = ArrayDeque<File>().apply { add(root) }
        while (stack.isNotEmpty()) {
            currentCoroutineContext().ensureActive()
            val dir = stack.removeLast()
            for (f in dir.listFiles().orEmpty()) {
                if (f.isDirectory) { if (!f.name.startsWith(".")) stack.addLast(f); continue }
                if (f.extension.lowercase() !in textExtensions || f.length() > 5_000_000) continue
                if (!visit(f)) return
            }
        }
    }

    /** Lines matching [pattern] in text files under [root]. */
    suspend fun searchPattern(root: File, pattern: Regex, limit: Int = 2000, onFile: (Int) -> Unit = {}): List<Match> {
        val matches = ArrayList<Match>()
        var scanned = 0
        textFiles(root) { f ->
            onFile(++scanned)
            runCatching {
                f.bufferedReader().useLines { lines ->
                    lines.forEachIndexed { i, line -> if (matches.size < limit && pattern.containsMatchIn(line)) matches += Match(f.absolutePath, i + 1, line.trim().take(200)) }
                }
            }
            matches.size < limit
        }
        return matches
    }

    /** Replaces every match in text files under [root]; returns (files changed, replacements). */
    suspend fun replaceInFiles(root: File, pattern: Regex, replacement: String): Pair<Int, Int> {
        var files = 0
        var total = 0
        textFiles(root) { f ->
            val text = runCatching { f.readText() }.getOrNull() ?: return@textFiles true
            val n = pattern.findAll(text).count()
            if (n > 0) {
                f.writeText(pattern.replace(text, replacement))
                files++
                total += n
            }
            true
        }
        return files to total
    }

    suspend fun searchText(root: File, query: String, ignoreCase: Boolean = true, limit: Int = 1000, onFile: (Int) -> Unit = {}): List<Match> {
        val matches = ArrayList<Match>()
        var scanned = 0
        val textExt = setOf("txt", "md", "html", "htm", "css", "js", "json", "xml", "csv", "log", "kt", "java", "py", "php", "c", "h", "cpp",
            "sql", "yaml", "yml", "ini", "conf", "properties", "sh", "ts", "tsx", "jsx", "gradle", "kts", "toml", "svg", "smali")
        val stack = ArrayDeque<File>().apply { add(root) }
        while (stack.isNotEmpty() && matches.size < limit) {
            currentCoroutineContext().ensureActive()
            val dir = stack.removeLast()
            for (f in dir.listFiles().orEmpty()) {
                if (f.isDirectory) { if (!f.name.startsWith(".")) stack.addLast(f); continue }
                if (f.extension.lowercase() !in textExt || f.length() > 5_000_000) continue
                scanned++
                onFile(scanned)
                runCatching {
                    f.bufferedReader().useLines { lines ->
                        lines.forEachIndexed { i, line ->
                            if (matches.size < limit && line.contains(query, ignoreCase)) matches += Match(f.absolutePath, i + 1, line.trim().take(200))
                        }
                    }
                }
            }
        }
        return matches
    }
}

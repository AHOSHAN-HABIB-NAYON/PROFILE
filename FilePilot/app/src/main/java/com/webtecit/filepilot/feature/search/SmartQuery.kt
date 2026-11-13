package com.webtecit.filepilot.feature.search

import com.webtecit.filepilot.core.storage.FileKind
import java.util.Calendar

/** What a natural-language search was understood to mean. */
data class SmartQuery(
    val words: List<String> = emptyList(),
    val kinds: Set<FileKind> = emptySet(),
    val extensions: Set<String> = emptySet(),
    val minSize: Long? = null,
    val maxSize: Long? = null,
    val after: Long? = null,
    val before: Long? = null,
    val labels: List<String> = emptyList(),
) {
    val isEmpty: Boolean get() = words.isEmpty() && kinds.isEmpty() && extensions.isEmpty() && minSize == null && maxSize == null && after == null
}

/**
 * Turns phrases like "large videos from last week", "pdf invoice 2024" or "photos bigger than
 * 5 mb" into filters. Runs entirely on the device; no text leaves the phone.
 */
object SmartQueryParser {
    private const val DAY = 24L * 60 * 60 * 1000
    private val units = mapOf("b" to 1L, "kb" to 1_000L, "k" to 1_000L, "mb" to 1_000_000L, "m" to 1_000_000L, "gb" to 1_000_000_000L, "g" to 1_000_000_000L)
    private val kindWords = mapOf(
        FileKind.IMAGE to setOf("photo", "photos", "image", "images", "picture", "pictures", "pic", "pics", "wallpaper", "wallpapers"),
        FileKind.VIDEO to setOf("video", "videos", "movie", "movies", "clip", "clips", "film", "films", "recording", "recordings"),
        FileKind.AUDIO to setOf("music", "song", "songs", "audio", "audios", "voice", "podcast", "podcasts", "ringtone", "ringtones"),
        FileKind.DOCUMENT to setOf("doc", "docs", "document", "documents", "word"),
        FileKind.APK to setOf("apk", "apks", "app", "apps", "installer", "installers"),
        FileKind.ARCHIVE to setOf("zip", "zips", "archive", "archives", "rar", "compressed"),
        FileKind.CODE to setOf("code", "source", "html", "css", "javascript", "script", "scripts"),
        FileKind.PDF to setOf("pdf", "pdfs"),
    )
    private val knownExt = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "mp4", "mkv", "mov", "avi", "mp3", "m4a", "wav", "flac",
        "txt", "docx", "xlsx", "pptx", "csv", "json", "xml", "js", "kt", "java", "py", "php", "sql", "7z", "tar", "gz", "svg", "epub")
    private val stop = setOf("find", "show", "me", "my", "all", "files", "file", "from", "in", "of", "the", "with", "named", "called",
        "and", "a", "an", "last", "this", "past", "that", "are", "is", "than", "bigger", "larger", "smaller", "over", "under", "more",
        "less", "above", "below", "since", "for", "to", "on", "please", "search", "get", "list", "any", "some", "type")

    fun parse(input: String, now: Long = System.currentTimeMillis()): SmartQuery {
        var text = " " + input.lowercase().replace(Regex("[,;!?]"), " ") + " "
        val labels = ArrayList<String>()
        var minSize: Long? = null
        var maxSize: Long? = null
        var after: Long? = null
        var before: Long? = null

        // Explicit sizes: "> 100mb", "bigger than 2 gb", "under 500 kb".
        val sizeRegex = Regex("""(>|<|>=|<=|bigger than|larger than|greater than|more than|over|above|smaller than|less than|under|below)\s*(\d+(?:\.\d+)?)\s*(gb|mb|kb|g|m|k|b)\b""")
        sizeRegex.findAll(text).forEach { m ->
            val bytes = (m.groupValues[2].toDouble() * (units[m.groupValues[3]] ?: 1L)).toLong()
            val op = m.groupValues[1]
            if (op.startsWith(">") || op in setOf("bigger than", "larger than", "greater than", "more than", "over", "above")) minSize = bytes else maxSize = bytes
        }
        text = sizeRegex.replace(text, " ")
        if (minSize == null && Regex("""\b(huge|biggest|largest)\b""").containsMatchIn(text)) minSize = 500_000_000L
        else if (minSize == null && Regex("""\b(large|big)\b""").containsMatchIn(text)) minSize = 50_000_000L
        if (maxSize == null && Regex("""\b(small|tiny)\b""").containsMatchIn(text)) maxSize = 1_000_000L
        text = text.replace(Regex("""\b(huge|biggest|largest|large|big|small|tiny)\b"""), " ")
        minSize?.let { labels += "Bigger than ${human(it)}" }
        maxSize?.let { labels += "Smaller than ${human(it)}" }

        // Dates.
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        fun startOfDay(daysAgo: Int): Long = Calendar.getInstance().apply {
            timeInMillis = now; add(Calendar.DAY_OF_YEAR, -daysAgo)
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        when {
            Regex("""\btoday\b""").containsMatchIn(text) -> { after = startOfDay(0); labels += "Today" }
            Regex("""\byesterday\b""").containsMatchIn(text) -> { after = startOfDay(1); before = startOfDay(0); labels += "Yesterday" }
            Regex("""\b(week|recent|recently|new|latest)\b""").containsMatchIn(text) -> { after = now - 7 * DAY; labels += "Last 7 days" }
            Regex("""\bmonth\b""").containsMatchIn(text) -> { after = now - 30 * DAY; labels += "Last 30 days" }
            Regex("""\byear\b""").containsMatchIn(text) -> { after = now - 365 * DAY; labels += "Last 12 months" }
            Regex("""\b(old|older)\b""").containsMatchIn(text) -> { before = now - 365 * DAY; labels += "Older than a year" }
        }
        Regex("""\b(19[89]\d|20\d\d)\b""").find(text)?.let { m ->
            val y = m.value.toInt()
            if (y <= cal.get(Calendar.YEAR)) {
                after = Calendar.getInstance().apply { clear(); set(y, 0, 1) }.timeInMillis
                before = Calendar.getInstance().apply { clear(); set(y + 1, 0, 1) }.timeInMillis
                labels += "In $y"
                text = text.replace(m.value, " ")
            }
        }
        text = text.replace(Regex("""\b(today|yesterday|week|weeks|recent|recently|new|latest|month|months|year|years|old|older|ago|days?)\b"""), " ")

        val kinds = LinkedHashSet<FileKind>()
        val extensions = LinkedHashSet<String>()
        val words = ArrayList<String>()
        for (raw in text.split(Regex("\\s+")).filter { it.isNotBlank() }) {
            val token = raw.trim('"', '\'', '*')
            val kind = kindWords.entries.firstOrNull { token in it.value }?.key
            when {
                token.startsWith(".") && token.length > 1 -> extensions += token.drop(1)
                kind == FileKind.PDF -> extensions += "pdf"
                kind != null -> kinds += kind
                token in knownExt -> extensions += token
                token in stop -> Unit
                token.length >= 2 || token.any(Char::isDigit) -> words += token
            }
        }
        kinds.forEach { labels.add(0, kindLabel(it)) }
        extensions.forEach { labels.add(0, ".$it files") }
        words.forEach { labels += "Name contains \"$it\"" }
        return SmartQuery(words, kinds, extensions, minSize, maxSize, after, before, labels)
    }

    private fun kindLabel(k: FileKind) = when (k) {
        FileKind.IMAGE -> "Images"
        FileKind.VIDEO -> "Videos"
        FileKind.AUDIO -> "Audio"
        FileKind.DOCUMENT -> "Documents"
        FileKind.APK -> "APKs"
        FileKind.ARCHIVE -> "Archives"
        FileKind.CODE -> "Code"
        else -> k.name.lowercase().replaceFirstChar { it.uppercase() }
    }

    private fun human(bytes: Long): String = when {
        bytes >= 1_000_000_000 -> "${trim(bytes / 1e9)} GB"
        bytes >= 1_000_000 -> "${trim(bytes / 1e6)} MB"
        bytes >= 1_000 -> "${trim(bytes / 1e3)} KB"
        else -> "$bytes B"
    }

    private fun trim(v: Double) = if (v == Math.floor(v)) v.toLong().toString() else "%.1f".format(java.util.Locale.US, v)
}

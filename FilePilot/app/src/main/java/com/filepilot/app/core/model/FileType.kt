package com.filepilot.app.core.model

/** Coarse file type used for icons, colors, categories and choosing a viewer. */
enum class FileType {
    FOLDER, IMAGE, VIDEO, AUDIO, PDF, TEXT, CODE, DOCUMENT, SPREADSHEET, PRESENTATION, ARCHIVE, APK, OTHER;

    companion object {
        private val image = setOf("jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "avif", "svg", "ico", "dng", "tif", "tiff")
        private val video = setOf("mp4", "mkv", "webm", "3gp", "mov", "avi", "m4v", "ts", "flv", "wmv", "mpeg", "mpg")
        private val audio = setOf("mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "amr", "mid", "midi", "wma", "3ga")
        private val text = setOf("txt", "md", "markdown", "log", "csv", "tsv", "ini", "cfg", "conf", "srt", "vtt", "nfo", "properties", "rtf")
        private val code = setOf(
            "json", "xml", "html", "htm", "css", "js", "ts", "kt", "kts", "java", "py", "c", "h", "cpp", "hpp",
            "cs", "go", "rs", "swift", "sh", "bat", "yml", "yaml", "toml", "gradle", "sql", "php", "rb", "dart", "lua",
        )
        private val doc = setOf("doc", "docx", "odt", "pages", "epub", "mobi", "wpd")
        private val sheet = setOf("xls", "xlsx", "ods", "numbers")
        private val slides = setOf("ppt", "pptx", "odp", "key")
        val archiveExtensions = setOf("zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "jar", "zst")
        val documentExtensions = doc + sheet + slides + text + setOf("pdf")

        fun fromExtension(ext: String, mime: String? = null): FileType {
            val e = ext.lowercase()
            return when {
                e == "pdf" -> PDF
                e == "apk" || e == "apks" || e == "xapk" -> APK
                e in image -> IMAGE
                e in video -> VIDEO
                e in audio -> AUDIO
                e in archiveExtensions -> ARCHIVE
                e in doc -> DOCUMENT
                e in sheet -> SPREADSHEET
                e in slides -> PRESENTATION
                e in code -> CODE
                e in text -> TEXT
                mime == null -> OTHER
                mime.startsWith("image/") -> IMAGE
                mime.startsWith("video/") -> VIDEO
                mime.startsWith("audio/") -> AUDIO
                mime == "application/pdf" -> PDF
                mime.startsWith("text/") -> TEXT
                mime == "application/zip" -> ARCHIVE
                else -> OTHER
            }
        }

        fun of(item: FileItem): FileType =
            if (item.isDirectory) FOLDER else fromExtension(item.extension, item.mimeType)
    }
}

/** How FilePilot opens a file: inside the app, or via another app. */
enum class PreviewKind { IMAGE, VIDEO, AUDIO, TEXT, PDF, ARCHIVE, EXTERNAL }

/** The built-in text viewer shows at most this much of a file; bigger files show their beginning. */
const val MAX_TEXT_PREVIEW_BYTES = 4L * 1024 * 1024

fun FileItem.previewKind(): PreviewKind = when (type) {
    FileType.IMAGE -> if (extension in setOf("svg", "dng", "tif", "tiff")) PreviewKind.EXTERNAL else PreviewKind.IMAGE
    FileType.VIDEO -> PreviewKind.VIDEO
    FileType.AUDIO -> if (extension in setOf("mid", "midi", "wma")) PreviewKind.EXTERNAL else PreviewKind.AUDIO
    FileType.PDF -> PreviewKind.PDF
    FileType.TEXT, FileType.CODE ->
        if (extension != "rtf") PreviewKind.TEXT else PreviewKind.EXTERNAL
    FileType.ARCHIVE -> if (extension == "zip" || extension == "jar") PreviewKind.ARCHIVE else PreviewKind.EXTERNAL
    else -> PreviewKind.EXTERNAL
}

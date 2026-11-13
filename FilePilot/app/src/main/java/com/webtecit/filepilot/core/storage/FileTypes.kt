package com.webtecit.filepilot.core.storage

object FileTypes {
    const val DIRECTORY_MIME = "vnd.android.document/directory"
    const val FALLBACK_MIME = "application/octet-stream"

    private val doubleExtensions = setOf("tar.gz", "tar.bz2", "tar.xz", "tar.zst")

    /** Lower-case extension without the dot; empty for folders and names like ".nomedia". */
    fun extensionOf(name: String, isDirectory: Boolean = false): String {
        if (isDirectory) return ""
        val dot = name.lastIndexOf('.')
        if (dot <= 0 || dot == name.lastIndex) return ""
        return name.substring(dot + 1).lowercase()
    }

    /** "archive.tar.gz" → "tar.gz" so conflict names become "archive (1).tar.gz". */
    fun fullExtensionOf(name: String): String {
        val lower = name.lowercase()
        doubleExtensions.firstOrNull { lower.endsWith(".$it") && lower.length > it.length + 1 }?.let { return it }
        return extensionOf(name)
    }

    private val mimeByExtension = mapOf(
        // images
        "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png", "gif" to "image/gif",
        "webp" to "image/webp", "bmp" to "image/bmp", "heic" to "image/heic", "heif" to "image/heif",
        "svg" to "image/svg+xml", "ico" to "image/x-icon", "avif" to "image/avif", "tif" to "image/tiff",
        "tiff" to "image/tiff",
        // video
        "mp4" to "video/mp4", "mkv" to "video/x-matroska", "webm" to "video/webm", "3gp" to "video/3gpp",
        "mov" to "video/quicktime", "avi" to "video/x-msvideo", "m4v" to "video/mp4", "ts" to "video/mp2t",
        // audio
        "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "aac" to "audio/aac", "wav" to "audio/wav",
        "ogg" to "audio/ogg", "opus" to "audio/opus", "flac" to "audio/flac", "amr" to "audio/amr",
        "mid" to "audio/midi", "midi" to "audio/midi",
        // documents
        "pdf" to "application/pdf",
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "odt" to "application/vnd.oasis.opendocument.text", "rtf" to "application/rtf",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ods" to "application/vnd.oasis.opendocument.spreadsheet", "csv" to "text/csv",
        "ppt" to "application/vnd.ms-powerpoint",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odp" to "application/vnd.oasis.opendocument.presentation", "epub" to "application/epub+zip",
        // archives
        "zip" to "application/zip", "rar" to "application/vnd.rar", "7z" to "application/x-7z-compressed",
        "tar" to "application/x-tar", "gz" to "application/gzip", "tgz" to "application/gzip",
        "bz2" to "application/x-bzip2", "xz" to "application/x-xz", "zst" to "application/zstd",
        // packages
        "apk" to "application/vnd.android.package-archive", "xapk" to "application/octet-stream",
        "apks" to "application/octet-stream", "aab" to "application/octet-stream",
        // text and code
        "txt" to "text/plain", "log" to "text/plain", "md" to "text/markdown", "html" to "text/html",
        "htm" to "text/html", "css" to "text/css", "js" to "text/javascript", "mjs" to "text/javascript",
        "json" to "application/json", "xml" to "text/xml", "yaml" to "text/yaml", "yml" to "text/yaml",
        "ini" to "text/plain", "conf" to "text/plain", "properties" to "text/plain", "sql" to "text/plain",
        "php" to "text/plain", "py" to "text/x-python", "java" to "text/x-java", "kt" to "text/plain",
        "kts" to "text/plain", "c" to "text/x-c", "h" to "text/x-c", "cpp" to "text/x-c++",
        "hpp" to "text/x-c++", "cs" to "text/plain", "sh" to "text/x-shellscript", "gradle" to "text/plain",
        "toml" to "text/plain", "smali" to "text/plain", "ts" to "video/mp2t", "tsx" to "text/plain",
        "jsx" to "text/plain", "vue" to "text/plain", "swift" to "text/plain", "go" to "text/plain",
        "rs" to "text/plain", "rb" to "text/plain", "lua" to "text/plain", "dart" to "text/plain",
        // fonts and data
        "ttf" to "font/ttf", "otf" to "font/otf", "woff" to "font/woff", "woff2" to "font/woff2",
        "db" to "application/vnd.sqlite3", "sqlite" to "application/vnd.sqlite3",
        "sqlite3" to "application/vnd.sqlite3", "vcf" to "text/x-vcard", "ics" to "text/calendar",
    )

    private val codeExtensions = setOf(
        "html", "htm", "css", "js", "mjs", "json", "xml", "php", "py", "java", "kt", "kts", "c", "h",
        "cpp", "hpp", "cs", "sh", "gradle", "toml", "sql", "smali", "yaml", "yml", "tsx", "jsx", "vue",
        "swift", "go", "rs", "rb", "lua", "dart",
    )
    private val textExtensions = setOf("txt", "log", "md", "ini", "conf", "properties", "csv", "vcf", "ics", "nfo")
    private val archiveExtensions = setOf("zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst")
    private val apkExtensions = setOf("apk", "xapk", "apks", "aab")
    private val fontExtensions = setOf("ttf", "otf", "woff", "woff2")
    private val databaseExtensions = setOf("db", "sqlite", "sqlite3")
    private val documentExtensions = setOf("doc", "docx", "odt", "rtf", "epub")
    private val spreadsheetExtensions = setOf("xls", "xlsx", "ods")
    private val presentationExtensions = setOf("ppt", "pptx", "odp")

    fun mimeOf(name: String): String = mimeByExtension[extensionOf(name)] ?: FALLBACK_MIME

    fun kindOf(name: String, isDirectory: Boolean, mimeType: String? = null): FileKind {
        if (isDirectory) return FileKind.FOLDER
        val ext = extensionOf(name)
        return when {
            ext == "pdf" -> FileKind.PDF
            ext in apkExtensions -> FileKind.APK
            ext in archiveExtensions -> FileKind.ARCHIVE
            ext in codeExtensions -> FileKind.CODE
            ext in textExtensions -> FileKind.TEXT
            ext in fontExtensions -> FileKind.FONT
            ext in databaseExtensions -> FileKind.DATABASE
            ext in documentExtensions -> FileKind.DOCUMENT
            ext in spreadsheetExtensions -> FileKind.SPREADSHEET
            ext in presentationExtensions -> FileKind.PRESENTATION
            ext == "ts" -> FileKind.VIDEO
            else -> {
                val mime = mimeType?.takeIf { it != FALLBACK_MIME } ?: mimeByExtension[ext].orEmpty()
                when {
                    mime.startsWith("image/") -> FileKind.IMAGE
                    mime.startsWith("video/") -> FileKind.VIDEO
                    mime.startsWith("audio/") -> FileKind.AUDIO
                    mime.startsWith("text/") -> FileKind.TEXT
                    else -> FileKind.OTHER
                }
            }
        }
    }

    /** Files that can be compared line by line and viewed as text. */
    fun isTextLike(name: String): Boolean {
        val kind = kindOf(name, false)
        return kind == FileKind.TEXT || kind == FileKind.CODE || extensionOf(name).isEmpty()
    }
}

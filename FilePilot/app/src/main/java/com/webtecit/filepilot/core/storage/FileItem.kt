package com.webtecit.filepilot.core.storage

/**
 * One file or folder.
 *
 * [id] identifies the item for every backend: an absolute path ("/storage/emulated/0/Download")
 * for direct file access, or "saf:" followed by a document URI for folders the user granted
 * through Android's folder picker (SD cards, USB drives, limited mode).
 */
data class FileItem(
    val id: String,
    val name: String,
    val isDirectory: Boolean,
    val size: Long,
    val lastModified: Long,
    val mimeType: String,
) {
    val isHidden: Boolean get() = name.startsWith(".")
    val extension: String = FileTypes.extensionOf(name, isDirectory)
    val kind: FileKind = FileTypes.kindOf(name, isDirectory, mimeType)

    /** The name shown in lists; without the extension when the user hides extensions. */
    fun displayName(showExtension: Boolean): String =
        if (showExtension || isDirectory || extension.isEmpty()) name
        else name.dropLast(extension.length + 1)
}

enum class FileKind {
    FOLDER, IMAGE, VIDEO, AUDIO, DOCUMENT, PDF, SPREADSHEET, PRESENTATION,
    ARCHIVE, APK, CODE, TEXT, FONT, DATABASE, OTHER,
}

/** A user-facing failure from a file backend. [message] is safe to show as-is. */
class FsException(
    val error: FsError,
    message: String,
    cause: Throwable? = null,
) : java.io.IOException(message, cause)

enum class FsError { ACCESS_DENIED, NOT_FOUND, ALREADY_EXISTS, INVALID_NAME, NO_SPACE, NOT_SUPPORTED, IO }

/** Turns any exception into a message that never blames the user and suggests a next step. */
fun Throwable.userMessage(): String = when (this) {
    is FsException -> message ?: "Something went wrong."
    is SecurityException -> "Access to this location was removed. Grant access again from Files."
    is java.io.FileNotFoundException -> when {
        message?.contains("EACCES") == true || message?.contains("Permission denied") == true ->
            "Android doesn't allow changes here. Grant access to this storage from Files."
        message?.contains("ENOSPC") == true -> "There isn't enough free space."
        else -> "The file couldn't be found. It may have been moved or deleted."
    }
    is java.io.IOException -> when {
        message?.contains("ENOSPC") == true || message?.contains("No space") == true ->
            "There isn't enough free space."
        else -> message?.takeIf { it.isNotBlank() } ?: "A storage error occurred. Try again."
    }
    else -> message?.takeIf { it.isNotBlank() } ?: "Something went wrong. Try again."
}

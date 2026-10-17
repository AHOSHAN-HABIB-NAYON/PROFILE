package com.filepilot.app.data.files

import java.io.IOException

/** An I/O failure with a message that is safe and helpful to show to the user. */
class FileAccessException(message: String, cause: Throwable? = null) : IOException(message, cause)

/** Turn any exception into a short, user-facing message without leaking file contents. */
fun Throwable.userMessage(): String = when (this) {
    is FileAccessException -> message ?: "Something went wrong"
    is SecurityException -> "FilePilot no longer has permission to access this location"
    is java.io.FileNotFoundException -> "The file no longer exists or can't be opened"
    is java.util.zip.ZipException -> "The archive is damaged, encrypted or uses an unsupported format"
    is OutOfMemoryError -> "The file is too large to open here"
    is IOException -> if (message?.contains("ENOSPC") == true || message?.contains("No space") == true) {
        "Not enough free storage space"
    } else {
        "A read or write error occurred"
    }
    else -> "Something went wrong"
}

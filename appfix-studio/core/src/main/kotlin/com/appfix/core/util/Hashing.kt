package com.appfix.core.util

import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

object Hashing {
    fun sha256(file: File, cancel: CancelToken = CancelToken.NONE): String =
        file.inputStream().buffered().use { sha256(it, cancel) }

    fun sha256(input: InputStream, cancel: CancelToken = CancelToken.NONE): String {
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        while (true) {
            cancel.throwIfCancelled()
            val n = input.read(buf)
            if (n < 0) break
            md.update(buf, 0, n)
        }
        return md.digest().toHex()
    }

    fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).toHex()

    /**
     * Copies [input] to [output] while hashing, reporting progress and honouring cancellation.
     * Throws [SizeLimitExceededException] when more than [maxBytes] are read.
     */
    fun copyAndHash(
        input: InputStream,
        output: OutputStream,
        totalHint: Long = -1,
        maxBytes: Long = Long.MAX_VALUE,
        cancel: CancelToken = CancelToken.NONE,
        progress: ProgressListener = ProgressListener.NONE,
    ): Pair<Long, String> {
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        var total = 0L
        var lastReport = 0L
        while (true) {
            cancel.throwIfCancelled()
            val n = input.read(buf)
            if (n < 0) break
            total += n
            if (total > maxBytes) throw SizeLimitExceededException("File is larger than the ${formatBytes(maxBytes)} limit")
            md.update(buf, 0, n)
            output.write(buf, 0, n)
            if (total - lastReport >= 256 * 1024) {
                progress.onProgress(total, totalHint, "Copying")
                lastReport = total
            }
        }
        progress.onProgress(total, totalHint, "Copied")
        return total to md.digest().toHex()
    }
}

class SizeLimitExceededException(message: String) : RuntimeException(message)

fun ByteArray.toHex(): String {
    val chars = CharArray(size * 2)
    val hex = "0123456789abcdef"
    for (i in indices) {
        val v = this[i].toInt() and 0xff
        chars[i * 2] = hex[v ushr 4]
        chars[i * 2 + 1] = hex[v and 0x0f]
    }
    return String(chars)
}

fun formatBytes(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val units = arrayOf("KB", "MB", "GB", "TB")
    var value = bytes / 1024.0
    var i = 0
    while (value >= 1024 && i < units.lastIndex) {
        value /= 1024
        i++
    }
    return if (value >= 100) "%.0f %s".format(value, units[i]) else "%.1f %s".format(value, units[i])
}

/** Base64 that works on Android API 24+ (java.util.Base64 needs API 26). */
object B64 {
    fun encode(bytes: ByteArray): String = kotlin.io.encoding.Base64.Default.encode(bytes)
    fun decode(text: String): ByteArray = kotlin.io.encoding.Base64.Default.decode(text)
}

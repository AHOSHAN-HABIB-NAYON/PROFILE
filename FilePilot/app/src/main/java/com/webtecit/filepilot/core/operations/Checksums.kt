package com.webtecit.filepilot.core.operations

import java.io.InputStream
import java.security.MessageDigest
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

enum class HashAlgorithm(val label: String, val jcaName: String) {
    MD5("MD5", "MD5"),
    SHA1("SHA-1", "SHA-1"),
    SHA256("SHA-256", "SHA-256"),
}

object Checksums {
    private const val BUFFER = 256 * 1024

    /** Hashes the stream as lower-case hex. Cancellable; [onProgress] receives bytes read so far. */
    suspend fun compute(
        input: InputStream,
        algorithm: HashAlgorithm,
        onProgress: (Long) -> Unit = {},
    ): String {
        val digest = MessageDigest.getInstance(algorithm.jcaName)
        val buffer = ByteArray(BUFFER)
        var total = 0L
        input.use { stream ->
            while (true) {
                currentCoroutineContext().ensureActive()
                val read = stream.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
                total += read
                onProgress(total)
            }
        }
        return toHex(digest.digest())
    }

    fun toHex(bytes: ByteArray): String {
        val chars = "0123456789abcdef"
        val out = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            out.append(chars[v ushr 4]).append(chars[v and 0x0F])
        }
        return out.toString()
    }
}

package com.webtecit.filepilot.core.archive

import java.io.File
import java.io.InputStream
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/** Minimal TAR (ustar) reader with optional GZIP, and protection against unsafe paths. */
object TarTools {

    fun open(input: InputStream, gzip: Boolean): InputStream = if (gzip) GZIPInputStream(input.buffered()) else input.buffered()

    /** Calls [onEntry] for every entry; the stream passed is limited to that entry's content. */
    suspend fun read(input: InputStream, onEntry: suspend (name: String, size: Long, isDir: Boolean, data: InputStream) -> Unit) {
        val header = ByteArray(512)
        while (true) {
            currentCoroutineContext().ensureActive()
            if (!readBlock(input, header)) break
            if (header.all { it == 0.toByte() }) break
            val name = text(header, 0, 100)
            val prefix = text(header, 345, 155)
            val size = octal(header, 124, 12)
            val type = header[156].toInt().toChar()
            val full = if (prefix.isNotEmpty()) "$prefix/$name" else name
            val limited = Limited(input, size)
            if (type == 'L') {
                // GNU long name: the next entry uses this name.
                val longName = limited.readBytes().toString(Charsets.UTF_8).trimEnd('\u0000')
                skipPadding(input, size)
                if (!readBlock(input, header)) break
                val size2 = octal(header, 124, 12)
                val type2 = header[156].toInt().toChar()
                val l2 = Limited(input, size2)
                onEntry(longName, size2, type2 == '5' || longName.endsWith("/"), l2)
                l2.drain()
                skipPadding(input, size2)
                continue
            }
            onEntry(full, size, type == '5' || full.endsWith("/"), limited)
            limited.drain()
            skipPadding(input, size)
        }
    }

    suspend fun extract(input: InputStream, target: File): Int {
        target.mkdirs()
        val base = target.canonicalFile
        var count = 0
        read(input) { name, _, isDir, data ->
            val out = ZipTools.safeChild(base, name) ?: throw SecurityException("The archive contains an unsafe path: $name")
            if (isDir) out.mkdirs() else {
                out.parentFile?.mkdirs()
                out.outputStream().use { data.copyTo(it) }
                count++
            }
        }
        return count
    }

    private fun readBlock(input: InputStream, block: ByteArray): Boolean {
        var read = 0
        while (read < block.size) {
            val n = input.read(block, read, block.size - read)
            if (n < 0) return read > 0 && false
            read += n
        }
        return true
    }

    private fun skipPadding(input: InputStream, size: Long) {
        var pad = (512 - (size % 512)) % 512
        while (pad > 0) {
            val n = input.skip(pad)
            if (n <= 0) { if (input.read() < 0) return; pad-- } else pad -= n
        }
    }

    private fun text(b: ByteArray, off: Int, len: Int): String {
        var end = off
        while (end < off + len && b[end] != 0.toByte()) end++
        return String(b, off, end - off, Charsets.UTF_8).trim()
    }

    private fun octal(b: ByteArray, off: Int, len: Int): Long =
        text(b, off, len).trim().takeIf { it.isNotEmpty() }?.toLongOrNull(8) ?: 0L

    private class Limited(private val inner: InputStream, private var remaining: Long) : InputStream() {
        override fun read(): Int {
            if (remaining <= 0) return -1
            val v = inner.read()
            if (v >= 0) remaining--
            return v
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (remaining <= 0) return -1
            val n = inner.read(b, off, minOf(len.toLong(), remaining).toInt())
            if (n > 0) remaining -= n
            return n
        }

        fun drain() {
            val buf = ByteArray(8192)
            while (read(buf, 0, buf.size) > 0) Unit
        }
    }
}

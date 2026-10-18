package com.appfix.core.apk

/** Little-endian bounds-checked reader over a byte array. Every read validates the offset. */
internal class LeBuffer(val bytes: ByteArray) {
    val size: Int get() = bytes.size

    fun u8(off: Int): Int {
        check(off, 1)
        return bytes[off].toInt() and 0xff
    }

    fun u16(off: Int): Int {
        check(off, 2)
        return (bytes[off].toInt() and 0xff) or ((bytes[off + 1].toInt() and 0xff) shl 8)
    }

    fun u32(off: Int): Long {
        check(off, 4)
        return ((bytes[off].toLong() and 0xff) or
            ((bytes[off + 1].toLong() and 0xff) shl 8) or
            ((bytes[off + 2].toLong() and 0xff) shl 16) or
            ((bytes[off + 3].toLong() and 0xff) shl 24))
    }

    fun i32(off: Int): Int = u32(off).toInt()

    fun u64(off: Int): Long = u32(off) or (u32(off + 4) shl 32)

    fun check(off: Int, len: Int) {
        if (off < 0 || len < 0 || off.toLong() + len > bytes.size) {
            throw BinaryFormatException("Read of $len bytes at offset $off is outside the ${bytes.size}-byte buffer")
        }
    }
}

class BinaryFormatException(message: String) : RuntimeException(message)

/** Resource string pool (ResStringPool) shared by AXML and resources.arsc. */
internal class StringPool private constructor(private val strings: Array<String?>, val isUtf8: Boolean) {
    val count: Int get() = strings.size
    operator fun get(index: Int): String? = if (index in strings.indices) strings[index] else null
    fun all(): List<String> = strings.map { it.orEmpty() }

    companion object {
        const val TYPE = 0x0001
        private const val UTF8_FLAG = 0x100
        private const val MAX_STRINGS = 2_000_000

        fun parse(buf: LeBuffer, chunkStart: Int): StringPool {
            val headerSize = buf.u16(chunkStart + 2)
            val chunkSize = buf.u32(chunkStart + 4).toInt()
            val stringCount = buf.u32(chunkStart + 8)
            val flags = buf.u32(chunkStart + 16).toInt()
            val stringsStart = buf.u32(chunkStart + 20).toInt()
            if (stringCount > MAX_STRINGS) throw BinaryFormatException("String pool too large: $stringCount")
            buf.check(chunkStart, chunkSize)
            val utf8 = flags and UTF8_FLAG != 0
            val result = arrayOfNulls<String>(stringCount.toInt())
            val offsetsStart = chunkStart + headerSize
            val dataStart = chunkStart + stringsStart
            val chunkEnd = chunkStart + chunkSize
            for (i in 0 until stringCount.toInt()) {
                val off = dataStart + buf.u32(offsetsStart + i * 4).toInt()
                if (off < dataStart || off >= chunkEnd) continue
                result[i] = try {
                    if (utf8) readUtf8(buf, off) else readUtf16(buf, off)
                } catch (e: BinaryFormatException) {
                    null
                }
            }
            return StringPool(result, utf8)
        }

        private fun readUtf8(buf: LeBuffer, start: Int): String {
            var off = start
            // UTF-16 length (ignored), then UTF-8 byte length; each 1 or 2 bytes.
            off += if (buf.u8(off) and 0x80 != 0) 2 else 1
            var len = buf.u8(off)
            if (len and 0x80 != 0) {
                len = ((len and 0x7f) shl 8) or buf.u8(off + 1)
                off += 2
            } else {
                off += 1
            }
            buf.check(off, len)
            return String(buf.bytes, off, len, Charsets.UTF_8)
        }

        private fun readUtf16(buf: LeBuffer, start: Int): String {
            var off = start
            var len = buf.u16(off)
            if (len and 0x8000 != 0) {
                len = ((len and 0x7fff) shl 16) or buf.u16(off + 2)
                off += 4
            } else {
                off += 2
            }
            buf.check(off, len * 2)
            val chars = CharArray(len) { i -> buf.u16(off + i * 2).toChar() }
            return String(chars)
        }
    }
}

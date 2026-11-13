package com.webtecit.filepilot.core.text

import java.nio.charset.Charset

data class DecodedText(val text: String, val charset: String, val bom: Boolean, val crlf: Boolean)

/** Reads and writes text files, keeping their encoding, byte-order mark and line endings. */
object TextCodec {
    val supported = listOf("UTF-8", "UTF-16LE", "UTF-16BE", "ISO-8859-1", "windows-1252", "US-ASCII")

    fun decode(bytes: ByteArray, forced: String? = null): DecodedText {
        var charset = forced
        var offset = 0
        var bom = false
        if (forced == null) {
            when {
                bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte() -> { charset = "UTF-8"; offset = 3; bom = true }
                bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte() -> { charset = "UTF-16LE"; offset = 2; bom = true }
                bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte() -> { charset = "UTF-16BE"; offset = 2; bom = true }
                else -> charset = if (isValidUtf8(bytes)) "UTF-8" else "windows-1252"
            }
        }
        val text = String(bytes, offset, bytes.size - offset, Charset.forName(charset))
        return DecodedText(text, charset!!, bom, text.contains("\r\n"))
    }

    fun encode(text: String, charset: String, bom: Boolean, crlf: Boolean): ByteArray {
        val normalized = if (crlf) text.replace("\r\n", "\n").replace("\n", "\r\n") else text
        val body = normalized.toByteArray(Charset.forName(charset))
        val mark = if (!bom) ByteArray(0) else when (charset) {
            "UTF-8" -> byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())
            "UTF-16LE" -> byteArrayOf(0xFF.toByte(), 0xFE.toByte())
            "UTF-16BE" -> byteArrayOf(0xFE.toByte(), 0xFF.toByte())
            else -> ByteArray(0)
        }
        return mark + body
    }

    /** True when [bytes] contain a zero byte in the first 8 KB, i.e. are almost certainly binary. */
    fun looksBinary(bytes: ByteArray): Boolean = (0 until minOf(bytes.size, 8192)).any { bytes[it] == 0.toByte() }

    fun isValidUtf8(bytes: ByteArray): Boolean {
        var i = 0
        while (i < bytes.size) {
            val b = bytes[i].toInt() and 0xFF
            val n = when {
                b < 0x80 -> 0
                b in 0xC2..0xDF -> 1
                b in 0xE0..0xEF -> 2
                b in 0xF0..0xF4 -> 3
                else -> return false
            }
            if (n > 0 && i + n >= bytes.size) return false
            for (k in 1..n) if ((bytes[i + k].toInt() and 0xC0) != 0x80) return false
            i += n + 1
        }
        return true
    }
}

package com.webtecit.filepilot.feature.devtools

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Decodes Android's compiled binary XML (as stored in APKs, e.g. AndroidManifest.xml) back into
 * readable XML. Attribute values that are resource references are shown as @0x7f… ids.
 */
object AxmlDecoder {
    private const val RES_STRING_POOL = 0x0001
    private const val RES_XML_START_NAMESPACE = 0x0100
    private const val RES_XML_START_ELEMENT = 0x0102
    private const val RES_XML_END_ELEMENT = 0x0103
    private const val RES_XML_RESOURCE_MAP = 0x0180

    fun decode(bytes: ByteArray): String {
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(buf.short.toInt() == 0x0003) { "Not a binary XML file." }
        buf.short
        buf.int
        var strings = emptyList<String>()
        val namespaces = LinkedHashMap<String, String>()
        val out = StringBuilder("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n")
        var depth = 0
        var pendingNs = ArrayList<Pair<String, String>>()
        while (buf.remaining() >= 8) {
            val start = buf.position()
            val type = buf.short.toInt() and 0xFFFF
            val headerSize = buf.short.toInt() and 0xFFFF
            val size = buf.int
            if (size <= 0 || start + size > bytes.size) break
            when (type) {
                RES_STRING_POOL -> strings = readStrings(buf, start)
                RES_XML_START_NAMESPACE -> {
                    buf.position(start + 16)
                    val prefix = strings.getOrElse(buf.int) { "" }
                    val uri = strings.getOrElse(buf.int) { "" }
                    namespaces[uri] = prefix
                    pendingNs.add(prefix to uri)
                }
                RES_XML_START_ELEMENT -> {
                    buf.position(start + 16)
                    buf.int // namespace
                    val name = strings.getOrElse(buf.int) { "?" }
                    val attrStart = buf.short.toInt() and 0xFFFF
                    val attrSize = buf.short.toInt() and 0xFFFF
                    val attrCount = buf.short.toInt() and 0xFFFF
                    out.append("  ".repeat(depth)).append('<').append(name)
                    pendingNs.forEach { (p, u) -> out.append(" xmlns:").append(p).append("=\"").append(u).append('"') }
                    pendingNs = ArrayList()
                    for (i in 0 until attrCount) {
                        buf.position(start + 16 + attrStart + i * attrSize)
                        val ns = buf.int
                        val attrName = strings.getOrElse(buf.int) { "?" }
                        val rawValue = buf.int
                        buf.short
                        buf.get()
                        val dataType = buf.get().toInt() and 0xFF
                        val data = buf.int
                        val prefix = if (ns >= 0) namespaces[strings.getOrElse(ns) { "" }]?.let { "$it:" } ?: "" else ""
                        val value = if (rawValue >= 0) strings.getOrElse(rawValue) { "" } else formatValue(dataType, data)
                        out.append("\n").append("  ".repeat(depth + 2)).append(prefix).append(attrName).append("=\"").append(escape(value)).append('"')
                    }
                    out.append(">\n")
                    depth++
                }
                RES_XML_END_ELEMENT -> {
                    buf.position(start + 20)
                    depth = (depth - 1).coerceAtLeast(0)
                    out.append("  ".repeat(depth)).append("</").append(strings.getOrElse(buf.int) { "?" }).append(">\n")
                }
                RES_XML_RESOURCE_MAP -> Unit
            }
            buf.position(start + size)
            if (headerSize == 0) break
        }
        return out.toString()
    }

    private fun readStrings(buf: ByteBuffer, start: Int): List<String> {
        buf.position(start + 8)
        val count = buf.int
        buf.int
        val flags = buf.int
        val stringsStart = buf.int
        buf.int
        val utf8 = flags and (1 shl 8) != 0
        val offsets = IntArray(count) { buf.int }
        return offsets.map { off ->
            var p = start + stringsStart + off
            if (utf8) {
                p += if (buf.get(p).toInt() and 0x80 != 0) 2 else 1
                var len = buf.get(p).toInt() and 0xFF
                p++
                if (len and 0x80 != 0) { len = ((len and 0x7F) shl 8) or (buf.get(p).toInt() and 0xFF); p++ }
                String(ByteArray(len) { buf.get(p + it) }, Charsets.UTF_8)
            } else {
                var len = buf.getShort(p).toInt() and 0xFFFF
                p += 2
                if (len and 0x8000 != 0) { len = ((len and 0x7FFF) shl 16) or (buf.getShort(p).toInt() and 0xFFFF); p += 2 }
                String(CharArray(len) { buf.getShort(p + it * 2).toInt().toChar() })
            }
        }
    }

    private fun formatValue(type: Int, data: Int): String = when (type) {
        0x01 -> "@0x%08X".format(data)
        0x02 -> "?0x%08X".format(data)
        0x10 -> data.toString()
        0x11 -> "0x%X".format(data)
        0x12 -> if (data != 0) "true" else "false"
        0x1C, 0x1D -> "#%08X".format(data)
        0x05 -> "${data shr 8}${listOf("px", "dp", "sp", "pt", "in", "mm").getOrElse(data and 0xF) { "" }}"
        else -> "0x%X".format(data)
    }

    private fun escape(s: String) = s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;")
}

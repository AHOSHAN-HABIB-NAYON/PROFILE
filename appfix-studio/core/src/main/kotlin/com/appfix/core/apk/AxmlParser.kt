package com.appfix.core.apk

/**
 * Parser for Android's compiled binary XML format (ResXMLTree), as found in APK manifests and
 * compiled XML resources. Implemented from the AOSP `ResourceTypes.h` structures; every read is
 * bounds-checked so malformed or hostile input produces [BinaryFormatException] instead of crashing.
 */
object AxmlParser {
    private const val RES_XML_TYPE = 0x0003
    private const val RES_XML_RESOURCE_MAP_TYPE = 0x0180
    private const val RES_XML_START_NAMESPACE = 0x0100
    private const val RES_XML_END_NAMESPACE = 0x0101
    private const val RES_XML_START_ELEMENT = 0x0102
    private const val RES_XML_END_ELEMENT = 0x0103
    private const val RES_XML_CDATA = 0x0104
    private const val MAX_ELEMENTS = 500_000
    private const val MAX_DEPTH = 1024

    private class Builder(val name: String, val ns: String?, val attrs: List<AxmlAttribute>, val line: Int) {
        val children = mutableListOf<AxmlElement>()
        var text: StringBuilder? = null
        fun build() = AxmlElement(name, ns, attrs, children.toList(), line, text?.toString()?.takeIf { it.isNotBlank() })
    }

    fun isBinaryXml(bytes: ByteArray): Boolean =
        bytes.size >= 8 && (bytes[0].toInt() and 0xff) == 0x03 && bytes[1].toInt() == 0x00

    fun parse(bytes: ByteArray): AxmlDocument {
        val buf = LeBuffer(bytes)
        if (buf.size < 8 || buf.u16(0) != RES_XML_TYPE) throw BinaryFormatException("Not a binary XML document")
        val headerSize = buf.u16(2)
        val total = minOf(buf.u32(4).toInt().let { if (it <= 0) buf.size else it }, buf.size)
        var pool: StringPool? = null
        var resIds = IntArray(0)
        val namespaces = linkedMapOf<String, String>()
        val stack = ArrayDeque<Builder>()
        var root: AxmlElement? = null
        var elementCount = 0

        var off = headerSize
        while (off + 8 <= total) {
            val type = buf.u16(off)
            val chunkHeader = buf.u16(off + 2)
            val size = buf.u32(off + 4).toInt()
            if (size < 8 || off.toLong() + size > total) throw BinaryFormatException("Corrupt chunk at $off (size $size)")
            when (type) {
                StringPool.TYPE -> pool = StringPool.parse(buf, off)
                RES_XML_RESOURCE_MAP_TYPE -> {
                    val n = (size - chunkHeader) / 4
                    resIds = IntArray(n) { buf.i32(off + chunkHeader + it * 4) }
                }
                RES_XML_START_NAMESPACE -> {
                    val p = pool ?: throw BinaryFormatException("Namespace before string pool")
                    val prefix = p[buf.i32(off + chunkHeader)].orEmpty()
                    val uri = p[buf.i32(off + chunkHeader + 4)].orEmpty()
                    if (uri.isNotEmpty()) namespaces[prefix] = uri
                }
                RES_XML_START_ELEMENT -> {
                    val p = pool ?: throw BinaryFormatException("Element before string pool")
                    if (++elementCount > MAX_ELEMENTS) throw BinaryFormatException("Too many XML elements")
                    if (stack.size >= MAX_DEPTH) throw BinaryFormatException("XML nesting too deep")
                    val line = buf.i32(off + 8)
                    val ext = off + chunkHeader
                    val ns = p[buf.i32(ext)]
                    val name = p[buf.i32(ext + 4)] ?: throw BinaryFormatException("Element without a name")
                    val attrStart = buf.u16(ext + 8)
                    val attrSize = buf.u16(ext + 10)
                    val attrCount = buf.u16(ext + 12)
                    if (attrSize < 20 && attrCount > 0) throw BinaryFormatException("Bad attribute size $attrSize")
                    val attrs = ArrayList<AxmlAttribute>(attrCount)
                    for (i in 0 until attrCount) {
                        val a = ext + attrStart + i * attrSize
                        val nsIdx = buf.i32(a)
                        val nameIdx = buf.i32(a + 4)
                        val rawIdx = buf.i32(a + 8)
                        val dataType = buf.u8(a + 15)
                        val data = buf.i32(a + 16)
                        val resId = if (nameIdx in resIds.indices) resIds[nameIdx] else 0
                        val attrNs = p[nsIdx]
                        val storedName = p[nameIdx].orEmpty()
                        // Framework attribute IDs are authoritative: obfuscators may rename the string.
                        val knownName = if (resId != 0) AndroidAttrs.nameFor(resId) else null
                        val attrName = knownName ?: storedName
                        val raw = if (rawIdx >= 0) p[rawIdx] else null
                        val rawValue = raw ?: if (dataType == AxmlAttribute.TYPE_STRING) p[data] else null
                        attrs += AxmlAttribute(attrNs, attrName, resId, rawValue, dataType, data)
                    }
                    stack.addLast(Builder(name, ns, attrs, line))
                }
                RES_XML_END_ELEMENT -> {
                    val b = stack.removeLastOrNull() ?: throw BinaryFormatException("Unbalanced end element")
                    val element = b.build()
                    if (stack.isEmpty()) {
                        if (root == null) root = element
                    } else {
                        stack.last().children += element
                    }
                }
                RES_XML_CDATA -> {
                    val p = pool
                    val text = p?.get(buf.i32(off + chunkHeader))
                    if (text != null) stack.lastOrNull()?.let { (it.text ?: StringBuilder().also { sb -> it.text = sb }).append(text) }
                }
                RES_XML_END_NAMESPACE -> Unit
                else -> Unit // Unknown chunk types are skipped, matching the platform parser.
            }
            off += size
        }
        // Tolerate truncated documents by closing open elements.
        while (stack.isNotEmpty()) {
            val element = stack.removeLast().build()
            if (stack.isEmpty()) root = root ?: element else stack.last().children += element
        }
        if (namespaces.isEmpty()) namespaces["android"] = AxmlAttribute.ANDROID_NS
        return AxmlDocument(root ?: throw BinaryFormatException("Document has no root element"), namespaces)
    }
}

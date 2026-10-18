package com.appfix.core.apk

import java.io.ByteArrayOutputStream

/**
 * Serialises an [AxmlDocument] back to Android binary XML. Used for manifest edits on APKs and in
 * tests. Follows aapt2 conventions: attribute names with resource IDs come first in the string
 * pool (mirrored by the resource map) and attributes are sorted by resource ID.
 */
object AxmlWriter {
    fun write(doc: AxmlDocument): ByteArray {
        val strings = StringTable()
        // 1. Attribute names that have resource IDs go first, in a fixed order.
        val idNames = linkedMapOf<Pair<String, Int>, Int>()
        fun collectIds(e: AxmlElement) {
            e.attributes.filter { it.resourceId != 0 }.sortedBy { it.resourceId.toUInt() }.forEach {
                idNames.getOrPut(it.name to it.resourceId) { idNames.size }
            }
            e.children.forEach(::collectIds)
        }
        collectIds(doc.root)
        val resourceIds = IntArray(idNames.size)
        idNames.forEach { (k, i) ->
            strings.addUnique(k.first, i)
            resourceIds[i] = k.second
        }

        val body = ByteArrayOutputStream()
        val nsEntries = doc.namespaces.entries.toList()
        for ((prefix, uri) in nsEntries) {
            writeNode(body, 0x0100, 1) { out -> out.i32(strings.index(prefix)); out.i32(strings.index(uri)) }
        }
        fun writeElement(e: AxmlElement) {
            val attrs = e.attributes.sortedWith(compareBy<AxmlAttribute>({ if (it.resourceId == 0) 1 else 0 }, { it.resourceId.toUInt() }, { it.name }))
            val nsIdx = e.namespace?.let { strings.index(it) } ?: -1
            val nameIdx = strings.index(e.name)
            val encoded = attrs.map { a ->
                val aNs = a.namespace?.let { strings.index(it) } ?: -1
                val aName = if (a.resourceId != 0) idNames.getValue(a.name to a.resourceId) else strings.index(a.name)
                val raw = a.rawValue?.let { strings.index(it) } ?: -1
                val type = if (a.rawValue != null && a.type == AxmlAttribute.TYPE_STRING) AxmlAttribute.TYPE_STRING else a.type
                val data = if (type == AxmlAttribute.TYPE_STRING) raw else a.data
                intArrayOf(aNs, aName, raw, type, data)
            }
            fun special(n: String) = attrs.indexOfFirst { it.name == n && it.namespace == null } + 1
            writeNode(body, 0x0102, e.lineNumber) { out ->
                out.i32(nsIdx); out.i32(nameIdx)
                out.u16(20); out.u16(20); out.u16(attrs.size)
                out.u16(special("id")); out.u16(special("class")); out.u16(special("style"))
                for (a in encoded) {
                    out.i32(a[0]); out.i32(a[1]); out.i32(a[2])
                    out.u16(8); out.u8(0); out.u8(a[3]); out.i32(a[4])
                }
            }
            e.text?.let { t ->
                val idx = strings.index(t)
                writeNode(body, 0x0104, e.lineNumber) { out -> out.i32(idx); out.u16(8); out.u8(0); out.u8(3); out.i32(idx) }
            }
            e.children.forEach(::writeElement)
            writeNode(body, 0x0103, e.lineNumber) { out -> out.i32(nsIdx); out.i32(nameIdx) }
        }
        writeElement(doc.root)
        for ((prefix, uri) in nsEntries.asReversed()) {
            writeNode(body, 0x0101, 1) { out -> out.i32(strings.index(prefix)); out.i32(strings.index(uri)) }
        }

        val pool = strings.encode()
        val resMap = Out().apply {
            u16(0x0180); u16(8); i32(8 + resourceIds.size * 4)
            resourceIds.forEach { i32(it) }
        }.bytes()
        val bodyBytes = body.toByteArray()
        val out = Out()
        out.u16(0x0003); out.u16(8); out.i32(8 + pool.size + resMap.size + bodyBytes.size)
        out.raw(pool); out.raw(resMap); out.raw(bodyBytes)
        return out.bytes()
    }

    private inline fun writeNode(target: ByteArrayOutputStream, type: Int, line: Int, ext: (Out) -> Unit) {
        val e = Out().also(ext).bytes()
        val o = Out()
        o.u16(type); o.u16(16); o.i32(16 + e.size); o.i32(line); o.i32(-1)
        o.raw(e)
        target.write(o.bytes())
    }

    private class StringTable {
        private val list = mutableListOf<String>()
        private val map = HashMap<String, Int>()

        fun addUnique(s: String, expectedIndex: Int) {
            // Resource-ID names are positional; duplicates of the same text are allowed there.
            check(list.size == expectedIndex)
            list += s
            map.putIfAbsent(s, expectedIndex)
        }

        fun index(s: String): Int = map.getOrPut(s) { list += s; list.size - 1 }

        fun encode(): ByteArray {
            val data = Out()
            val offsets = IntArray(list.size)
            list.forEachIndexed { i, s ->
                offsets[i] = data.size
                if (s.length > 0x7fff) {
                    data.u16(((s.length shr 16) and 0x7fff) or 0x8000); data.u16(s.length and 0xffff)
                } else {
                    data.u16(s.length)
                }
                s.forEach { data.u16(it.code) }
                data.u16(0)
            }
            while (data.size % 4 != 0) data.u8(0)
            val header = 28
            val stringsStart = header + list.size * 4
            val o = Out()
            o.u16(0x0001); o.u16(header); o.i32(stringsStart + data.size)
            o.i32(list.size); o.i32(0); o.i32(0); o.i32(stringsStart); o.i32(0)
            offsets.forEach { o.i32(it) }
            o.raw(data.bytes())
            return o.bytes()
        }
    }

    private class Out {
        private val b = ByteArrayOutputStream()
        val size: Int get() = b.size()
        fun u8(v: Int) = b.write(v and 0xff)
        fun u16(v: Int) { b.write(v and 0xff); b.write((v ushr 8) and 0xff) }
        fun i32(v: Int) { u16(v and 0xffff); u16((v ushr 16) and 0xffff) }
        fun raw(bytes: ByteArray) = b.write(bytes)
        fun bytes(): ByteArray = b.toByteArray()
    }
}

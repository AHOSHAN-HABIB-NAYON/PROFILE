package com.appfix.core.apk

/**
 * Read-only parser for compiled resource tables (resources.arsc). It extracts enough information to
 * resolve resource references (app label, icon path, theme names) and to list resource names.
 * Complex (bag) values are recorded by name only.
 */
class ResourceTable private constructor(
    val packages: List<ResPackage>,
    private val values: Map<Int, List<ResEntryValue>>,
    private val names: Map<Int, ResName>,
) {
    data class ResPackage(val id: Int, val name: String)
    data class ResName(val packageName: String, val type: String, val entry: String) {
        override fun toString() = "@$type/$entry"
    }
    data class ResConfig(val language: String, val region: String, val density: Int) {
        val isDefault: Boolean get() = language.isEmpty() && region.isEmpty() && density == 0
        override fun toString(): String = buildList {
            if (language.isNotEmpty()) add(language)
            if (region.isNotEmpty()) add("r$region")
            if (density != 0) add(densityName(density))
        }.joinToString("-").ifEmpty { "default" }
    }
    data class ResEntryValue(val config: ResConfig, val type: Int, val data: Int, val string: String?, val isComplex: Boolean)

    val entryCount: Int get() = names.size

    fun nameOf(id: Int): ResName? = names[id]

    fun valuesOf(id: Int): List<ResEntryValue> = values[id].orEmpty()

    fun idOf(type: String, entry: String): Int? = names.entries.firstOrNull { it.value.type == type && it.value.entry == entry }?.key

    /** Resource names grouped by type, e.g. "string" -> [app_name, ...]. */
    fun namesByType(): Map<String, List<String>> = names.values.groupBy({ it.type }, { it.entry }).mapValues { it.value.sorted() }

    /**
     * Resolves a reference to a string, preferring the default configuration and then English.
     * Follows reference chains up to a small depth.
     */
    fun resolveString(id: Int, depth: Int = 0): String? {
        if (depth > 8) return null
        val candidates = valuesOf(id).filter { !it.isComplex }
        val chosen = candidates.firstOrNull { it.config.language.isEmpty() && it.config.region.isEmpty() }
            ?: candidates.firstOrNull { it.config.language == "en" }
            ?: candidates.firstOrNull()
            ?: return null
        return when (chosen.type) {
            AxmlAttribute.TYPE_STRING -> chosen.string
            AxmlAttribute.TYPE_REFERENCE -> resolveString(chosen.data, depth + 1)
            else -> AxmlAttribute(null, "", 0, null, chosen.type, chosen.data).displayValue()
        }
    }

    /** For file-based resources (drawables, mipmaps), returns paths ordered from highest density. */
    fun resolveFilePaths(id: Int, depth: Int = 0): List<String> {
        if (depth > 8) return emptyList()
        return valuesOf(id).filter { !it.isComplex }.sortedByDescending { densityRank(it.config.density) }.flatMap {
            when (it.type) {
                AxmlAttribute.TYPE_STRING -> listOfNotNull(it.string)
                AxmlAttribute.TYPE_REFERENCE -> resolveFilePaths(it.data, depth + 1)
                else -> emptyList()
            }
        }.distinct()
    }

    companion object {
        private const val RES_TABLE_TYPE = 0x0002
        private const val RES_TABLE_PACKAGE_TYPE = 0x0200
        private const val RES_TABLE_TYPE_TYPE = 0x0201
        private const val FLAG_COMPLEX = 0x0001
        private const val FLAG_COMPACT = 0x0008
        private const val TYPE_FLAG_SPARSE = 0x01
        private const val TYPE_FLAG_OFFSET16 = 0x02
        private const val NO_ENTRY = 0xFFFFFFFFL

        fun densityName(d: Int) = when (d) {
            120 -> "ldpi"; 160 -> "mdpi"; 213 -> "tvdpi"; 240 -> "hdpi"; 320 -> "xhdpi"
            480 -> "xxhdpi"; 640 -> "xxxhdpi"; 0xfffe -> "anydpi"; 0xffff -> "nodpi"; else -> "${d}dpi"
        }

        private fun densityRank(d: Int) = when (d) {
            0xfffe -> 10_000 // anydpi (adaptive icons) wins
            0xffff -> -1
            else -> d
        }

        fun parse(bytes: ByteArray): ResourceTable {
            val buf = LeBuffer(bytes)
            if (buf.size < 12 || buf.u16(0) != RES_TABLE_TYPE) throw BinaryFormatException("Not a resources.arsc table")
            val header = buf.u16(2)
            val total = minOf(buf.u32(4).toInt().let { if (it <= 0) buf.size else it }, buf.size)
            var globalPool: StringPool? = null
            val packages = mutableListOf<ResPackage>()
            val values = HashMap<Int, MutableList<ResEntryValue>>()
            val names = HashMap<Int, ResName>()
            var off = header
            while (off + 8 <= total) {
                val type = buf.u16(off)
                val size = buf.u32(off + 4).toInt()
                if (size < 8 || off.toLong() + size > total) throw BinaryFormatException("Corrupt table chunk at $off")
                when (type) {
                    StringPool.TYPE -> globalPool = StringPool.parse(buf, off)
                    RES_TABLE_PACKAGE_TYPE -> parsePackage(buf, off, size, globalPool, packages, values, names)
                }
                off += size
            }
            return ResourceTable(packages, values, names)
        }

        private fun parsePackage(
            buf: LeBuffer, start: Int, size: Int, global: StringPool?,
            packages: MutableList<ResPackage>, values: HashMap<Int, MutableList<ResEntryValue>>, names: HashMap<Int, ResName>,
        ) {
            val headerSize = buf.u16(start + 2)
            val pkgId = buf.i32(start + 8)
            val nameChars = CharArray(128) { buf.u16(start + 12 + it * 2).toChar() }
            val pkgName = String(nameChars).substringBefore('\u0000')
            packages += ResPackage(pkgId, pkgName)
            val typeStringsOff = buf.i32(start + 268)
            val keyStringsOff = buf.i32(start + 276)
            val typeStrings = if (typeStringsOff > 0) StringPool.parse(buf, start + typeStringsOff) else null
            val keyStrings = if (keyStringsOff > 0) StringPool.parse(buf, start + keyStringsOff) else null
            var off = start + headerSize
            val end = start + size
            while (off + 8 <= end) {
                val type = buf.u16(off)
                val chunkSize = buf.u32(off + 4).toInt()
                if (chunkSize < 8 || off.toLong() + chunkSize > end) break
                if (type == RES_TABLE_TYPE_TYPE) {
                    parseType(buf, off, pkgId, pkgName, global, typeStrings, keyStrings, values, names)
                }
                off += chunkSize
            }
        }

        private fun parseType(
            buf: LeBuffer, start: Int, pkgId: Int, pkgName: String, global: StringPool?,
            typeStrings: StringPool?, keyStrings: StringPool?,
            values: HashMap<Int, MutableList<ResEntryValue>>, names: HashMap<Int, ResName>,
        ) {
            val headerSize = buf.u16(start + 2)
            val chunkSize = buf.u32(start + 4).toInt()
            val typeId = buf.u8(start + 8)
            val flags = buf.u8(start + 9)
            val entryCount = buf.u32(start + 12).toInt()
            val entriesStart = buf.u32(start + 16).toInt()
            val configStart = start + 20
            val configSize = buf.u32(configStart).toInt()
            val language = if (configSize >= 12) decodeLocale(buf.u8(configStart + 8), buf.u8(configStart + 9), 'a') else ""
            val region = if (configSize >= 12) decodeLocale(buf.u8(configStart + 10), buf.u8(configStart + 11), '0') else ""
            val density = if (configSize >= 16) buf.u16(configStart + 14) else 0
            val config = ResConfig(language, region, density)
            val typeName = typeStrings?.get(typeId - 1) ?: "type$typeId"
            val offsetsStart = start + headerSize
            val sparse = flags and TYPE_FLAG_SPARSE != 0
            val offset16 = flags and TYPE_FLAG_OFFSET16 != 0
            if (entryCount < 0 || entryCount > 0x10000) return

            for (i in 0 until entryCount) {
                val entryIndex: Int
                val entryOffset: Long
                when {
                    sparse -> {
                        entryIndex = buf.u16(offsetsStart + i * 4)
                        entryOffset = buf.u16(offsetsStart + i * 4 + 2).toLong() * 4
                    }
                    offset16 -> {
                        entryIndex = i
                        val v = buf.u16(offsetsStart + i * 2)
                        entryOffset = if (v == 0xffff) NO_ENTRY else v.toLong() * 4
                    }
                    else -> {
                        entryIndex = i
                        entryOffset = buf.u32(offsetsStart + i * 4)
                    }
                }
                if (entryOffset == NO_ENTRY) continue
                val e = start + entriesStart + entryOffset.toInt()
                if (e < start || e + 8 > start + chunkSize) continue
                val resId = (pkgId shl 24) or (typeId shl 16) or entryIndex
                val entryFlags = buf.u16(e + 2)
                val compact = entryFlags and FLAG_COMPACT != 0
                val keyIdx: Int
                val value: ResEntryValue
                if (compact) {
                    keyIdx = buf.u16(e)
                    val dataType = (entryFlags ushr 8) and 0xff
                    val data = buf.i32(e + 4)
                    value = ResEntryValue(config, dataType, data, if (dataType == AxmlAttribute.TYPE_STRING) global?.get(data) else null, false)
                } else {
                    val entrySize = buf.u16(e)
                    keyIdx = buf.i32(e + 4)
                    if (entryFlags and FLAG_COMPLEX != 0) {
                        value = ResEntryValue(config, 0, 0, null, true)
                    } else {
                        val v = e + entrySize
                        val dataType = buf.u8(v + 3)
                        val data = buf.i32(v + 4)
                        value = ResEntryValue(config, dataType, data, if (dataType == AxmlAttribute.TYPE_STRING) global?.get(data) else null, false)
                    }
                }
                names.getOrPut(resId) { ResName(pkgName, typeName, keyStrings?.get(keyIdx) ?: "0x%08x".format(resId)) }
                values.getOrPut(resId) { mutableListOf() } += value
            }
        }

        private fun decodeLocale(b0: Int, b1: Int, base: Char): String {
            if (b0 == 0) return ""
            if (b0 and 0x80 == 0) return "${b0.toChar()}${b1.toChar()}"
            // Packed 3-letter code.
            val first = b1 and 0x1f
            val second = ((b1 and 0xe0) shr 5) or ((b0 and 0x03) shl 3)
            val third = (b0 and 0x7c) shr 2
            return charArrayOf(base + first, base + second, base + third).concatToString()
        }
    }
}

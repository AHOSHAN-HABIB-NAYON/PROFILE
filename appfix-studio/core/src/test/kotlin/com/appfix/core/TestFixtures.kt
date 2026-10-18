package com.appfix.core

import com.appfix.core.apk.AxmlAttribute
import com.appfix.core.apk.AxmlAttribute.Companion.ANDROID_NS
import com.appfix.core.apk.AxmlDocument
import com.appfix.core.apk.AxmlElement
import com.appfix.core.apk.AxmlWriter
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object TestFixtures {
    fun tempDir(prefix: String = "appfix"): File = Files.createTempDirectory(prefix).toFile().also { it.deleteOnExit() }

    /** The repository's sample project, used as a realistic fixture. */
    val sampleProject: File by lazy {
        listOf(File("../sample-project"), File("appfix-studio/sample-project"), File("../../sample-project")).first { File(it, "settings.gradle.kts").isFile }
    }

    fun copySample(): File {
        val dest = File(tempDir("sample"), "workspace")
        sampleProject.copyRecursively(dest)
        File(dest, "build").deleteRecursively()
        File(dest, "app/build").deleteRecursively()
        File(dest, ".gradle").deleteRecursively()
        return dest
    }

    fun manifestDoc(
        pkg: String = "com.example.demo",
        versionCode: Int = 42,
        versionName: String = "4.2.0",
        labelRef: Int? = 0x7f010000,
        iconRef: Int? = 0x7f020000,
        obfuscateNames: Boolean = false,
    ): AxmlDocument {
        fun a(name: String, value: String) = AxmlAttribute.string(ANDROID_NS, name, value).let { if (obfuscateNames) it.copy(name = "") else it }
        fun i(name: String, value: Int) = AxmlAttribute.int(ANDROID_NS, name, value).let { if (obfuscateNames) it.copy(name = "") else it }
        fun ref(name: String, id: Int) = AxmlAttribute(ANDROID_NS, if (obfuscateNames) "" else name, com.appfix.core.apk.AndroidAttrs.idFor(name)!!, null, AxmlAttribute.TYPE_REFERENCE, id)
        val launcher = AxmlElement("activity", attributes = listOf(a("name", ".MainActivity"), AxmlAttribute.bool(ANDROID_NS, "exported", true)), children = listOf(
            AxmlElement("intent-filter", children = listOf(
                AxmlElement("action", attributes = listOf(a("name", "android.intent.action.MAIN"))),
                AxmlElement("category", attributes = listOf(a("name", "android.intent.category.LAUNCHER"))),
            )),
        ))
        val appAttrs = listOfNotNull(labelRef?.let { ref("label", it) }, iconRef?.let { ref("icon", it) }, AxmlAttribute.bool(ANDROID_NS, "debuggable", true))
        val root = AxmlElement(
            "manifest",
            attributes = listOf(i("versionCode", versionCode), a("versionName", versionName), AxmlAttribute.string(null, "package", pkg, 0), i("compileSdkVersion", 36)),
            children = listOf(
                AxmlElement("uses-sdk", attributes = listOf(i("minSdkVersion", 24), i("targetSdkVersion", 36))),
                AxmlElement("uses-permission", attributes = listOf(a("name", "android.permission.INTERNET"))),
                AxmlElement("uses-permission", attributes = listOf(a("name", "android.permission.CAMERA"))),
                AxmlElement("application", attributes = appAttrs, children = listOf(
                    launcher,
                    AxmlElement("service", attributes = listOf(a("name", "com.example.demo.SyncService"))),
                )),
            ),
        )
        return AxmlDocument(root)
    }

    /** Builds a minimal resources.arsc with string 0x7f010000 and mipmap 0x7f020000 (xxxhdpi). */
    fun resourceTable(label: String = "Demo App", iconPath: String = "res/mipmap-xxxhdpi-v4/ic_launcher.png"): ByteArray {
        val global = stringPool(listOf(label, iconPath))
        val typeStrings = stringPool(listOf("string", "mipmap"))
        val keyStrings = stringPool(listOf("app_name", "ic_launcher"))
        fun typeChunk(typeId: Int, density: Int, stringIndex: Int): ByteArray {
            val cfg = ByteArray(64).also { le32(it, 0, 64); le16(it, 14, density) }
            val header = 20 + cfg.size
            val offsets = ByteArray(4) // one entry at offset 0
            val entry = ByteArray(16).also {
                le16(it, 0, 8); le16(it, 2, 0); le32(it, 4, 0) // entry: size, flags, key index (patched below)
                le16(it, 8, 8); it[10] = 0; it[11] = 3; le32(it, 12, stringIndex)
            }
            le32(entry, 4, typeId - 1)
            val entriesStart = header + offsets.size
            val total = entriesStart + entry.size
            val out = ByteArray(total)
            le16(out, 0, 0x0201); le16(out, 2, header); le32(out, 4, total)
            out[8] = typeId.toByte(); out[9] = 0; le32(out, 12, 1); le32(out, 16, entriesStart)
            System.arraycopy(cfg, 0, out, 20, cfg.size)
            System.arraycopy(offsets, 0, out, header, offsets.size)
            System.arraycopy(entry, 0, out, entriesStart, entry.size)
            return out
        }
        val types = typeChunk(1, 0, 0) + typeChunk(2, 640, 1)
        val pkgHeader = 288
        val pkgSize = pkgHeader + typeStrings.size + keyStrings.size + types.size
        val pkg = ByteArray(pkgSize)
        le16(pkg, 0, 0x0200); le16(pkg, 2, pkgHeader); le32(pkg, 4, pkgSize); le32(pkg, 8, 0x7f)
        "com.example.demo".forEachIndexed { i, c -> le16(pkg, 12 + i * 2, c.code) }
        le32(pkg, 268, pkgHeader); le32(pkg, 276, pkgHeader + typeStrings.size)
        System.arraycopy(typeStrings, 0, pkg, pkgHeader, typeStrings.size)
        System.arraycopy(keyStrings, 0, pkg, pkgHeader + typeStrings.size, keyStrings.size)
        System.arraycopy(types, 0, pkg, pkgHeader + typeStrings.size + keyStrings.size, types.size)
        val total = 12 + global.size + pkg.size
        val table = ByteArray(12).also { le16(it, 0, 0x0002); le16(it, 2, 12); le32(it, 4, total); le32(it, 8, 1) }
        return table + global + pkg
    }

    fun stringPool(strings: List<String>): ByteArray {
        val data = ByteArrayOutputStream()
        val offsets = IntArray(strings.size)
        strings.forEachIndexed { i, s ->
            offsets[i] = data.size()
            val b = ByteArray(2 + s.length * 2 + 2)
            le16(b, 0, s.length)
            s.forEachIndexed { k, c -> le16(b, 2 + k * 2, c.code) }
            data.write(b)
        }
        while (data.size() % 4 != 0) data.write(0)
        val header = 28
        val start = header + strings.size * 4
        val out = ByteArray(start + data.size())
        le16(out, 0, 1); le16(out, 2, header); le32(out, 4, out.size); le32(out, 8, strings.size); le32(out, 20, start)
        offsets.forEachIndexed { i, o -> le32(out, header + i * 4, o) }
        System.arraycopy(data.toByteArray(), 0, out, start, data.size())
        return out
    }

    fun le16(b: ByteArray, o: Int, v: Int) { b[o] = v.toByte(); b[o + 1] = (v shr 8).toByte() }
    fun le32(b: ByteArray, o: Int, v: Int) { le16(b, o, v and 0xffff); le16(b, o + 2, (v ushr 16) and 0xffff) }

    fun zip(file: File, entries: Map<String, ByteArray>, stored: Boolean = false): File {
        ZipOutputStream(file.outputStream()).use { z ->
            for ((name, bytes) in entries) {
                val e = ZipEntry(name)
                if (stored) {
                    e.method = ZipEntry.STORED; e.size = bytes.size.toLong(); e.compressedSize = bytes.size.toLong()
                    e.crc = CRC32().also { it.update(bytes) }.value
                }
                z.putNextEntry(e); z.write(bytes); z.closeEntry()
            }
        }
        return file
    }

    fun syntheticApk(file: File, extra: Map<String, ByteArray> = emptyMap(), doc: AxmlDocument = manifestDoc()): File = zip(file, linkedMapOf(
        "AndroidManifest.xml" to AxmlWriter.write(doc),
        "classes.dex" to "dex\n035\u0000".toByteArray(),
        "classes2.dex" to "dex\n035\u0000".toByteArray(),
        "resources.arsc" to resourceTable(),
        "res/mipmap-xxxhdpi-v4/ic_launcher.png" to ByteArray(10),
    ) + extra)

    /** Rewrites central-directory fields of [entryName] in place (used to craft hostile archives). */
    fun patchCentralDirectory(file: File, entryName: String, madeBy: Int? = null, externalAttrs: Long? = null, uncompressedSize: Long? = null) {
        val bytes = file.readBytes()
        val name = entryName.toByteArray()
        var p = 0
        while (p + 46 < bytes.size) {
            if (bytes[p] == 0x50.toByte() && bytes[p + 1] == 0x4b.toByte() && bytes[p + 2] == 0x01.toByte() && bytes[p + 3] == 0x02.toByte()) {
                val nameLen = (bytes[p + 28].toInt() and 0xff) or ((bytes[p + 29].toInt() and 0xff) shl 8)
                if (nameLen == name.size && bytes.copyOfRange(p + 46, p + 46 + nameLen).contentEquals(name)) {
                    madeBy?.let { le16(bytes, p + 4, it) }
                    externalAttrs?.let { le32(bytes, p + 38, it.toInt()) }
                    uncompressedSize?.let { le32(bytes, p + 24, it.toInt()) }
                }
            }
            p++
        }
        file.writeBytes(bytes)
    }
}

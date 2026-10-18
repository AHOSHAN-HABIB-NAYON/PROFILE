package com.appfix.core.apk

import com.appfix.core.util.CancelToken
import java.io.File
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/** Edits that can be made to a compiled APK without decoding resources (no Apktool needed). */
data class ApkEdits(
    val versionName: String? = null,
    val versionCode: Long? = null,
    /** Sets android:label on <application> (and the launcher activity) to a literal string. */
    val label: String? = null,
    /** APK entry path -> replacement bytes (same-name raster images). */
    val replacedFiles: Map<String, ByteArray> = emptyMap(),
)

data class ReplaceableImage(val resource: String, val path: String, val size: Long)

class ApkModificationException(message: String) : RuntimeException(message)

/**
 * Rebuilds an APK with [ApkEdits]. The output is UNSIGNED and must be signed (apksig aligns entries
 * while signing). The original file is never modified.
 *
 * Limits: resources cannot be added or renamed, only same-name raster files replaced; code (DEX)
 * is not changed; split APKs and encrypted entries are rejected.
 */
object ApkModifier {
    private val signatureFile = Regex("^META-INF/[^/]+\\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST\\.MF$", RegexOption.IGNORE_CASE)

    /** Raster images that can be swapped, grouped by resource name. */
    fun replaceableImages(apk: File): List<ReplaceableImage> {
        val out = mutableListOf<ReplaceableImage>()
        ZipFile(apk).use { z ->
            val arsc = z.getEntry("resources.arsc")?.let { e -> z.getInputStream(e).use { it.readBytes() } } ?: return emptyList()
            val table = ResourceTable.parse(arsc)
            val sizes = z.entries().toList().associate { it.name to it.size }
            for (pkg in table.namesByType().filterKeys { it == "drawable" || it == "mipmap" }) {
                for (name in pkg.value) {
                    val id = table.idOf(pkg.key, name) ?: continue
                    for (path in table.resolveFilePaths(id)) {
                        if (path.substringAfterLast('.').lowercase() in setOf("png", "webp", "jpg", "jpeg") && !path.endsWith(".9.png")) {
                            out += ReplaceableImage("@${pkg.key}/$name", path, sizes[path] ?: 0)
                        }
                    }
                }
            }
        }
        return out.distinctBy { it.path }
    }

    fun modify(input: File, output: File, edits: ApkEdits, cancel: CancelToken = CancelToken.NONE) {
        if (edits.versionName != null && edits.versionName.isBlank()) throw ApkModificationException("Version name cannot be empty")
        if (edits.versionCode != null && edits.versionCode !in 1..2_100_000_000) throw ApkModificationException("Version code must be between 1 and 2100000000")
        if (edits.label != null && edits.label.isBlank()) throw ApkModificationException("The app name cannot be empty")
        val tmp = File(output.parentFile, output.name + ".part")
        tmp.parentFile?.mkdirs()
        try {
            ZipFile(input).use { zip ->
                val entries = zip.entries().toList()
                if (entries.none { it.name == "AndroidManifest.xml" }) throw ApkModificationException("Not an APK: AndroidManifest.xml is missing")
                val names = entries.map { it.name }.toSet()
                edits.replacedFiles.keys.firstOrNull { it !in names }?.let { throw ApkModificationException("$it is not in the APK") }
                ZipOutputStream(tmp.outputStream().buffered()).use { out ->
                    for (e in entries) {
                        cancel.throwIfCancelled()
                        if (e.isDirectory || signatureFile.matches(e.name)) continue
                        val original = zip.getInputStream(e).use { it.readBytes() }
                        val bytes = when {
                            e.name == "AndroidManifest.xml" -> editManifest(original, edits)
                            e.name in edits.replacedFiles -> edits.replacedFiles.getValue(e.name)
                            else -> original
                        }
                        val ne = ZipEntry(e.name)
                        ne.time = e.time
                        if (e.method == ZipEntry.STORED) {
                            ne.method = ZipEntry.STORED
                            ne.size = bytes.size.toLong()
                            ne.compressedSize = bytes.size.toLong()
                            ne.crc = CRC32().also { it.update(bytes) }.value
                        } else {
                            ne.method = ZipEntry.DEFLATED
                        }
                        out.putNextEntry(ne)
                        out.write(bytes)
                        out.closeEntry()
                    }
                }
            }
            if (output.exists()) output.delete()
            if (!tmp.renameTo(output)) throw ApkModificationException("Could not write the modified APK")
        } finally {
            if (tmp.exists()) tmp.delete()
        }
    }

    fun editManifest(bytes: ByteArray, edits: ApkEdits): ByteArray {
        if (edits.versionName == null && edits.versionCode == null && edits.label == null) return bytes
        val doc = AxmlParser.parse(bytes)
        if (doc.root.attr("split", null) != null) throw ApkModificationException("Split APKs cannot be modified on their own")
        val ns = AxmlAttribute.ANDROID_NS
        fun AxmlElement.withAttr(attr: AxmlAttribute): AxmlElement {
            val i = attributes.indexOfFirst { it.resourceId == attr.resourceId && it.resourceId != 0 || it.name == attr.name && it.namespace == attr.namespace }
            return copy(attributes = if (i >= 0) attributes.toMutableList().also { it[i] = attr } else attributes + attr)
        }
        var root = doc.root
        edits.versionName?.let { root = root.withAttr(AxmlAttribute.string(ns, "versionName", it.trim())) }
        edits.versionCode?.let { root = root.withAttr(AxmlAttribute.int(ns, "versionCode", it.toInt())) }
        edits.label?.let { label ->
            root = root.copy(children = root.children.map { child ->
                if (child.name != "application") child else {
                    val app = child.withAttr(AxmlAttribute.string(ns, "label", label.trim()))
                    // Launcher activities may have their own label, which the launcher shows instead.
                    app.copy(children = app.children.map { a ->
                        val isLauncher = (a.name == "activity" || a.name == "activity-alias") && a.childrenNamed("intent-filter").any { f ->
                            f.childrenNamed("category").any { it.androidValue("name") == "android.intent.category.LAUNCHER" }
                        }
                        if (isLauncher && a.attr("label") != null) a.withAttr(AxmlAttribute.string(ns, "label", label.trim())) else a
                    })
                }
            })
        }
        return AxmlWriter.write(doc.copy(root = root))
    }
}

package com.webtecit.filepilot.core.archive

import com.github.junrar.Archive
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import net.lingala.zip4j.ZipFile
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.AesKeyStrength
import net.lingala.zip4j.model.enums.CompressionLevel
import net.lingala.zip4j.model.enums.EncryptionMethod
import org.apache.commons.compress.archivers.ArchiveEntry as CcEntry
import org.apache.commons.compress.archivers.ArchiveInputStream
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import org.apache.commons.compress.archivers.sevenz.SevenZOutputFile
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream

enum class ArchiveFormat(val label: String, val extension: String) {
    ZIP("ZIP", "zip"), SEVEN_Z("7z", "7z"), TAR_GZ("TAR.GZ", "tar.gz"), RAR("RAR", "rar"), TAR("TAR", "tar"),
    TAR_BZ2("TAR.BZ2", "tar.bz2"), TAR_XZ("TAR.XZ", "tar.xz"), GZ("GZ", "gz"), BZ2("BZ2", "bz2"), XZ("XZ", "xz"),
}

/** How hard to compress: Store keeps files as they are (fastest), Maximum makes the smallest file. */
enum class CompressLevel(val label: String) { STORE("Store"), FAST("Fast"), NORMAL("Normal"), MAXIMUM("Maximum") }

class PasswordNeededException(val wrong: Boolean) : Exception(if (wrong) "The password is incorrect." else "This archive is protected by a password.")

/**
 * One place for every archive format: list, extract (all or selected, with passwords) and create.
 * Every extracted path is checked so nothing can be written outside the target folder.
 */
object ArchiveEngine {

    fun formatOf(name: String): ArchiveFormat? {
        val n = name.lowercase()
        return when {
            n.endsWith(".tar.gz") || n.endsWith(".tgz") -> ArchiveFormat.TAR_GZ
            n.endsWith(".tar.bz2") || n.endsWith(".tbz2") -> ArchiveFormat.TAR_BZ2
            n.endsWith(".tar.xz") || n.endsWith(".txz") -> ArchiveFormat.TAR_XZ
            n.endsWith(".tar") -> ArchiveFormat.TAR
            n.endsWith(".zip") || n.endsWith(".jar") || n.endsWith(".apk") || n.endsWith(".xapk") || n.endsWith(".apks") || n.endsWith(".aar") || n.endsWith(".epub") -> ArchiveFormat.ZIP
            n.endsWith(".7z") -> ArchiveFormat.SEVEN_Z
            n.endsWith(".rar") -> ArchiveFormat.RAR
            n.endsWith(".gz") -> ArchiveFormat.GZ
            n.endsWith(".bz2") -> ArchiveFormat.BZ2
            n.endsWith(".xz") -> ArchiveFormat.XZ
            else -> null
        }
    }

    fun isEncrypted(file: File): Boolean = runCatching {
        when (formatOf(file.name)) {
            ArchiveFormat.ZIP -> ZipFile(file).isEncrypted
            ArchiveFormat.RAR -> Archive(file).use { a -> a.isEncrypted || a.fileHeaders.any { it.isEncrypted } }
            else -> false
        }
    }.getOrDefault(false)

    fun list(file: File, password: CharArray? = null): List<ArchiveEntry> = when (formatOf(file.name)) {
        ArchiveFormat.ZIP -> ZipFile(file).fileHeaders.map { ArchiveEntry(it.fileName, it.uncompressedSize, it.compressedSize, it.isDirectory, it.lastModifiedTimeEpoch) }
        ArchiveFormat.RAR -> Archive(file, password?.let { String(it) }).use { a ->
            a.fileHeaders.map { h -> ArchiveEntry(h.fileName.replace('\\', '/'), h.fullUnpackSize, h.fullPackSize, h.isDirectory, h.mTime?.time ?: 0) }
        }
        ArchiveFormat.SEVEN_Z -> sevenZ(file, password).use { z -> z.entries.map { ArchiveEntry(it.name, it.size, it.size, it.isDirectory, if (it.hasLastModifiedDate) it.lastModifiedDate.time else 0) } }
        ArchiveFormat.TAR, ArchiveFormat.TAR_GZ, ArchiveFormat.TAR_BZ2, ArchiveFormat.TAR_XZ -> tarStream(file).use { t ->
            buildList { while (true) { val e = t.nextTarEntry ?: break; add(ArchiveEntry(e.name, e.size, e.size, e.isDirectory, e.modTime.time)) } }
        }
        ArchiveFormat.GZ, ArchiveFormat.BZ2, ArchiveFormat.XZ -> listOf(ArchiveEntry(file.name.substringBeforeLast('.'), -1, file.length(), false, file.lastModified()))
        null -> throw IllegalArgumentException("This file type isn't a supported archive.")
    }

    /**
     * Extracts into [target]. [only] limits extraction to these entry paths (folders include their content).
     * Returns the number of files written.
     */
    suspend fun extract(file: File, target: File, only: Set<String>? = null, password: CharArray? = null, onProgress: (Int, String) -> Unit = { _, _ -> }): Int {
        target.mkdirs()
        val base = target.canonicalFile
        var count = 0
        fun wanted(name: String) = only == null || only.any { name == it || name.startsWith(it.trimEnd('/') + "/") }
        suspend fun write(name: String, isDir: Boolean, data: () -> InputStream) {
            currentCoroutineContext().ensureActive()
            if (!wanted(name)) return
            val out = ZipTools.safeChild(base, name.replace('\\', '/')) ?: throw SecurityException("The archive contains an unsafe path: $name")
            if (isDir) { out.mkdirs(); return }
            out.parentFile?.mkdirs()
            data().use { input -> out.outputStream().use { input.copyTo(it, 256 * 1024) } }
            onProgress(++count, name)
        }
        when (formatOf(file.name)) {
            ArchiveFormat.ZIP -> {
                val zip = ZipFile(file)
                if (zip.isEncrypted) {
                    if (password == null) throw PasswordNeededException(false)
                    zip.setPassword(password)
                }
                try {
                    for (h in zip.fileHeaders) write(h.fileName, h.isDirectory) { zip.getInputStream(h) }
                } catch (e: net.lingala.zip4j.exception.ZipException) {
                    if (e.type == net.lingala.zip4j.exception.ZipException.Type.WRONG_PASSWORD) throw PasswordNeededException(true) else throw e
                }
            }
            ArchiveFormat.RAR -> try {
                Archive(file, password?.let { String(it) }).use { a ->
                    if ((a.isEncrypted || a.fileHeaders.any { it.isEncrypted }) && password == null) throw PasswordNeededException(false)
                    for (h in a.fileHeaders) write(h.fileName, h.isDirectory) { a.getInputStream(h) }
                }
            } catch (e: com.github.junrar.exception.RarException) {
                if (password != null) throw PasswordNeededException(true)
                throw IllegalArgumentException("This RAR archive can't be opened (RAR5 and some newer archives aren't supported).", e)
            }
            ArchiveFormat.SEVEN_Z -> try {
                sevenZ(file, password).use { z ->
                    while (true) {
                        val e = z.nextEntry ?: break
                        write(e.name, e.isDirectory) { z.getInputStream(e) }
                    }
                }
            } catch (e: org.apache.commons.compress.PasswordRequiredException) {
                throw PasswordNeededException(password != null)
            }
            ArchiveFormat.TAR, ArchiveFormat.TAR_GZ, ArchiveFormat.TAR_BZ2, ArchiveFormat.TAR_XZ -> tarStream(file).use { t ->
                while (true) {
                    val e = t.nextTarEntry ?: break
                    if (!e.isFile && !e.isDirectory) continue
                    write(e.name, e.isDirectory) { NonClosing(t) }
                }
            }
            ArchiveFormat.GZ, ArchiveFormat.BZ2, ArchiveFormat.XZ ->
                write(file.name.substringBeforeLast('.'), false) { compressorStream(file) }
            null -> throw IllegalArgumentException("This file type isn't a supported archive.")
        }
        return count
    }

    /** Creates an archive from files and folders (relative paths start at each source's name). */
    suspend fun create(
        sources: List<File>,
        out: File,
        format: ArchiveFormat,
        password: CharArray? = null,
        maximum: Boolean = false,
        onProgress: (Int, String) -> Unit = { _, _ -> },
    ): Int = create(sources, out, format, password, if (maximum) CompressLevel.MAXIMUM else CompressLevel.NORMAL, 0L, onProgress)

    /**
     * Creates an archive. [splitBytes] > 0 makes a split ZIP (name.zip, name.z01, …) for one folder or
     * a set of files.
     */
    suspend fun create(
        sources: List<File>,
        out: File,
        format: ArchiveFormat,
        password: CharArray?,
        level: CompressLevel,
        splitBytes: Long,
        onProgress: (Int, String) -> Unit = { _, _ -> },
    ): Int {
        var count = 0
        when (format) {
            ArchiveFormat.ZIP -> {
                val zip = ZipFile(out, password)
                val params = ZipParameters().apply {
                    if (level == CompressLevel.STORE) {
                        compressionMethod = net.lingala.zip4j.model.enums.CompressionMethod.STORE
                    } else {
                        compressionLevel = when (level) {
                            CompressLevel.FAST -> CompressionLevel.FASTEST
                            CompressLevel.MAXIMUM -> CompressionLevel.MAXIMUM
                            else -> CompressionLevel.NORMAL
                        }
                    }
                    if (password != null && password.isNotEmpty()) {
                        isEncryptFiles = true
                        encryptionMethod = EncryptionMethod.AES
                        aesKeyStrength = AesKeyStrength.KEY_STRENGTH_256
                    }
                }
                if (splitBytes > 0) {
                    require(splitBytes >= MIN_SPLIT) { "Parts must be at least 64 KB." }
                    val single = sources.singleOrNull()
                    when {
                        single != null && single.isDirectory -> zip.createSplitZipFileFromFolder(single, params, true, splitBytes)
                        sources.all { it.isFile } -> zip.createSplitZipFile(sources, params, true, splitBytes)
                        else -> throw IllegalArgumentException("A split ZIP can be made from one folder or from files. Select one folder, or only files.")
                    }
                    count = sources.sumOf { s -> if (s.isDirectory) s.walkTopDown().count { it.isFile } else 1 }
                    onProgress(count, out.name)
                } else {
                    for (s in sources) {
                        currentCoroutineContext().ensureActive()
                        if (s.isDirectory) zip.addFolder(s, params) else zip.addFile(s, params)
                        count += if (s.isDirectory) s.walkTopDown().count { it.isFile } else 1
                        onProgress(count, s.name)
                    }
                }
            }
            ArchiveFormat.SEVEN_Z -> SevenZOutputFile(out).use { z ->
                z.setContentMethods(
                    listOf(
                        if (level == CompressLevel.STORE) org.apache.commons.compress.archivers.sevenz.SevenZMethodConfiguration(org.apache.commons.compress.archivers.sevenz.SevenZMethod.COPY)
                        else org.apache.commons.compress.archivers.sevenz.SevenZMethodConfiguration(
                            org.apache.commons.compress.archivers.sevenz.SevenZMethod.LZMA2,
                            org.tukaani.xz.LZMA2Options(when (level) { CompressLevel.FAST -> 1; CompressLevel.MAXIMUM -> 9; else -> 6 }),
                        ),
                    ),
                )
                for (s in sources) for (f in s.walkTopDown()) {
                    currentCoroutineContext().ensureActive()
                    val name = s.name + f.absolutePath.removePrefix(s.absolutePath)
                    val entry = z.createArchiveEntry(f, name)
                    z.putArchiveEntry(entry)
                    if (f.isFile) {
                        f.inputStream().use { input ->
                            val buf = ByteArray(256 * 1024)
                            while (true) { val n = input.read(buf); if (n < 0) break; z.write(buf, 0, n) }
                        }
                        onProgress(++count, f.name)
                    }
                    z.closeArchiveEntry()
                }
            }
            ArchiveFormat.TAR_GZ, ArchiveFormat.TAR -> TarArchiveOutputStream(
                if (format == ArchiveFormat.TAR) out.outputStream().buffered()
                else GzipCompressorOutputStream(
                    out.outputStream().buffered(),
                    org.apache.commons.compress.compressors.gzip.GzipParameters().apply {
                        compressionLevel = when (level) { CompressLevel.STORE -> 0; CompressLevel.FAST -> 1; CompressLevel.MAXIMUM -> 9; else -> 6 }
                    },
                ),
            ).use { t ->
                t.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX)
                t.setBigNumberMode(TarArchiveOutputStream.BIGNUMBER_POSIX)
                for (s in sources) for (f in s.walkTopDown()) {
                    currentCoroutineContext().ensureActive()
                    val name = s.name + f.absolutePath.removePrefix(s.absolutePath)
                    t.putArchiveEntry(TarArchiveEntry(f, name))
                    if (f.isFile) { f.inputStream().use { it.copyTo(t) }; onProgress(++count, f.name) }
                    t.closeArchiveEntry()
                }
            }
            else -> throw IllegalArgumentException("Creating ${format.label} archives isn't supported.")
        }
        return count
    }

    /** Reads every entry to the end to check the archive isn't damaged. Returns the number of files checked. */
    suspend fun test(file: File, password: CharArray? = null, onProgress: (Int, String) -> Unit = { _, _ -> }): Int {
        var count = 0
        val sink = ByteArray(256 * 1024)
        fun drain(input: InputStream) { while (input.read(sink) >= 0) Unit }
        when (formatOf(file.name)) {
            ArchiveFormat.ZIP -> {
                val zip = ZipFile(file)
                if (zip.isEncrypted) {
                    if (password == null) throw PasswordNeededException(false)
                    zip.setPassword(password)
                }
                try {
                    for (h in zip.fileHeaders) {
                        currentCoroutineContext().ensureActive()
                        if (h.isDirectory) continue
                        zip.getInputStream(h).use { drain(it) }
                        onProgress(++count, h.fileName)
                    }
                } catch (e: net.lingala.zip4j.exception.ZipException) {
                    if (e.type == net.lingala.zip4j.exception.ZipException.Type.WRONG_PASSWORD) throw PasswordNeededException(true) else throw e
                }
            }
            ArchiveFormat.SEVEN_Z -> try {
                sevenZ(file, password).use { z ->
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val e = z.nextEntry ?: break
                        if (e.isDirectory) continue
                        while (z.read(sink) >= 0) Unit
                        onProgress(++count, e.name)
                    }
                }
            } catch (e: org.apache.commons.compress.PasswordRequiredException) {
                throw PasswordNeededException(password != null)
            }
            ArchiveFormat.RAR -> Archive(file, password?.let { String(it) }).use { a ->
                if ((a.isEncrypted || a.fileHeaders.any { it.isEncrypted }) && password == null) throw PasswordNeededException(false)
                for (h in a.fileHeaders) {
                    currentCoroutineContext().ensureActive()
                    if (h.isDirectory) continue
                    a.extractFile(h, object : java.io.OutputStream() {
                        override fun write(b: Int) = Unit
                        override fun write(b: ByteArray, off: Int, len: Int) = Unit
                    })
                    onProgress(++count, h.fileName)
                }
            }
            ArchiveFormat.TAR, ArchiveFormat.TAR_GZ, ArchiveFormat.TAR_BZ2, ArchiveFormat.TAR_XZ -> tarStream(file).use { t ->
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val e = t.nextTarEntry ?: break
                    if (e.isDirectory) continue
                    drain(t)
                    onProgress(++count, e.name)
                }
            }
            ArchiveFormat.GZ, ArchiveFormat.BZ2, ArchiveFormat.XZ -> compressorStream(file).use { drain(it); onProgress(++count, file.name) }
            null -> throw IllegalArgumentException("This isn't an archive FilePilot can read.")
        }
        return count
    }

    const val MIN_SPLIT = 65_536L

    private fun sevenZ(file: File, password: CharArray?): SevenZFile =
        if (password != null) SevenZFile(file, password) else SevenZFile(file)

    private fun tarStream(file: File): TarArchiveInputStream {
        val raw = BufferedInputStream(file.inputStream())
        val decompressed: InputStream = when (formatOf(file.name)) {
            ArchiveFormat.TAR_GZ -> GzipCompressorInputStream(raw)
            ArchiveFormat.TAR_BZ2 -> BZip2CompressorInputStream(raw)
            ArchiveFormat.TAR_XZ -> XZCompressorInputStream(raw)
            else -> raw
        }
        return TarArchiveInputStream(decompressed)
    }

    private fun compressorStream(file: File): InputStream {
        val raw = BufferedInputStream(file.inputStream())
        return when (formatOf(file.name)) {
            ArchiveFormat.BZ2 -> BZip2CompressorInputStream(raw)
            ArchiveFormat.XZ -> XZCompressorInputStream(raw)
            else -> GzipCompressorInputStream(raw)
        }
    }

    /** Lets an entry be copied without closing the archive stream it comes from. */
    private class NonClosing(private val inner: ArchiveInputStream) : InputStream() {
        override fun read(): Int = inner.read()
        override fun read(b: ByteArray, off: Int, len: Int): Int = inner.read(b, off, len)
        override fun close() {}
    }

    @Suppress("unused")
    private fun unused(e: CcEntry) = e
}

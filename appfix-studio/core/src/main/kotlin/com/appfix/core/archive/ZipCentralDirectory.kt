package com.appfix.core.archive

import java.io.File
import java.io.RandomAccessFile

/**
 * Minimal reader for a ZIP file's End Of Central Directory and central directory records.
 * java.util.zip does not expose Unix mode bits (needed to detect symlinks) or the region between
 * the last entry and the central directory (where the APK Signing Block lives), so we read them.
 */
class ZipCentralDirectory private constructor(
    val entries: List<Entry>,
    /** Offset of the first central directory record. */
    val centralDirectoryOffset: Long,
    val centralDirectorySize: Long,
    val eocdOffset: Long,
    val isZip64: Boolean,
) {
    data class Entry(
        val name: String,
        val method: Int,
        val compressedSize: Long,
        val uncompressedSize: Long,
        val externalAttributes: Long,
        val versionMadeBy: Int,
        val generalPurposeFlags: Int,
        val localHeaderOffset: Long,
    ) {
        /** Unix file mode when the archive was created on a Unix-like system, else 0. */
        val unixMode: Int get() = if ((versionMadeBy ushr 8) == 3) ((externalAttributes ushr 16) and 0xffff).toInt() else 0
        val isSymlink: Boolean get() = (unixMode and 0xf000) == 0xa000
        val isDirectory: Boolean get() = name.endsWith("/")
        val isEncrypted: Boolean get() = generalPurposeFlags and 1 != 0
    }

    companion object {
        private const val EOCD_SIG = 0x06054b50L
        private const val ZIP64_LOCATOR_SIG = 0x07064b50L
        private const val ZIP64_EOCD_SIG = 0x06064b50L
        private const val CEN_SIG = 0x02014b50L
        const val MAX_ENTRIES = 200_000

        fun read(file: File): ZipCentralDirectory = RandomAccessFile(file, "r").use { read(it) }

        fun read(raf: RandomAccessFile): ZipCentralDirectory {
            val length = raf.length()
            if (length < 22) throw InvalidArchiveException("File is too small to be a ZIP archive")
            val searchLen = minOf(length, 22L + 0xffff).toInt()
            val tail = ByteArray(searchLen)
            raf.seek(length - searchLen)
            raf.readFully(tail)
            var eocdInTail = -1
            for (i in searchLen - 22 downTo 0) {
                if (le32(tail, i) == EOCD_SIG) {
                    val commentLen = le16(tail, i + 20)
                    if (i + 22 + commentLen == searchLen) { eocdInTail = i; break }
                }
            }
            if (eocdInTail < 0) throw InvalidArchiveException("ZIP end-of-central-directory record not found")
            val eocdOffset = length - searchLen + eocdInTail
            var totalEntries = le16(tail, eocdInTail + 10).toLong()
            var cdSize = le32(tail, eocdInTail + 12)
            var cdOffset = le32(tail, eocdInTail + 16)
            var zip64 = false
            if (totalEntries == 0xffffL || cdSize == 0xffffffffL || cdOffset == 0xffffffffL) {
                val locOff = eocdOffset - 20
                if (locOff >= 0) {
                    val loc = ByteArray(20)
                    raf.seek(locOff); raf.readFully(loc)
                    if (le32(loc, 0) == ZIP64_LOCATOR_SIG) {
                        val z64Off = le64(loc, 8)
                        val z = ByteArray(56)
                        raf.seek(z64Off); raf.readFully(z)
                        if (le32(z, 0) != ZIP64_EOCD_SIG) throw InvalidArchiveException("Corrupt ZIP64 record")
                        totalEntries = le64(z, 32); cdSize = le64(z, 40); cdOffset = le64(z, 48)
                        zip64 = true
                    }
                }
            }
            if (totalEntries > MAX_ENTRIES) throw InvalidArchiveException("Archive has too many entries ($totalEntries)")
            if (cdOffset < 0 || cdSize < 0 || cdOffset + cdSize > eocdOffset) throw InvalidArchiveException("Central directory is outside the file")
            if (cdSize > 256L * 1024 * 1024) throw InvalidArchiveException("Central directory is too large")
            val cd = ByteArray(cdSize.toInt())
            raf.seek(cdOffset); raf.readFully(cd)
            val entries = ArrayList<Entry>(totalEntries.toInt())
            var p = 0
            while (p + 46 <= cd.size && entries.size < totalEntries) {
                if (le32(cd, p) != CEN_SIG) throw InvalidArchiveException("Corrupt central directory at entry ${entries.size}")
                val madeBy = le16(cd, p + 4)
                val flags = le16(cd, p + 8)
                val method = le16(cd, p + 10)
                var csize = le32(cd, p + 20)
                var usize = le32(cd, p + 24)
                val nameLen = le16(cd, p + 28)
                val extraLen = le16(cd, p + 30)
                val commentLen = le16(cd, p + 32)
                val ext = le32(cd, p + 38)
                var lho = le32(cd, p + 42)
                if (p + 46 + nameLen + extraLen + commentLen > cd.size) throw InvalidArchiveException("Truncated central directory")
                val utf8 = flags and 0x800 != 0
                val name = String(cd, p + 46, nameLen, if (utf8) Charsets.UTF_8 else Charsets.ISO_8859_1)
                // ZIP64 extended information extra field.
                var x = p + 46 + nameLen
                val xEnd = x + extraLen
                while (x + 4 <= xEnd) {
                    val id = le16(cd, x); val sz = le16(cd, x + 2)
                    if (id == 0x0001) {
                        var q = x + 4
                        if (usize == 0xffffffffL && q + 8 <= x + 4 + sz) { usize = le64(cd, q); q += 8 }
                        if (csize == 0xffffffffL && q + 8 <= x + 4 + sz) { csize = le64(cd, q); q += 8 }
                        if (lho == 0xffffffffL && q + 8 <= x + 4 + sz) { lho = le64(cd, q) }
                    }
                    x += 4 + sz
                }
                entries += Entry(name, method, csize, usize, ext, madeBy, flags, lho)
                p += 46 + nameLen + extraLen + commentLen
            }
            return ZipCentralDirectory(entries, cdOffset, cdSize, eocdOffset, zip64)
        }

        internal fun le16(b: ByteArray, o: Int) = (b[o].toInt() and 0xff) or ((b[o + 1].toInt() and 0xff) shl 8)
        internal fun le32(b: ByteArray, o: Int): Long = (le16(b, o).toLong()) or (le16(b, o + 2).toLong() shl 16)
        internal fun le64(b: ByteArray, o: Int): Long = le32(b, o) or (le32(b, o + 4) shl 32)
    }
}

class InvalidArchiveException(message: String) : RuntimeException(message)

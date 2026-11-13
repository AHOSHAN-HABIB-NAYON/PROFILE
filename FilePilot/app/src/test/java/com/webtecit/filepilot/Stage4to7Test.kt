package com.webtecit.filepilot

import com.webtecit.filepilot.core.archive.TarTools
import com.webtecit.filepilot.core.security.ChunkedCipher
import com.webtecit.filepilot.core.security.PinHash
import com.webtecit.filepilot.feature.devtools.FileToolsLogic
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class Stage4to7Test {
    @get:Rule val temp = TemporaryFolder()

    private fun encrypt(data: ByteArray, key: javax.crypto.SecretKey): ByteArray = runBlocking {
        ByteArrayOutputStream().also { ChunkedCipher.encrypt(data.inputStream(), it, key, byteArrayOf(1, 2, 3)) }.toByteArray()
    }

    private fun decrypt(bytes: ByteArray, key: javax.crypto.SecretKey): ByteArray = runBlocking {
        val input = bytes.inputStream()
        assertArrayEquals(byteArrayOf(1, 2, 3), ChunkedCipher.readHeader(input))
        ByteArrayOutputStream().also { ChunkedCipher.decrypt(input, it, key) }.toByteArray()
    }

    @Test fun encryptsAndDecryptsAcrossChunks() {
        val key = ChunkedCipher.newDataKey()
        for (size in listOf(0, 1, ChunkedCipher.CHUNK - 1, ChunkedCipher.CHUNK, ChunkedCipher.CHUNK * 2 + 17)) {
            val data = ByteArray(size) { (it * 7).toByte() }
            val enc = encrypt(data, key)
            assertArrayEquals(data, decrypt(enc, key))
        }
    }

    @Test fun detectsTamperingTruncationAndWrongKey() {
        val key = ChunkedCipher.newDataKey()
        val data = ByteArray(ChunkedCipher.CHUNK + 100) { it.toByte() }
        val enc = encrypt(data, key)
        val tampered = enc.copyOf().also { it[it.size / 2] = (it[it.size / 2].toInt() xor 1).toByte() }
        expectFailure { decrypt(tampered, key) }
        val truncated = enc.copyOf(enc.size - 40)
        expectFailure { decrypt(truncated, key) }
        expectFailure { decrypt(enc, ChunkedCipher.newDataKey()) }
    }

    private fun expectFailure(block: () -> Unit) {
        try {
            block()
            fail("expected decryption to fail")
        } catch (_: Exception) {
        }
    }

    @Test fun pinHashVerifiesOnlyTheRightPin() {
        val salt = ByteArray(16) { it.toByte() }
        val hash = PinHash.hash("2468", salt)
        assertTrue(PinHash.verify("2468", salt, hash))
        assertFalse(PinHash.verify("2469", salt, hash))
        assertFalse(PinHash.hash("2468", ByteArray(16)).contentEquals(hash))
    }

    @Test fun splitsAndJoinsFiles() = runBlocking {
        val dir = temp.newFolder("s")
        val data = ByteArray(2_500_123) { (it % 251).toByte() }
        val src = File(dir, "video.mp4").apply { writeBytes(data) }
        val parts = FileToolsLogic.split(src, dir, 1_000_000)
        assertEquals(listOf("video.mp4.001", "video.mp4.002", "video.mp4.003"), parts.map { it.name })
        assertEquals(parts, FileToolsLogic.partsOf(parts[1]))
        val joined = File(dir, "joined.mp4")
        FileToolsLogic.merge(parts, joined)
        assertArrayEquals(data, joined.readBytes())
    }

    @Test fun searchesTextInFiles() = runBlocking {
        val dir = temp.newFolder("t")
        File(dir, "a.txt").writeText("hello\nFilePilot rocks\nbye")
        File(dir, "b.bin").writeText("FilePilot")
        File(dir, "sub").mkdirs()
        File(dir, "sub/c.html").writeText("<p>filepilot</p>")
        val m = FileToolsLogic.searchText(dir, "filepilot")
        assertEquals(setOf("a.txt" to 2, "c.html" to 1), m.map { File(it.path).name to it.line }.toSet())
    }

    @Test fun readsAndExtractsTar() = runBlocking {
        val tar = ByteArrayOutputStream()
        fun header(name: String, size: Int, type: Char): ByteArray {
            val h = ByteArray(512)
            name.toByteArray().copyInto(h, 0)
            "%011o".format(size).toByteArray().copyInto(h, 124)
            h[156] = type.code.toByte()
            return h
        }
        val content = "hello tar".toByteArray()
        tar.write(header("dir/", 0, '5'))
        tar.write(header("dir/file.txt", content.size, '0'))
        tar.write(content); tar.write(ByteArray(512 - content.size))
        tar.write(ByteArray(1024))
        val out = temp.newFolder("x")
        assertEquals(1, TarTools.extract(tar.toByteArray().inputStream(), out))
        assertEquals("hello tar", File(out, "dir/file.txt").readText())
        val evil = ByteArrayOutputStream().apply { write(header("../evil.txt", 1, '0')); write(ByteArray(512)); write(ByteArray(1024)) }
        try {
            TarTools.extract(evil.toByteArray().inputStream(), temp.newFolder("y"))
            fail("expected unsafe path to be refused")
        } catch (_: SecurityException) {
        }
    }
}

class SmartQueryTest {
    private val now = java.util.Calendar.getInstance().apply { clear(); set(2026, 10, 13, 12, 0) }.timeInMillis
    private fun parse(q: String) = com.webtecit.filepilot.feature.search.SmartQueryParser.parse(q, now)

    @Test fun understandsTypeSizeAndTime() {
        val q = parse("large videos from last week")
        assertEquals(setOf(com.webtecit.filepilot.core.storage.FileKind.VIDEO), q.kinds)
        assertEquals(50_000_000L, q.minSize)
        assertEquals(now - 7L * 24 * 3600 * 1000, q.after)
        assertTrue(q.words.isEmpty())
    }

    @Test fun understandsExplicitSizesExtensionsYearsAndNames() {
        val q = parse("pdf invoice 2024 bigger than 2 mb")
        assertEquals(setOf("pdf"), q.extensions)
        assertEquals(2_000_000L, q.minSize)
        assertEquals(listOf("invoice"), q.words)
        val start = java.util.Calendar.getInstance().apply { clear(); set(2024, 0, 1) }.timeInMillis
        assertEquals(start, q.after)
        val small = parse("photos under 500 kb .png")
        assertEquals(500_000L, small.maxSize)
        assertEquals(setOf("png"), small.extensions)
        assertEquals(setOf(com.webtecit.filepilot.core.storage.FileKind.IMAGE), small.kinds)
    }

    @Test fun plainWordsSearchNames() {
        val q = parse("holiday beach")
        assertEquals(listOf("holiday", "beach"), q.words)
        assertTrue(q.kinds.isEmpty())
    }
}

class ProjectReplaceTest {
    @get:Rule val temp = TemporaryFolder()

    @Test fun replacesAcrossFilesWithRegexGroups() = runBlocking {
        val root = temp.newFolder("site")
        File(root, "index.html").writeText("<h1>Title</h1>\n<p>old-name</p>")
        File(root, "css").mkdirs()
        File(root, "css/a.css").writeText(".old-name { color: red }")
        File(root, "img.png").writeBytes(byteArrayOf(1, 2, 3))
        val p = FileToolsLogic.pattern("old-(\\w+)", regex = true, ignoreCase = false)
        assertEquals(2, FileToolsLogic.searchPattern(root, p).size)
        val (files, n) = FileToolsLogic.replaceInFiles(root, p, "new-$1")
        assertEquals(2 to 2, files to n)
        assertTrue(File(root, "css/a.css").readText().contains(".new-name"))
        val word = FileToolsLogic.pattern("Title", regex = false, ignoreCase = true, wholeWord = true)
        assertEquals(1, FileToolsLogic.searchPattern(root, word).size)
    }
}

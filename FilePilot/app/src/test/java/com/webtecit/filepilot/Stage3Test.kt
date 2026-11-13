package com.webtecit.filepilot

import com.webtecit.filepilot.core.archive.ZipTools
import com.webtecit.filepilot.core.text.TextCodec
import com.webtecit.filepilot.core.web.SitePaths
import com.webtecit.filepilot.feature.editor.EditorSession
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class Stage3Test {
    @get:Rule val temp = TemporaryFolder()

    @Test fun decodesAndReencodesWithoutChanges() {
        val samples = listOf(
            "plain ascii\n".toByteArray(),
            "বাংলা টেক্সট ✓\r\nline two\r\n".toByteArray(Charsets.UTF_8),
            byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "bom".toByteArray(),
            byteArrayOf(0xFF.toByte(), 0xFE.toByte()) + "utf16".toByteArray(Charsets.UTF_16LE),
        )
        for (bytes in samples) {
            val d = TextCodec.decode(bytes)
            // The editor works with "\n"; saving restores the original line endings.
            val edited = d.text.replace("\r\n", "\n")
            assertArrayEquals(bytes, TextCodec.encode(edited, d.charset, d.bom, d.crlf))
        }
    }

    @Test fun detectsEncodingsAndBinary() {
        assertEquals("UTF-8", TextCodec.decode("héllo".toByteArray()).charset)
        assertEquals("windows-1252", TextCodec.decode(byteArrayOf(0x63, 0x61, 0x66, 0xE9.toByte())).charset)
        assertTrue(TextCodec.decode(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte(), 0x41)).bom)
        assertTrue(TextCodec.looksBinary(byteArrayOf(1, 2, 0, 3)))
        assertFalse(TextCodec.looksBinary("text".toByteArray()))
        assertFalse(TextCodec.isValidUtf8(byteArrayOf(0xE2.toByte(), 0x82.toByte())))
    }

    @Test fun extractsZipAndBlocksPathTraversal() = runBlocking {
        val good = zipOf("site/index.html" to "<h1>hi</h1>", "site/css/a.css" to "body{}")
        val out = temp.newFolder("out")
        assertEquals(2, ZipTools.extract(good.inputStream(), out))
        assertEquals("<h1>hi</h1>", File(out, "site/index.html").readText())

        val evil = zipOf("../../evil.txt" to "x")
        try {
            ZipTools.extract(evil.inputStream(), temp.newFolder("out2"))
            fail("expected the unsafe entry to be refused")
        } catch (e: SecurityException) {
            assertFalse(File(temp.root, "evil.txt").exists())
        }
        assertNull(ZipTools.safeChild(out, "/etc/passwd"))
        assertNull(ZipTools.safeChild(out, "a/../../b"))
    }

    @Test fun zipsFoldersAndListsThem() = runBlocking {
        val dir = temp.newFolder("proj")
        File(dir, "index.html").writeText("x")
        File(dir, "js").mkdirs()
        File(dir, "js/app.js").writeText("y")
        val bytes = ByteArrayOutputStream().also { ZipTools.zip(listOf(dir), it) }.toByteArray()
        val names = ZipTools.list(bytes.inputStream()).map { it.path }
        assertTrue(names.containsAll(listOf("proj/", "proj/index.html", "proj/js/app.js")))
    }

    @Test fun sitePathsStayInsideTheProject() {
        val root = temp.newFolder("site")
        assertTrue(SitePaths.isInside(root, File(root, "a/b.html")))
        assertFalse(SitePaths.isInside(root, File(root, "../secret.txt")))
        assertEquals("text/javascript", SitePaths.mimeOf("app.mjs"))
        assertEquals("application/wasm", SitePaths.mimeOf("x.wasm"))
        assertEquals("https://appassets.androidplatform.net/site/my%20page.html", SitePaths.url("my page.html"))
    }

    @Test fun picksEditorModes() {
        assertEquals("\"htmlmixed\"", EditorSession.modeOf("index.html"))
        assertEquals("{\"name\":\"javascript\",\"json\":true}", EditorSession.modeOf("a.json"))
        assertEquals("\"text/x-kotlin\"", EditorSession.modeOf("Main.kt"))
        assertEquals("null", EditorSession.modeOf("notes.txt"))
    }

    private fun zipOf(vararg entries: Pair<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            entries.forEach { (name, text) ->
                z.putNextEntry(ZipEntry(name)); z.write(text.toByteArray()); z.closeEntry()
            }
        }
        return out.toByteArray()
    }
}

class CleanerScannersTest {
    @get:Rule val temp = TemporaryFolder()

    @Test fun findsDuplicatesByContentNotName() = runBlocking {
        val root = temp.newFolder("r")
        val data = ByteArray(5000) { it.toByte() }
        File(root, "a.jpg").writeBytes(data)
        File(root, "copy of a.jpg").writeBytes(data)
        File(root, "same size different.jpg").writeBytes(ByteArray(5000) { 7 })
        File(root, "small.txt").writeText("tiny")
        File(root, "small2.txt").writeText("tiny")
        val files = root.listFiles()!!.toList()
        val groups = com.webtecit.filepilot.core.cleaning.Scanners.duplicates(files, minSize = 1024)
        assertEquals(1, groups.size)
        assertEquals(setOf("a.jpg", "copy of a.jpg"), groups[0].map { it.name }.toSet())
    }

    @Test fun walksAndSkipsProtectedFoldersAndFindsEmptyOnes() = runBlocking {
        val root = temp.newFolder("storage")
        File(root, "Android/data/com.app/cache.bin").apply { parentFile!!.mkdirs(); writeText("x") }
        File(root, "Docs/notes.tmp").apply { parentFile!!.mkdirs(); writeText("x") }
        File(root, "Empty/Inner").mkdirs()
        val files = ArrayList<File>()
        val dirs = ArrayList<File>()
        com.webtecit.filepilot.core.cleaning.Scanners.walk(root, onDir = { dirs += it }) { files += it }
        assertEquals(listOf("notes.tmp"), files.map { it.name })
        assertTrue(com.webtecit.filepilot.core.cleaning.Scanners.isTemporary(files[0]))
        val empty = com.webtecit.filepilot.core.cleaning.Scanners.emptyFolders(dirs.filter { it != root })
        assertTrue(empty.any { it.name == "Empty" })
        assertFalse(empty.any { it.name == "Docs" })
    }
}

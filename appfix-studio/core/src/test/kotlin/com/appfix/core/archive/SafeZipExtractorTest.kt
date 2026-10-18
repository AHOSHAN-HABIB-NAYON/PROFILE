package com.appfix.core.archive

import com.appfix.core.TestFixtures
import com.appfix.core.util.CancelToken
import com.appfix.core.util.OperationCancelledException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class SafeZipExtractorTest {
    private val dir = TestFixtures.tempDir()
    private fun dest(name: String = "out") = File(dir, name)

    @Test
    fun `extracts a normal archive and skips noise`() {
        val zip = TestFixtures.zip(File(dir, "ok.zip"), linkedMapOf(
            "proj/settings.gradle" to "include ':app'".toByteArray(),
            "proj/app/src/main/AndroidManifest.xml" to "<manifest/>".toByteArray(),
            "proj/app/build/outputs/x.apk" to ByteArray(5),
            "__MACOSX/._proj" to ByteArray(3),
            "proj/.DS_Store" to ByteArray(3),
            "proj/tools/setup.exe" to ByteArray(3),
            "proj/gradlew" to "#!/bin/sh".toByteArray(),
        ))
        val out = dest()
        val r = SafeZipExtractor().extract(zip, out)
        assertEquals(3, r.filesWritten)
        assertTrue(File(out, "proj/settings.gradle").isFile)
        assertFalse(File(out, "proj/app/build").exists())
        assertFalse(File(out, "proj/tools/setup.exe").exists())
        assertFalse(File(out, "__MACOSX").exists())
        assertTrue(r.skipped.any { it.reason.contains(".exe") })
        assertTrue(r.warnings.any { it.contains("shell script") })
        assertFalse(File(out, "proj/gradlew").canExecute())
    }

    private fun assertRejected(entry: String) {
        val zip = TestFixtures.zip(File(dir, "evil-${entry.hashCode()}.zip"), linkedMapOf("ok.txt" to "fine".toByteArray(), entry to "pwned".toByteArray()))
        val out = dest("evil-${entry.hashCode()}")
        try {
            SafeZipExtractor().extract(zip, out)
            fail("$entry should be rejected")
        } catch (e: ArchiveSecurityException) {
            assertTrue(e.message!!.contains("Unsafe path"))
        }
        assertFalse("nothing may be written", out.exists() && out.list()!!.isNotEmpty())
        assertFalse(File(dir, "pwned.txt").exists())
    }

    @Test fun `rejects parent traversal`() = assertRejected("../../pwned.txt")
    @Test fun `rejects nested traversal`() = assertRejected("a/b/../../../pwned.txt")
    @Test fun `rejects absolute paths`() = assertRejected("/tmp/pwned.txt")
    @Test fun `rejects windows drive paths`() = assertRejected("C:\\Windows\\pwned.txt")
    @Test fun `rejects backslash traversal`() = assertRejected("..\\..\\pwned.txt")

    @Test
    fun `symlink entries are never materialised`() {
        val zip = TestFixtures.zip(File(dir, "link.zip"), linkedMapOf("a.txt" to "x".toByteArray(), "link" to "/etc/passwd".toByteArray()))
        TestFixtures.patchCentralDirectory(zip, "link", madeBy = 0x031e, externalAttrs = 0xA1FF0000L)
        val out = dest("link")
        val r = SafeZipExtractor().extract(zip, out)
        assertFalse(File(out, "link").exists())
        assertTrue(r.skipped.any { it.name == "link" && it.reason == "symbolic link" })
    }

    @Test
    fun `entries larger than declared are rejected as zip bombs`() {
        val zip = TestFixtures.zip(File(dir, "bomb.zip"), linkedMapOf("big.txt" to ByteArray(200_000) { 'a'.code.toByte() }))
        TestFixtures.patchCentralDirectory(zip, "big.txt", uncompressedSize = 100)
        val out = dest("bomb")
        try {
            SafeZipExtractor().extract(zip, out)
            fail()
        } catch (e: Exception) {
            // Either our size check or the JDK's CRC/size validation must stop it.
            assertTrue(e.toString(), e is ArchiveSecurityException || e is java.util.zip.ZipException || e is java.io.IOException)
        }
        assertFalse(out.exists())
    }

    @Test
    fun `total size limit is enforced`() {
        val zip = TestFixtures.zip(File(dir, "big.zip"), (1..5).associate { "f$it.bin" to ByteArray(1000) })
        try {
            SafeZipExtractor(ExtractionPolicy(maxTotalBytes = 3000)).extract(zip, dest("big"))
            fail()
        } catch (e: ArchiveSecurityException) {
            assertTrue(e.message!!.contains("expands to more than"))
        }
    }

    @Test
    fun `entry count limit is enforced`() {
        val zip = TestFixtures.zip(File(dir, "many.zip"), (1..20).associate { "f$it.txt" to ByteArray(1) })
        try { SafeZipExtractor(ExtractionPolicy(maxEntries = 10)).extract(zip, dest("many")); fail() } catch (e: ArchiveSecurityException) {}
    }

    @Test
    fun `cancellation deletes partial output`() {
        val zip = TestFixtures.zip(File(dir, "cancel.zip"), (1..50).associate { "f$it.txt" to ByteArray(10) })
        var calls = 0
        val out = dest("cancel")
        try {
            SafeZipExtractor().extract(zip, out, cancel = CancelToken { ++calls > 30 })
            fail()
        } catch (e: OperationCancelledException) {}
        assertFalse(out.exists())
    }

    @Test
    fun `invalid archives produce a clear error`() {
        val f = File(dir, "nope.zip").apply { writeText("not a zip at all") }
        try { SafeZipExtractor().extract(f, dest("nope")); fail() } catch (e: InvalidArchiveException) {
            assertTrue(e.message!!.contains("Not a valid ZIP"))
        }
    }

    @Test
    fun `refuses to extract into a non-empty directory`() {
        val zip = TestFixtures.zip(File(dir, "ne.zip"), mapOf("a" to ByteArray(1)))
        val out = dest("ne").apply { mkdirs(); File(this, "existing").writeText("keep") }
        try { SafeZipExtractor().extract(zip, out); fail() } catch (e: IllegalArgumentException) {}
        assertEquals("keep", File(out, "existing").readText())
    }
}

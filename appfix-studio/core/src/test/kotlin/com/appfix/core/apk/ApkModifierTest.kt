package com.appfix.core.apk

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipFile

class ApkModifierTest {
    private val dir = TestFixtures.tempDir()

    @Test
    fun `manifest edits and image replacement keep the rest intact`() {
        val input = TestFixtures.syntheticApk(File(dir, "in.apk"), mapOf("META-INF/CERT.SF" to ByteArray(3), "META-INF/CERT.RSA" to ByteArray(3), "META-INF/MANIFEST.MF" to ByteArray(3)))
        val before = input.readBytes()
        val images = ApkModifier.replaceableImages(input)
        assertEquals(listOf(ReplaceableImage("@mipmap/ic_launcher", "res/mipmap-xxxhdpi-v4/ic_launcher.png", 10)), images)
        val out = File(dir, "out.apk")
        ApkModifier.modify(input, out, ApkEdits(versionName = "5.0-custom", versionCode = 50, label = "My Renamed App", replacedFiles = mapOf(images.single().path to ByteArray(20) { 7 })))
        assertTrue("input untouched", before.contentEquals(input.readBytes()))
        val r = ApkInspector.inspect(out)
        assertEquals("5.0-custom", r.manifest?.versionName)
        assertEquals(50L, r.manifest?.versionCode)
        assertEquals("My Renamed App", r.label)
        assertEquals("com.example.demo", r.manifest?.packageName)
        assertEquals(listOf("android.permission.INTERNET", "android.permission.CAMERA"), r.manifest?.permissions)
        ZipFile(out).use { z ->
            assertFalse(z.entries().toList().any { it.name.startsWith("META-INF/") })
            assertEquals(20L, z.getEntry("res/mipmap-xxxhdpi-v4/ic_launcher.png").size)
            assertTrue(z.getEntry("classes.dex") != null)
        }
    }

    @Test
    fun `stored entries stay stored`() {
        val input = TestFixtures.zip(File(dir, "stored.apk"), linkedMapOf(
            "AndroidManifest.xml" to com.appfix.core.apk.AxmlWriter.write(TestFixtures.manifestDoc()),
            "resources.arsc" to TestFixtures.resourceTable(),
        ), stored = true)
        val out = File(dir, "stored-out.apk")
        ApkModifier.modify(input, out, ApkEdits(versionName = "2"))
        ZipFile(out).use { z -> assertEquals(ZipEntry.STORED, z.getEntry("resources.arsc").method) }
    }

    @Test
    fun `invalid edits are rejected`() {
        val input = TestFixtures.syntheticApk(File(dir, "x.apk"))
        for (e in listOf(ApkEdits(versionName = " "), ApkEdits(versionCode = 0), ApkEdits(label = ""), ApkEdits(replacedFiles = mapOf("res/missing.png" to ByteArray(1))))) {
            try { ApkModifier.modify(input, File(dir, "bad.apk"), e); fail(e.toString()) } catch (x: ApkModificationException) {}
        }
    }

    /** CI: modify the real sample APK; the app module then signs it and aapt2 checks it. */
    @Test
    fun `real sample apk can be modified`() {
        val path = System.getProperty("appfix.sampleApk")
        assumeTrue(path != null && File(path).isFile)
        val out = System.getenv("APPFIX_MODIFIED_OUT")?.let(::File) ?: File(dir, "sample-modified.apk")
        ApkModifier.modify(File(path!!), out, ApkEdits(versionName = "1.0-appfix", versionCode = 7, label = "Sample Modified"))
        val r = ApkInspector.inspect(out)
        assertEquals("1.0-appfix", r.manifest?.versionName)
        assertEquals(7L, r.manifest?.versionCode)
        assertEquals("Sample Modified", r.label)
        assertEquals("com.appfix.sample.MainActivity", r.manifest?.launcherActivity)
        assertTrue(r.signing.schemes.isEmpty())
    }
}

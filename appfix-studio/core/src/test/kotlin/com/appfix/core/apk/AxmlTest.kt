package com.appfix.core.apk

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.zip.ZipFile

class AxmlTest {
    @Test
    fun `write then parse round-trips a manifest`() {
        val bytes = AxmlWriter.write(TestFixtures.manifestDoc())
        assertTrue(AxmlParser.isBinaryXml(bytes))
        val doc = AxmlParser.parse(bytes)
        val s = ApkInspector.summarize(doc)
        assertEquals("com.example.demo", s.packageName)
        assertEquals(42L, s.versionCode)
        assertEquals("4.2.0", s.versionName)
        assertEquals(24, s.minSdk)
        assertEquals(36, s.targetSdk)
        assertEquals(36, s.compileSdk)
        assertTrue(s.debuggable)
        assertEquals(listOf("android.permission.INTERNET", "android.permission.CAMERA"), s.permissions)
        assertEquals("com.example.demo.MainActivity", s.launcherActivity)
        assertEquals(true, s.activities.single().exported)
        assertEquals("com.example.demo.SyncService", s.services.single().name)
    }

    @Test
    fun `framework attribute ids are used when names are stripped`() {
        val doc = AxmlParser.parse(AxmlWriter.write(TestFixtures.manifestDoc(obfuscateNames = true)))
        val s = ApkInspector.summarize(doc)
        assertEquals(42L, s.versionCode)
        assertEquals("4.2.0", s.versionName)
        assertEquals("com.example.demo.MainActivity", s.launcherActivity)
    }

    @Test
    fun `decoded xml is readable`() {
        val xml = AxmlParser.parse(AxmlWriter.write(TestFixtures.manifestDoc())).toXmlString()
        assertTrue(xml, xml.contains("android:versionName=\"4.2.0\""))
        assertTrue(xml, xml.contains("<uses-permission android:name=\"android.permission.CAMERA\" />"))
        assertTrue(xml, xml.contains("android:label=\"@0x7f010000\""))
    }

    @Test(expected = BinaryFormatException::class)
    fun `garbage input is rejected`() {
        AxmlParser.parse("<manifest/>".toByteArray())
    }

    @Test
    fun `truncated or corrupted documents never crash with unchecked exceptions`() {
        val bytes = AxmlWriter.write(TestFixtures.manifestDoc())
        val random = java.util.Random(7)
        for (i in 0 until 300) {
            val copy = bytes.copyOf(if (i % 3 == 0) random.nextInt(bytes.size) else bytes.size)
            if (i % 3 != 0) repeat(4) { copy[random.nextInt(copy.size)] = random.nextInt(256).toByte() }
            try {
                AxmlParser.parse(copy)
            } catch (e: BinaryFormatException) {
                // expected for corrupt input
            }
        }
    }

    @Test
    fun `resource table resolves strings and file paths`() {
        val t = ResourceTable.parse(TestFixtures.resourceTable())
        assertEquals("Demo App", t.resolveString(0x7f010000))
        assertEquals(listOf("res/mipmap-xxxhdpi-v4/ic_launcher.png"), t.resolveFilePaths(0x7f020000))
        assertEquals("@string/app_name", t.nameOf(0x7f010000).toString())
        assertEquals(0x7f020000, t.idOf("mipmap", "ic_launcher"))
    }

    /** Optional: run with -Dappfix.frameworkJar=/path/to/android.jar to test against a real platform manifest. */
    @Test
    fun `real platform manifest and resource table parse`() {
        val path = System.getProperty("appfix.frameworkJar") ?: System.getenv("APPFIX_FRAMEWORK_JAR")
        assumeTrue(path != null && File(path).isFile)
        ZipFile(path!!).use { z ->
            val manifest = z.getInputStream(z.getEntry("AndroidManifest.xml")).readBytes()
            val doc = AxmlParser.parse(manifest)
            assertEquals("android", doc.root.attr("package", null)?.rawValue)
            val again = AxmlParser.parse(AxmlWriter.write(doc))
            assertEquals(doc.root.findAll("permission").size, again.root.findAll("permission").size)
            val table = ResourceTable.parse(z.getInputStream(z.getEntry("resources.arsc")).readBytes())
            assertEquals("@attr/label", table.nameOf(0x01010001).toString())
            assertEquals("@attr/versionCode", table.nameOf(0x0101021b).toString())
            assertEquals("@attr/targetSdkVersion", table.nameOf(0x01010270).toString())
            assertEquals("@attr/compileSdkVersion", table.nameOf(0x01010572).toString())
            assertEquals("@attr/usesCleartextTraffic", table.nameOf(0x010104ec).toString())
            assertEquals("@attr/roundIcon", table.nameOf(0x0101052c).toString())
            assertEquals("@attr/extractNativeLibs", table.nameOf(0x010104ea).toString())
            assertNotNull(table.resolveString(table.idOf("string", "ok")!!))
        }
    }
}

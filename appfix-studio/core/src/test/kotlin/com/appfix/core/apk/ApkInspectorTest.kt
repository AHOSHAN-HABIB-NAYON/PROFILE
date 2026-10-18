package com.appfix.core.apk

import com.appfix.core.TestFixtures
import com.appfix.core.util.CancelToken
import com.appfix.core.util.OperationCancelledException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

class ApkInspectorTest {
    private val dir = TestFixtures.tempDir()

    @Test
    fun `inspects a synthetic apk`() {
        val apk = TestFixtures.syntheticApk(File(dir, "demo.apk"), mapOf(
            "lib/arm64-v8a/libflutter.so" to ByteArray(4), "lib/arm64-v8a/libapp.so" to ByteArray(4),
            "lib/armeabi-v7a/libflutter.so" to ByteArray(4), "assets/flutter_assets/AssetManifest.json" to "{}".toByteArray(),
        ))
        val before = apk.readBytes()
        val r = ApkInspector.inspect(apk)
        assertEquals("com.example.demo", r.manifest?.packageName)
        assertEquals("Demo App", r.label)
        assertEquals(listOf("res/mipmap-xxxhdpi-v4/ic_launcher.png"), r.iconPaths)
        assertEquals(listOf("classes.dex", "classes2.dex"), r.dexFiles)
        assertEquals(listOf("arm64-v8a", "armeabi-v7a"), r.nativeAbis)
        assertTrue(r.frameworks.any { it.id == "flutter" })
        assertTrue(r.signing.schemes.isEmpty())
        assertTrue(r.signing.note.startsWith("Unsigned"))
        assertEquals(64, r.sha256.length)
        assertEquals(1, r.resourceCounts["string"])
        assertEquals(Support.UNSUPPORTED, r.editability.first { it.title == "Change app logic" }.support)
        assertTrue("original file must be unchanged", before.contentEquals(apk.readBytes()))
    }

    @Test
    fun `non-zip file is rejected`() {
        val f = File(dir, "notes.apk").apply { writeText("this is not an apk") }
        try { ApkInspector.inspect(f); fail() } catch (e: ApkInspector.InvalidApkException) {
            assertTrue(e.message!!.contains("Not a valid APK"))
        }
    }

    @Test
    fun `zip without manifest is rejected`() {
        val f = TestFixtures.zip(File(dir, "x.apk"), mapOf("hello.txt" to "hi".toByteArray()))
        try { ApkInspector.inspect(f); fail() } catch (e: ApkInspector.InvalidApkException) {
            assertTrue(e.message!!.contains("AndroidManifest.xml is missing"))
        }
    }

    @Test
    fun `apk bundle containers are explained`() {
        val f = TestFixtures.zip(File(dir, "x.xapk"), mapOf("base.apk" to ByteArray(10), "split_config.arm64_v8a.apk" to ByteArray(10), "manifest.json" to "{}".toByteArray()))
        try { ApkInspector.inspect(f); fail() } catch (e: ApkInspector.InvalidApkException) {
            assertTrue(e.message!!, e.message!!.contains("bundle container"))
        }
    }

    @Test
    fun `corrupt manifest is reported instead of crashing`() {
        val f = TestFixtures.syntheticApk(File(dir, "bad.apk"), mapOf("AndroidManifest.xml" to ByteArray(64) { 3 }))
        val r = ApkInspector.inspect(f)
        assertNull(r.manifest)
        assertTrue(r.manifestError!!.contains("could not be decoded"))
    }

    @Test(expected = OperationCancelledException::class)
    fun `inspection honours cancellation`() {
        val apk = TestFixtures.syntheticApk(File(dir, "c.apk"))
        ApkInspector.inspect(apk, cancel = CancelToken { true })
    }

    /** CI builds sample-project and passes its APK via APPFIX_SAMPLE_APK. */
    @Test
    fun `real sample apk built by CI is valid`() {
        val path = System.getProperty("appfix.sampleApk")
        assumeTrue("Set APPFIX_SAMPLE_APK to run", path != null && File(path).isFile)
        val r = ApkInspector.inspect(File(path!!))
        assertEquals("com.appfix.sample", r.manifest?.packageName)
        assertEquals("1.0", r.manifest?.versionName)
        assertEquals(1L, r.manifest?.versionCode)
        assertEquals(24, r.manifest?.minSdk)
        assertEquals(36, r.manifest?.targetSdk)
        assertEquals("Sample Notes", r.label)
        assertEquals("com.appfix.sample.MainActivity", r.manifest?.launcherActivity)
        assertTrue(r.manifest!!.debuggable)
        assertTrue(r.dexFiles.isNotEmpty())
        assertTrue("debug APKs are v2-signed: ${r.signing.schemes}", r.signing.schemes.contains("v2"))
        assertTrue(r.signing.certificates.single().isDebugCertificate)
        assertTrue(r.frameworks.any { it.id == "kotlin" })
        assertTrue(r.frameworks.any { it.id == "views" })
        assertFalse(r.iconPaths.isEmpty())
    }
}

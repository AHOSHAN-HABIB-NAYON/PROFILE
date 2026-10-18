package com.appfix.studio

import com.appfix.core.signing.KeystoreRequest
import com.appfix.core.signing.Keystores
import com.appfix.studio.signing.ApkSignatureVerifier
import com.appfix.studio.signing.ApkSigning
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** Re-signs the sample APK built by CI (APPFIX_SAMPLE_APK) with a new release key using apksig. */
class ApkSigningTest {
    @Test
    fun `re-sign the sample apk with a new release key`() {
        val path = System.getenv("APPFIX_SAMPLE_APK")
        assumeTrue("Set APPFIX_SAMPLE_APK to run", path != null && File(path).isFile)
        val dir = Files.createTempDirectory("sign").toFile()
        val ks = File(dir, "release.p12")
        Keystores.create(KeystoreRequest("upload", "password-123".toCharArray(), "password-123".toCharArray(), "AppFix Test", "AppFix", "US", 2), ks)
        val key = Keystores.open(ks, "password-123".toCharArray())
        val out = File(dir, "signed.apk")
        ApkSigning.sign(File(path!!), out, key, minSdk = 24)
        val v = ApkSignatureVerifier.verify(out)
        assertTrue(v.errors.joinToString(), v.verified)
        assertTrue(v.v2 && v.v3)
        assertEquals(key.certificates.first().subjectX500Principal.name, v.certificates.single().subject)
        val debug = ApkSigning.debugKey(File(dir, "debug"))
        val out2 = File(dir, "debug.apk")
        ApkSigning.sign(File(path), out2, debug, minSdk = 24)
        assertTrue(ApkSignatureVerifier.verify(out2).certificates.single().isDebugCertificate)
    }

    /** Signs the APK modified by ApkModifier in the core tests (APPFIX_MODIFIED_OUT); CI then checks it with apksigner and aapt2. */
    @Test
    fun `sign the modified sample apk`() {
        val path = System.getenv("APPFIX_MODIFIED_OUT")
        assumeTrue("Set APPFIX_MODIFIED_OUT to run", path != null && File(path).isFile)
        val dir = Files.createTempDirectory("sign-mod").toFile()
        val out = System.getenv("APPFIX_SIGNED_OUT")?.let(::File) ?: File(dir, "modified-signed.apk")
        ApkSigning.sign(File(path!!), out, ApkSigning.debugKey(File(dir, "debug")), minSdk = 24)
        val v = ApkSignatureVerifier.verify(out)
        assertTrue(v.errors.joinToString(), v.verified)
    }
}

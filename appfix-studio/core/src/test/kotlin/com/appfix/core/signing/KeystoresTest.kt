package com.appfix.core.signing

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class KeystoresTest {
    private val dir = TestFixtures.tempDir()

    @Test
    fun `create and open a release keystore`() {
        val f = File(dir, "release.p12")
        Keystores.create(KeystoreRequest("upload", "store-pass".toCharArray(), "key-pass-1".toCharArray(), "Jane Doe", "Acme", "US", 25), f)
        assertEquals(listOf("upload"), Keystores.aliases(f, "store-pass".toCharArray()))
        val key = Keystores.open(f, "store-pass".toCharArray(), "upload", "key-pass-1".toCharArray())
        val cert = key.certificates.single()
        assertTrue(cert.subjectX500Principal.name, cert.subjectX500Principal.name.contains("CN=Jane Doe") && cert.subjectX500Principal.name.contains("O=Acme"))
        assertTrue(cert.notAfter.time - System.currentTimeMillis() > 24L * 365 * 24 * 3600 * 1000)
        assertEquals("RSA", key.privateKey.algorithm)
        // Signature round trip with the key.
        val sig = java.security.Signature.getInstance("SHA256withRSA").apply { initSign(key.privateKey); update("hello".toByteArray()) }.sign()
        assertTrue(java.security.Signature.getInstance("SHA256withRSA").apply { initVerify(cert); update("hello".toByteArray()) }.verify(sig))
    }

    @Test
    fun `never overwrites and rejects bad input`() {
        val f = File(dir, "k.p12")
        Keystores.create(KeystoreRequest("a", "12345678".toCharArray(), "12345678".toCharArray(), "X"), f)
        val before = f.readBytes()
        try { Keystores.create(KeystoreRequest("a", "12345678".toCharArray(), "12345678".toCharArray(), "X"), f); fail() } catch (e: KeystoreException) {}
        assertTrue(before.contentEquals(f.readBytes()))
        try { Keystores.create(KeystoreRequest("a", "short".toCharArray(), "short".toCharArray(), "X"), File(dir, "n.p12")); fail() } catch (e: KeystoreException) {}
        try { Keystores.open(f, "wrong-password".toCharArray()); fail() } catch (e: KeystoreException) { assertTrue(e.message!!.contains("password")) }
        try { Keystores.open(f, "12345678".toCharArray(), "a", "bad-key-pass".toCharArray()); fail() } catch (e: KeystoreException) { assertTrue(e.message!!.contains("password")) }
        val jks = File(dir, "old.jks").apply { writeBytes(byteArrayOf(0xFE.toByte(), 0xED.toByte(), 0xFE.toByte(), 0xED.toByte(), 0, 0, 0, 2)) }
        try { Keystores.open(jks, "x".toCharArray()); fail() } catch (e: KeystoreException) { assertTrue(e.message!!.contains("legacy JKS")) }
    }
}

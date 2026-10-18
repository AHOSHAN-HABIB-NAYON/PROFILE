package com.appfix.core.signing

import org.bouncycastle.asn1.x500.X500NameBuilder
import org.bouncycastle.asn1.x500.style.BCStyle
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.io.File
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.Date

class KeystoreException(message: String, cause: Throwable? = null) : Exception(message, cause)

data class SigningKey(val alias: String, val privateKey: PrivateKey, val certificates: List<X509Certificate>)

data class KeystoreRequest(
    val alias: String,
    val storePassword: CharArray,
    val keyPassword: CharArray,
    val commonName: String,
    val organization: String = "",
    val country: String = "",
    val validityYears: Int = 30,
)

/**
 * Creates and opens PKCS12 keystores. Passwords are passed as char arrays and never logged.
 * JKS (the legacy Java format) is not supported on Android; such keystores must be converted with
 * `keytool -importkeystore -deststoretype pkcs12`.
 */
object Keystores {
    fun create(req: KeystoreRequest, target: File) {
        if (target.exists()) throw KeystoreException("A keystore already exists at ${target.name}; it is never overwritten.")
        if (!req.alias.matches(Regex("[A-Za-z0-9_.-]{1,64}"))) throw KeystoreException("The alias may contain letters, digits, '.', '_' and '-'.")
        if (req.storePassword.size < 8 || req.keyPassword.size < 8) throw KeystoreException("Passwords must have at least 8 characters.")
        if (req.commonName.isBlank()) throw KeystoreException("Enter a name for the certificate (for example your name or company).")
        if (req.validityYears !in 1..100) throw KeystoreException("Validity must be between 1 and 100 years.")
        if (req.country.isNotEmpty() && !req.country.matches(Regex("[A-Za-z]{2}"))) throw KeystoreException("Country must be a two-letter code such as US.")
        val gen = KeyPairGenerator.getInstance("RSA").apply { initialize(3072, SecureRandom()) }
        val pair = gen.generateKeyPair()
        val name = X500NameBuilder(BCStyle.INSTANCE).apply {
            addRDN(BCStyle.CN, req.commonName.trim())
            if (req.organization.isNotBlank()) addRDN(BCStyle.O, req.organization.trim())
            if (req.country.isNotBlank()) addRDN(BCStyle.C, req.country.uppercase())
        }.build()
        val now = System.currentTimeMillis()
        val notBefore = Date(now - 24L * 3600 * 1000)
        val notAfter = Date(now + req.validityYears * 365L * 24 * 3600 * 1000)
        val serial = BigInteger(64, SecureRandom())
        val builder = JcaX509v3CertificateBuilder(name, serial, notBefore, notAfter, name, pair.public)
        val signer = JcaContentSignerBuilder("SHA256withRSA").build(pair.private)
        val cert = JcaX509CertificateConverter().getCertificate(builder.build(signer))
        val ks = KeyStore.getInstance("PKCS12")
        ks.load(null, null)
        ks.setKeyEntry(req.alias, pair.private, req.keyPassword, arrayOf(cert))
        target.parentFile?.mkdirs()
        val tmp = File(target.parentFile, ".${target.name}.tmp")
        tmp.outputStream().use { ks.store(it, req.storePassword) }
        if (!tmp.renameTo(target)) { tmp.delete(); throw KeystoreException("Could not save the keystore") }
    }

    fun aliases(file: File, storePassword: CharArray): List<String> = load(file, storePassword).let { ks -> ks.aliases().toList().filter { ks.isKeyEntry(it) } }

    fun open(file: File, storePassword: CharArray, alias: String? = null, keyPassword: CharArray = storePassword): SigningKey {
        val ks = load(file, storePassword)
        val a = alias ?: ks.aliases().toList().firstOrNull { ks.isKeyEntry(it) } ?: throw KeystoreException("The keystore contains no private key.")
        val key = try {
            ks.getKey(a, keyPassword) as? PrivateKey
        } catch (e: java.security.UnrecoverableKeyException) {
            throw KeystoreException("The key password is wrong.", e)
        } ?: throw KeystoreException("No private key named \"$a\".")
        val chain = ks.getCertificateChain(a)?.filterIsInstance<X509Certificate>().orEmpty()
        if (chain.isEmpty()) throw KeystoreException("The key \"$a\" has no certificate.")
        return SigningKey(a, key, chain)
    }

    private fun load(file: File, storePassword: CharArray): KeyStore {
        val head = file.inputStream().use { it.readNBytes4() }
        if (head.contentEquals(byteArrayOf(0xFE.toByte(), 0xED.toByte(), 0xFE.toByte(), 0xED.toByte()))) {
            throw KeystoreException("This is a legacy JKS keystore, which Android cannot read. Convert it on a computer with: keytool -importkeystore -srckeystore old.jks -destkeystore new.p12 -deststoretype pkcs12")
        }
        val ks = KeyStore.getInstance("PKCS12")
        try {
            file.inputStream().use { ks.load(it, storePassword) }
        } catch (e: java.io.IOException) {
            throw KeystoreException(if (e.cause is java.security.UnrecoverableKeyException || e.message?.contains("password", true) == true) "The keystore password is wrong." else "The keystore could not be read: ${e.message}", e)
        }
        return ks
    }

    private fun java.io.InputStream.readNBytes4(): ByteArray {
        val b = ByteArray(4)
        var n = 0
        while (n < 4) { val r = read(b, n, 4 - n); if (r < 0) break; n += r }
        return b
    }
}

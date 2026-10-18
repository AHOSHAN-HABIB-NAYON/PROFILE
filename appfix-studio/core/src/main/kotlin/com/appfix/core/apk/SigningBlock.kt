package com.appfix.core.apk

import com.appfix.core.archive.ZipCentralDirectory
import com.appfix.core.util.toHex
import java.io.ByteArrayInputStream
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/**
 * Detects which APK signature schemes are present and extracts signer certificates.
 * This is *inspection only* — it does not verify digests. Cryptographic verification is done on
 * Android with the official apksig library (see the app module).
 */
object SigningBlockInspector {
    const val V2_ID = 0x7109871a
    const val V3_ID = 0xf05368c0.toInt()
    const val V31_ID = 0x1b93ad61
    const val SOURCE_STAMP_V2_ID = 0x6dff800d
    const val PADDING_ID = 0x42726577
    const val DEPENDENCY_INFO_ID = 0x504b4453
    const val PLAY_FROSTING_ID = 0x2146444e
    private val MAGIC = "APK Sig Block 42".toByteArray(Charsets.US_ASCII)

    data class SignerCertificate(
        val subject: String,
        val issuer: String,
        val sha256: String,
        val notBefore: Long,
        val notAfter: Long,
        val publicKeyAlgorithm: String,
        val isDebugCertificate: Boolean,
    )

    data class SigningInfo(
        val hasV1: Boolean,
        val hasV2: Boolean,
        val hasV3: Boolean,
        val hasV31: Boolean,
        val hasSourceStamp: Boolean,
        val blockIds: List<Int>,
        val certificates: List<SignerCertificate>,
        val v1SignatureFiles: List<String>,
    ) {
        val isSigned: Boolean get() = hasV1 || hasV2 || hasV3 || hasV31
        val schemes: List<String> get() = buildList {
            if (hasV1) add("v1 (JAR)")
            if (hasV2) add("v2")
            if (hasV3) add("v3")
            if (hasV31) add("v3.1")
        }
    }

    fun inspect(file: File, cd: ZipCentralDirectory): SigningInfo {
        val v1Files = cd.entries.map { it.name }.filter {
            it.startsWith("META-INF/") && it.count { c -> c == '/' } == 1 &&
                (it.endsWith(".RSA", true) || it.endsWith(".DSA", true) || it.endsWith(".EC", true))
        }
        val hasSf = cd.entries.any { it.name.startsWith("META-INF/") && it.name.endsWith(".SF", true) }
        val pairs = readSigningBlock(file, cd.centralDirectoryOffset)
        val ids = pairs.map { it.first }
        val certs = mutableListOf<SignerCertificate>()
        val primary = pairs.firstOrNull { it.first == V3_ID } ?: pairs.firstOrNull { it.first == V2_ID }
        if (primary != null) runCatching { certs += parseV2V3Certificates(primary.second) }
        if (certs.isEmpty() && v1Files.isNotEmpty()) {
            runCatching {
                java.util.zip.ZipFile(file).use { zf ->
                    val entry = zf.getEntry(v1Files.first())
                    if (entry != null && entry.size in 1..(1024 * 1024)) {
                        val bytes = zf.getInputStream(entry).use { it.readBytes() }
                        val cf = CertificateFactory.getInstance("X.509")
                        cf.generateCertificates(ByteArrayInputStream(bytes)).filterIsInstance<X509Certificate>().forEach { certs += describe(it) }
                    }
                }
            }
        }
        return SigningInfo(
            hasV1 = v1Files.isNotEmpty() && hasSf,
            hasV2 = V2_ID in ids, hasV3 = V3_ID in ids, hasV31 = V31_ID in ids,
            hasSourceStamp = SOURCE_STAMP_V2_ID in ids,
            blockIds = ids, certificates = certs.distinctBy { it.sha256 }, v1SignatureFiles = v1Files,
        )
    }

    /** Returns (id, value) pairs from the APK Signing Block, or empty if there is none. */
    fun readSigningBlock(file: File, centralDirectoryOffset: Long): List<Pair<Int, ByteArray>> {
        if (centralDirectoryOffset < 32) return emptyList()
        RandomAccessFile(file, "r").use { raf ->
            val footer = ByteArray(24)
            raf.seek(centralDirectoryOffset - 24)
            raf.readFully(footer)
            if (!footer.copyOfRange(8, 24).contentEquals(MAGIC)) return emptyList()
            val sizeInFooter = ZipCentralDirectory.le64(footer, 0)
            if (sizeInFooter < 24 || sizeInFooter > 64L * 1024 * 1024) return emptyList()
            val blockStart = centralDirectoryOffset - sizeInFooter - 8
            if (blockStart < 0) return emptyList()
            val block = ByteArray((sizeInFooter + 8).toInt())
            raf.seek(blockStart)
            raf.readFully(block)
            if (ZipCentralDirectory.le64(block, 0) != sizeInFooter) return emptyList()
            val out = mutableListOf<Pair<Int, ByteArray>>()
            var p = 8
            val end = block.size - 24
            while (p + 12 <= end) {
                val len = ZipCentralDirectory.le64(block, p)
                if (len < 4 || p + 8 + len > end) break
                val id = ZipCentralDirectory.le32(block, p + 8).toInt()
                out += id to block.copyOfRange(p + 12, (p + 8 + len).toInt())
                p += (8 + len).toInt()
            }
            return out
        }
    }

    private fun parseV2V3Certificates(value: ByteArray): List<SignerCertificate> {
        val cf = CertificateFactory.getInstance("X.509")
        val result = mutableListOf<SignerCertificate>()
        val signers = LengthPrefixed(value, 0, value.size).sequence()
        for (signer in signers) {
            val parts = signer.sequenceOfFields()
            val signedData = parts.getOrNull(0) ?: continue
            val sd = signedData.sequenceOfFields()
            // signed data: digests, certificates, additional attributes (v3 adds min/max SDK ints).
            val certSeq = sd.getOrNull(1) ?: continue
            for (cert in certSeq.items()) {
                val x = cf.generateCertificate(ByteArrayInputStream(cert.bytes())) as X509Certificate
                result += describe(x)
            }
        }
        return result
    }

    fun describe(x: X509Certificate): SignerCertificate {
        val subject = x.subjectX500Principal.name
        return SignerCertificate(
            subject = subject,
            issuer = x.issuerX500Principal.name,
            sha256 = MessageDigest.getInstance("SHA-256").digest(x.encoded).toHex(),
            notBefore = x.notBefore.time,
            notAfter = x.notAfter.time,
            publicKeyAlgorithm = x.publicKey.algorithm,
            isDebugCertificate = subject.contains("CN=Android Debug", ignoreCase = true),
        )
    }

    /** Helper for the uint32-length-prefixed structures used by APK Signature Scheme v2/v3. */
    private class LengthPrefixed(val data: ByteArray, val start: Int, val end: Int) {
        fun bytes(): ByteArray = data.copyOfRange(start, end)

        /** Treats this region as a uint32 length-prefixed sequence of length-prefixed items. */
        fun sequence(): List<LengthPrefixed> {
            val outerLen = ZipCentralDirectory.le32(data, start).toInt()
            return LengthPrefixed(data, start + 4, minOf(end, start + 4 + outerLen)).items()
        }

        fun items(): List<LengthPrefixed> {
            val out = mutableListOf<LengthPrefixed>()
            var p = start
            while (p + 4 <= end) {
                val len = ZipCentralDirectory.le32(data, p).toInt()
                if (len < 0 || p + 4 + len > end) break
                out += LengthPrefixed(data, p + 4, p + 4 + len)
                p += 4 + len
            }
            return out
        }

        /** Signer/signed-data records are themselves a list of length-prefixed fields. */
        fun sequenceOfFields(): List<LengthPrefixed> = items()
    }
}

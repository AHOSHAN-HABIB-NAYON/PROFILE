package com.appfix.studio.signing

import com.android.apksig.ApkVerifier
import com.appfix.core.apk.SigningBlockInspector
import java.io.File

data class SignatureVerification(
    val verified: Boolean,
    val v1: Boolean,
    val v2: Boolean,
    val v3: Boolean,
    val certificates: List<SigningBlockInspector.SignerCertificate>,
    val errors: List<String>,
    val warnings: List<String>,
)

/** Cryptographic APK signature verification using Google's apksig library (the code behind apksigner). */
object ApkSignatureVerifier {
    fun verify(apk: File): SignatureVerification = try {
        val result = ApkVerifier.Builder(apk).build().verify()
        SignatureVerification(
            verified = result.isVerified,
            v1 = result.isVerifiedUsingV1Scheme,
            v2 = result.isVerifiedUsingV2Scheme,
            v3 = result.isVerifiedUsingV3Scheme,
            certificates = result.signerCertificates.map { SigningBlockInspector.describe(it) },
            errors = result.errors.map { it.toString() },
            warnings = result.warnings.map { it.toString() },
        )
    } catch (e: Exception) {
        SignatureVerification(false, false, false, false, emptyList(), listOf("Verification failed: ${e.message ?: e.javaClass.simpleName}"), emptyList())
    }
}

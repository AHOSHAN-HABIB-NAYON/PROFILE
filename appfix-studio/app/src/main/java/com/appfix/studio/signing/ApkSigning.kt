package com.appfix.studio.signing

import com.android.apksig.ApkSigner
import com.appfix.core.signing.KeystoreRequest
import com.appfix.core.signing.Keystores
import com.appfix.core.signing.SigningKey
import java.io.File

/** Signs APKs on the device with Google's apksig (v1 when needed, v2 and v3). */
object ApkSigning {
    fun sign(input: File, output: File, key: SigningKey, minSdk: Int) {
        output.parentFile?.mkdirs()
        val tmp = File(output.parentFile, output.name + ".signing")
        tmp.delete()
        val config = ApkSigner.SignerConfig.Builder("CERT", key.privateKey, key.certificates).build()
        ApkSigner.Builder(listOf(config))
            .setInputApk(input)
            .setOutputApk(tmp)
            .setMinSdkVersion(minSdk)
            .setV1SigningEnabled(minSdk < 24)
            .setV2SigningEnabled(true)
            .setV3SigningEnabled(true)
            .setCreatedBy("AppFix Studio")
            .build()
            .sign()
        val result = ApkSignatureVerifier.verify(tmp)
        if (!result.verified) {
            tmp.delete()
            throw IllegalStateException("Signing produced an APK that does not verify: ${result.errors.joinToString()}")
        }
        if (output.exists()) output.delete()
        if (!tmp.renameTo(output)) throw IllegalStateException("Could not save the signed APK")
    }

    /** App-private debug key (CN=Android Debug) created on first use. For testing only. */
    fun debugKey(dir: File): SigningKey {
        val file = File(dir, "appfix-debug.p12")
        // The debug key protects nothing of value, so a fixed password is acceptable (like Android Studio's).
        val pass = "android-debug"
        if (!file.isFile) Keystores.create(KeystoreRequest("androiddebugkey", pass.toCharArray(), pass.toCharArray(), "Android Debug", "AppFix Studio", "US", 30), file)
        return Keystores.open(file, pass.toCharArray(), "androiddebugkey", pass.toCharArray())
    }
}

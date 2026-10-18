package com.appfix.core.apk

import kotlinx.serialization.Serializable

@Serializable
data class ApkReport(
    val fileName: String,
    val sizeBytes: Long,
    val sha256: String,
    val entryCount: Int,
    val manifest: ManifestSummary?,
    val manifestError: String? = null,
    val decodedManifestXml: String? = null,
    val label: String? = null,
    val iconPaths: List<String> = emptyList(),
    val resourceTableError: String? = null,
    val resourceCounts: Map<String, Int> = emptyMap(),
    val dexFiles: List<String> = emptyList(),
    val nativeAbis: List<String> = emptyList(),
    val nativeLibraries: List<String> = emptyList(),
    val frameworks: List<FrameworkHint> = emptyList(),
    val signing: SigningSummary,
    val isSplitApk: Boolean = false,
    val isBundleContainer: Boolean = false,
    val containsEncryptedEntries: Boolean = false,
    val largestEntries: List<EntrySize> = emptyList(),
    val editability: List<Capability> = emptyList(),
    val warnings: List<String> = emptyList(),
)

@Serializable
data class EntrySize(val name: String, val size: Long)

@Serializable
data class ManifestSummary(
    val packageName: String?,
    val versionCode: Long?,
    val versionName: String?,
    val minSdk: Int?,
    val targetSdk: Int?,
    val compileSdk: Int?,
    val debuggable: Boolean,
    val testOnly: Boolean,
    val allowBackup: Boolean?,
    val usesCleartextTraffic: Boolean?,
    val splitName: String?,
    val permissions: List<String>,
    val features: List<String>,
    val activities: List<Component>,
    val services: List<Component>,
    val receivers: List<Component>,
    val providers: List<Component>,
    val launcherActivity: String?,
    val applicationClass: String?,
)

@Serializable
data class Component(val name: String, val exported: Boolean?, val hasIntentFilter: Boolean, val permission: String? = null)

@Serializable
data class FrameworkHint(val id: String, val displayName: String, val evidence: String)

@Serializable
data class SigningSummary(
    val schemes: List<String>,
    val certificates: List<CertificateSummary>,
    val hasSourceStamp: Boolean,
    val blockIds: List<String>,
    val note: String,
)

@Serializable
data class CertificateSummary(
    val subject: String,
    val issuer: String,
    val sha256: String,
    val notBefore: Long,
    val notAfter: Long,
    val publicKeyAlgorithm: String,
    val isDebugCertificate: Boolean,
)

@Serializable
enum class Support { SUPPORTED, LIMITED, UNSUPPORTED }

@Serializable
data class Capability(val title: String, val support: Support, val explanation: String)

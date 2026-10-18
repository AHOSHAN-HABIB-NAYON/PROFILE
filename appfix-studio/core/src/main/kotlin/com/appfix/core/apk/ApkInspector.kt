package com.appfix.core.apk

import com.appfix.core.archive.InvalidArchiveException
import com.appfix.core.archive.ZipCentralDirectory
import com.appfix.core.util.CancelToken
import com.appfix.core.util.Hashing
import java.io.File
import java.util.zip.ZipFile

/**
 * Static inspection of an APK file. The file is opened read-only and never modified.
 */
object ApkInspector {
    private const val MAX_MANIFEST_BYTES = 16L * 1024 * 1024
    private const val MAX_ARSC_BYTES = 128L * 1024 * 1024

    class InvalidApkException(message: String) : RuntimeException(message)

    fun inspect(file: File, displayName: String = file.name, cancel: CancelToken = CancelToken.NONE, knownSha256: String? = null): ApkReport {
        if (!file.isFile) throw InvalidApkException("File not found")
        val sha = knownSha256 ?: Hashing.sha256(file, cancel)
        val cd = try {
            ZipCentralDirectory.read(file)
        } catch (e: InvalidArchiveException) {
            throw InvalidApkException("Not a valid APK: ${e.message}")
        }
        val names = cd.entries.map { it.name }
        val warnings = mutableListOf<String>()
        val nameSet = names.toHashSet()

        val nestedApks = names.filter { it.endsWith(".apk", true) && !it.contains('/') }
        if ("AndroidManifest.xml" !in nameSet) {
            if (nestedApks.isNotEmpty() || "manifest.json" in nameSet || "toc.pb" in nameSet) {
                throw InvalidApkException(
                    "This is an APK bundle container (XAPK/APKS/APKM) with ${nestedApks.size} split APKs, not a single APK. " +
                        "Extract it and import the base APK instead.",
                )
            }
            if ("BundleConfig.pb" in nameSet || names.any { it.startsWith("base/manifest/") }) {
                throw InvalidApkException("This is an Android App Bundle (AAB). AABs cannot be installed directly; use bundletool to generate APKs.")
            }
            throw InvalidApkException("Not a valid APK: AndroidManifest.xml is missing")
        }
        cancel.throwIfCancelled()

        var manifest: ManifestSummary? = null
        var manifestError: String? = null
        var decodedXml: String? = null
        var label: String? = null
        var iconPaths = emptyList<String>()
        var arscError: String? = null
        var resourceCounts = emptyMap<String, Int>()
        var table: ResourceTable? = null
        var labelAttr: AxmlAttribute? = null
        var iconAttr: AxmlAttribute? = null

        ZipFile(file).use { zip ->
            fun readEntry(name: String, limit: Long): ByteArray? {
                val e = zip.getEntry(name) ?: return null
                if (e.size > limit) throw InvalidApkException("$name is unexpectedly large (${e.size} bytes)")
                return zip.getInputStream(e).use { input ->
                    val out = java.io.ByteArrayOutputStream()
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        cancel.throwIfCancelled()
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > limit) throw InvalidApkException("$name exceeds the $limit-byte safety limit")
                        out.write(buf, 0, n)
                    }
                    out.toByteArray()
                }
            }
            try {
                val bytes = readEntry("AndroidManifest.xml", MAX_MANIFEST_BYTES)!!
                val doc = AxmlParser.parse(bytes)
                decodedXml = doc.toXmlString()
                manifest = summarize(doc)
                val app = doc.root.childrenNamed("application").firstOrNull()
                labelAttr = app?.attr("label")
                iconAttr = app?.attr("icon")
            } catch (e: BinaryFormatException) {
                manifestError = "AndroidManifest.xml could not be decoded: ${e.message}"
            }
            try {
                val arsc = readEntry("resources.arsc", MAX_ARSC_BYTES)
                if (arsc != null) {
                    val t = ResourceTable.parse(arsc)
                    table = t
                    resourceCounts = t.namesByType().mapValues { it.value.size }
                } else {
                    warnings += "No resources.arsc: the APK has no compiled resource table."
                }
            } catch (e: BinaryFormatException) {
                arscError = "resources.arsc could not be decoded: ${e.message}"
            }
        }
        labelAttr?.let { a -> label = a.rawValue ?: if (a.isReference) table?.resolveString(a.data) else null }
        iconAttr?.let { a -> if (a.isReference) iconPaths = table?.resolveFilePaths(a.data).orEmpty() }
        if (manifestError == null && manifest != null && labelAttr == null) warnings += "The <application> element has no android:label."

        val dex = names.filter { it.matches(Regex("classes\\d*\\.dex")) }.sortedWith(compareBy({ it.length }, { it }))
        val nativeLibs = names.filter { it.startsWith("lib/") && it.endsWith(".so") }
        val abis = nativeLibs.mapNotNull { it.split('/').getOrNull(1) }.distinct().sorted()
        val signing = SigningBlockInspector.inspect(file, cd)
        val frameworks = detectFrameworks(nameSet, nativeLibs)
        val encrypted = cd.entries.any { it.isEncrypted }
        if (encrypted) warnings += "Some entries are encrypted; they cannot be inspected or rebuilt."
        if (dex.isEmpty()) warnings += "No classes.dex found: this APK has no Java/Kotlin bytecode (resource-only or split APK)."
        val m = manifest
        val isSplit = m?.splitName != null
        if (isSplit) warnings += "This is a split APK (${m?.splitName}); it cannot be installed on its own."

        val report = ApkReport(
            fileName = displayName,
            sizeBytes = file.length(),
            sha256 = sha,
            entryCount = names.size,
            manifest = m,
            manifestError = manifestError,
            decodedManifestXml = decodedXml,
            label = label,
            iconPaths = iconPaths,
            resourceTableError = arscError,
            resourceCounts = resourceCounts,
            dexFiles = dex,
            nativeAbis = abis,
            nativeLibraries = nativeLibs.map { it.substringAfterLast('/') }.distinct().sorted(),
            frameworks = frameworks,
            signing = summarizeSigning(signing),
            isSplitApk = isSplit,
            isBundleContainer = false,
            containsEncryptedEntries = encrypted,
            largestEntries = cd.entries.filter { !it.isDirectory }.sortedByDescending { it.uncompressedSize }.take(8).map { EntrySize(it.name, it.uncompressedSize) },
            warnings = warnings,
        )
        return report.copy(editability = editability(report))
    }

    fun summarize(doc: AxmlDocument): ManifestSummary {
        val root = doc.root
        val usesSdk = root.childrenNamed("uses-sdk").firstOrNull()
        val app = root.childrenNamed("application").firstOrNull()
        fun components(tag: String) = app?.childrenNamed(tag).orEmpty().map { c ->
            Component(
                name = qualify(root.attr("package", null)?.rawValue, c.androidValue("name").orEmpty()),
                exported = c.attr("exported")?.booleanValue(),
                hasIntentFilter = c.childrenNamed("intent-filter").isNotEmpty(),
                permission = c.androidValue("permission"),
            )
        }
        val pkg = root.attr("package", null)?.rawValue
        val activities = components("activity") + app?.childrenNamed("activity-alias").orEmpty().map { c ->
            Component(qualify(pkg, c.androidValue("name").orEmpty()), c.attr("exported")?.booleanValue(), c.childrenNamed("intent-filter").isNotEmpty())
        }
        val launcher = (app?.childrenNamed("activity").orEmpty() + app?.childrenNamed("activity-alias").orEmpty()).firstOrNull { a ->
            a.childrenNamed("intent-filter").any { f ->
                f.childrenNamed("action").any { it.androidValue("name") == "android.intent.action.MAIN" } &&
                    f.childrenNamed("category").any { it.androidValue("name") == "android.intent.category.LAUNCHER" }
            }
        }?.let { qualify(pkg, it.androidValue("name").orEmpty()) }
        return ManifestSummary(
            packageName = pkg,
            versionCode = root.attr("versionCode")?.intValue()?.toLong()?.and(0xffffffffL),
            versionName = root.attr("versionName")?.displayValue(),
            minSdk = usesSdk?.attr("minSdkVersion")?.intValue(),
            targetSdk = usesSdk?.attr("targetSdkVersion")?.intValue(),
            compileSdk = root.attr("compileSdkVersion")?.intValue(),
            debuggable = app?.attr("debuggable")?.booleanValue() == true,
            testOnly = app?.attr("testOnly")?.booleanValue() == true,
            allowBackup = app?.attr("allowBackup")?.booleanValue(),
            usesCleartextTraffic = app?.attr("usesCleartextTraffic")?.booleanValue(),
            splitName = root.attr("split", null)?.rawValue,
            permissions = (root.childrenNamed("uses-permission") + root.childrenNamed("uses-permission-sdk-23"))
                .mapNotNull { it.androidValue("name") }.distinct(),
            features = root.childrenNamed("uses-feature").mapNotNull { it.androidValue("name") },
            activities = activities,
            services = components("service"),
            receivers = components("receiver"),
            providers = components("provider"),
            launcherActivity = launcher,
            applicationClass = app?.androidValue("name")?.let { qualify(pkg, it) },
        )
    }

    private fun qualify(pkg: String?, name: String): String =
        if (name.startsWith(".") && pkg != null) pkg + name else if (!name.contains('.') && pkg != null && name.isNotEmpty()) "$pkg.$name" else name

    fun detectFrameworks(names: Set<String>, nativeLibs: List<String>): List<FrameworkHint> {
        val libNames = nativeLibs.map { it.substringAfterLast('/') }.toSet()
        val hints = mutableListOf<FrameworkHint>()
        if ("libflutter.so" in libNames || names.any { it.startsWith("assets/flutter_assets/") }) {
            hints += FrameworkHint("flutter", "Flutter", if ("libapp.so" in libNames) "libflutter.so + compiled Dart (libapp.so)" else "flutter_assets / libflutter.so")
        }
        if ("assets/index.android.bundle" in names || "libreactnativejni.so" in libNames || "libreactnative.so" in libNames) {
            hints += FrameworkHint("react-native", "React Native", if ("libhermes.so" in libNames) "JS bundle with Hermes engine" else "index.android.bundle")
        }
        if ("libunity.so" in libNames || "libil2cpp.so" in libNames) hints += FrameworkHint("unity", "Unity", if ("libil2cpp.so" in libNames) "IL2CPP native code" else "libunity.so")
        if (names.any { it.startsWith("assemblies/") } || "libmonodroid.so" in libNames) hints += FrameworkHint("xamarin", "Xamarin / .NET MAUI", "Mono assemblies")
        if (names.any { it.startsWith("assets/public/") } && names.any { it.contains("capacitor") }) hints += FrameworkHint("capacitor", "Capacitor", "assets/public web bundle")
        else if (names.any { it.startsWith("assets/www/") }) hints += FrameworkHint("cordova", "Cordova / web wrapper", "assets/www web bundle")
        if (names.any { it.startsWith("kotlin/") || it.endsWith(".kotlin_module") || it.endsWith(".kotlin_builtins") }) hints += FrameworkHint("kotlin", "Kotlin", "Kotlin metadata files")
        if (names.any { it.startsWith("META-INF/androidx.compose") }) hints += FrameworkHint("compose", "Jetpack Compose", "androidx.compose version files")
        if (names.any { it.startsWith("res/layout") }) hints += FrameworkHint("views", "Android Views (XML layouts)", "compiled res/layout files")
        return hints
    }

    private fun summarizeSigning(s: SigningBlockInspector.SigningInfo): SigningSummary {
        val note = when {
            !s.isSigned -> "Unsigned: Android will refuse to install this APK until it is signed."
            s.certificates.any { it.isDebugCertificate } -> "Signed with a debug certificate. Fine for testing; not accepted by Google Play."
            else -> "Signature blocks found. Cryptographic verification runs on-device with apksig."
        }
        return SigningSummary(
            schemes = s.schemes,
            certificates = s.certificates.map { CertificateSummary(it.subject, it.issuer, it.sha256, it.notBefore, it.notAfter, it.publicKeyAlgorithm, it.isDebugCertificate) },
            hasSourceStamp = s.hasSourceStamp,
            blockIds = s.blockIds.map { blockName(it) },
            note = note,
        )
    }

    private fun blockName(id: Int) = when (id) {
        SigningBlockInspector.V2_ID -> "v2 signature"
        SigningBlockInspector.V3_ID -> "v3 signature"
        SigningBlockInspector.V31_ID -> "v3.1 signature"
        SigningBlockInspector.SOURCE_STAMP_V2_ID -> "source stamp"
        SigningBlockInspector.PADDING_ID -> "padding"
        SigningBlockInspector.DEPENDENCY_INFO_ID -> "dependency info"
        SigningBlockInspector.PLAY_FROSTING_ID -> "Play metadata"
        else -> "0x%08x".format(id)
    }

    /** Plain-language explanation of what AppFix Studio can and cannot do with this APK. */
    fun editability(r: ApkReport): List<Capability> {
        val ids = r.frameworks.map { it.id }.toSet()
        val caps = mutableListOf<Capability>()
        caps += Capability("Inspect manifest, permissions and components",
            if (r.manifest != null) Support.SUPPORTED else Support.UNSUPPORTED,
            if (r.manifest != null) "Decoded from the binary AndroidManifest.xml." else r.manifestError ?: "Manifest unavailable.")
        caps += Capability("Change app name, version name/code",
            if (r.manifest != null && !r.isSplitApk) Support.LIMITED else Support.UNSUPPORTED,
            "Possible by editing the binary manifest and re-signing. The re-signed APK has a different signature, so it cannot update an installed copy signed with the original key.")
        caps += Capability("Replace icon and image resources",
            if (r.resourceTableError == null && r.resourceCounts.isNotEmpty()) Support.LIMITED else Support.UNSUPPORTED,
            "Same-name PNG/WebP files can be swapped and the APK re-signed. Adding new resources requires recompiling resources (Apktool/aapt2 on a build worker).")
        caps += Capability("Edit layouts, strings and themes",
            Support.LIMITED,
            "Compiled resources must be decoded and re-encoded with Apktool on a build worker. Not available on-device.")
        val codeSupport = when {
            "flutter" in ids || "react-native" in ids || "unity" in ids || "xamarin" in ids -> Support.UNSUPPORTED
            r.dexFiles.isEmpty() -> Support.UNSUPPORTED
            else -> Support.LIMITED
        }
        caps += Capability("Change app logic", codeSupport, when {
            "flutter" in ids -> "App logic is compiled Dart in libapp.so. It cannot be meaningfully edited; use the original Flutter source project."
            "react-native" in ids -> "Logic lives in the JavaScript bundle (often Hermes bytecode). Use the original React Native project."
            "unity" in ids -> "Unity game logic is compiled native/IL2CPP code. Use the original Unity project."
            "xamarin" in ids -> ".NET assemblies need a separate toolchain. Use the original project."
            r.dexFiles.isEmpty() -> "There is no DEX bytecode in this APK."
            else -> "Only via Smali (Dalvik bytecode) on a build worker with Apktool. Decompiled Java from JADX is for reading, not a rebuildable project. Use the original source project whenever possible."
        })
        caps += Capability("Re-sign and install", if (r.isSplitApk) Support.UNSUPPORTED else Support.SUPPORTED,
            "Any modified APK must be re-signed with your own key (debug or release). Apps with signature or integrity checks may refuse to run after re-signing.")
        if (r.containsEncryptedEntries) caps += Capability("Encrypted entries", Support.UNSUPPORTED, "Encrypted archive entries cannot be modified.")
        return caps
    }
}

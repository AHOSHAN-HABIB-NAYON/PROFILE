package com.appfix.core.analysis

import kotlinx.serialization.Serializable
import java.io.File

@Serializable
data class StackFrame(val className: String, val method: String, val fileName: String?, val line: Int?, val isNative: Boolean = false) {
    val display: String get() = "$className.$method(${fileName ?: if (isNative) "Native Method" else "Unknown Source"}${line?.let { ":$it" } ?: ""})"
}

@Serializable
data class ExceptionInfo(val type: String, val message: String?, val frames: List<StackFrame>)

@Serializable
data class SourceLocation(val path: String, val line: Int?)

@Serializable
data class CrashReport(
    val kind: String,
    val chain: List<ExceptionInfo>,
    val processName: String?,
    val rootCause: ExceptionInfo?,
    val appFrame: StackFrame?,
    val appFrameSource: SourceLocation?,
    val summary: String,
    val explanation: String,
    val suggestions: List<String>,
    val findings: List<Finding>,
)

/**
 * Parses Java/Kotlin stack traces from logcat output or crash reports and explains common causes.
 * Explanations are educated guesses from the exception type and message, labelled as such.
 */
object CrashLogAnalyzer {
    private val logcatPrefixes = listOf(
        Regex("""^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+[VDIWEFA]\s+[^:]*:\s?"""), // threadtime
        Regex("""^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+-\d+\s+\S+\s+[VDIWEFA]/[^:]*:\s?"""), // Android Studio
        Regex("""^[VDIWEFA]/[^(:]+\(\s*\d+\):\s?"""), // brief
        Regex("""^[VDIWEFA]/[^:]+:\s?"""),
    )
    private val frameRegex = Regex("""^\s*at\s+([\w$.<>\-]+)\.([\w$<>\-]+)\(([^)]*)\)""")
    private val exceptionRegex = Regex("""^(?:Caused by:\s+|Exception in thread "[^"]*"\s+)?([a-zA-Z_][\w$]*(?:\.[\w$]+)+)(?::\s?(.*))?$""")
    private val frameworkPackages = listOf("android.", "androidx.", "java.", "javax.", "kotlin.", "kotlinx.", "dalvik.", "com.android.", "sun.", "libcore.", "jdk.", "com.google.android.material.", "com.google.android.gms.", "okhttp3.", "retrofit2.", "org.jetbrains.")

    fun clean(raw: String): List<String> = raw.lines().map { line ->
        var l = line.trimEnd()
        for (p in logcatPrefixes) {
            val m = p.find(l)
            if (m != null) { l = l.substring(m.range.last + 1); break }
        }
        l
    }

    fun analyze(raw: String, appPackages: List<String> = emptyList(), workspace: File? = null, manifestPath: String? = null, declaredActivities: Set<String> = emptySet()): CrashReport {
        val lines = clean(raw)
        val text = lines.joinToString("\n")
        val process = Regex("""Process:\s*([\w.:]+)""").find(text)?.groupValues?.get(1)

        if (Regex("""\bANR in\b|Application Not Responding|Input dispatching timed out""").containsMatchIn(text)) {
            return simple("ANR", process, "The app stopped responding (ANR)",
                "The main thread was blocked for too long (typically 5 seconds for input). Common causes are disk or network I/O, long computations, or lock contention on the main thread.",
                listOf("Move I/O and heavy work to a background thread or coroutine (Dispatchers.IO).", "Look for the \"main\" thread stack in the ANR traces to see what it was waiting on."))
        }
        val chain = parseChain(lines)
        if (chain.isEmpty()) {
            if (Regex("""Fatal signal \d+ \((SIG\w+)\)|\*\*\* \*\*\* \*\*\*|backtrace:""").containsMatchIn(text)) {
                val sig = Regex("""Fatal signal \d+ \((SIG\w+)\)""").find(text)?.groupValues?.get(1) ?: "native signal"
                return simple("NATIVE", process, "Native crash ($sig)",
                    "The crash happened in native (C/C++) code, for example in a bundled .so library. Java stack traces are not available for native crashes.",
                    listOf("Check that the APK contains native libraries for the device's ABI.", "Symbolicate the tombstone with ndk-stack using the unstripped .so files.", "Update the library that owns the crashing .so file."))
            }
            return simple("UNKNOWN", process, "No stack trace found",
                "Paste the full logcat output starting at \"FATAL EXCEPTION\" or the complete crash report.", emptyList())
        }
        val root = chain.last()
        val packages = appPackages.ifEmpty { listOfNotNull(process?.substringBefore(':')) }
        fun isApp(f: StackFrame) = if (packages.isNotEmpty()) packages.any { f.className.startsWith("$it.") || f.className == it } else frameworkPackages.none { f.className.startsWith(it) }
        val appFrame = chain.asReversed().firstNotNullOfOrNull { e -> e.frames.firstOrNull(::isApp) }
        val source = if (workspace != null && appFrame != null) locate(workspace, appFrame) else null
        val (explanation, suggestions, extra) = explain(chain, root, manifestPath, declaredActivities, workspace)
        val where = appFrame?.let { " in ${it.className.substringAfterLast('.')}.${it.method}" + (it.line?.let { l -> " (line $l)" } ?: "") } ?: ""
        val findings = mutableListOf<Finding>()
        findings += Finding("crash.exception", Severity.ERROR, Certainty.CONFIRMED, Categories.CRASH,
            "${root.type.substringAfterLast('.')}$where", root.message ?: root.type,
            file = source?.path, line = source?.line, likelyCause = explanation, suggestedFix = suggestions.firstOrNull())
        findings += extra
        return CrashReport("JAVA", chain, process, root, appFrame, source,
            "${root.type.substringAfterLast('.')}$where", explanation, suggestions, findings)
    }

    private fun simple(kind: String, process: String?, summary: String, explanation: String, suggestions: List<String>) =
        CrashReport(kind, emptyList(), process, null, null, null, summary, explanation, suggestions,
            listOf(Finding("crash.${kind.lowercase()}", if (kind == "UNKNOWN") Severity.INFO else Severity.ERROR, Certainty.LIKELY, Categories.CRASH, summary, explanation, suggestedFix = suggestions.firstOrNull())))

    fun parseChain(lines: List<String>): List<ExceptionInfo> {
        // Use the last FATAL EXCEPTION block if present, else the first exception found.
        val fatalIdx = lines.indexOfLast { it.contains("FATAL EXCEPTION") }
        val start = if (fatalIdx >= 0) fatalIdx + 1 else 0
        val out = mutableListOf<ExceptionInfo>()
        var current: Triple<String, String?, MutableList<StackFrame>>? = null
        var i = start
        while (i < lines.size) {
            val line = lines[i].trim()
            val frame = frameRegex.find(line)
            if (frame != null && current != null) {
                current.third += parseFrame(frame)
            } else if (line.startsWith("...") && line.endsWith("more")) {
                // skip
            } else {
                val ex = exceptionRegex.find(line)
                val looksLikeException = ex != null && (line.startsWith("Caused by:") || line.startsWith("Exception in thread") ||
                    ex.groupValues[1].substringAfterLast('.').let { it.endsWith("Exception") || it.endsWith("Error") || it.endsWith("Throwable") || it.contains("Exception$") })
                if (looksLikeException && ex != null && i + 1 < lines.size && (frameRegex.containsMatchIn(lines[i + 1]) || line.startsWith("Caused by:") || continuationThenFrame(lines, i))) {
                    current?.let { out += ExceptionInfo(it.first, it.second, it.third) }
                    var message = ex.groupValues[2].takeIf { it.isNotEmpty() }
                    // Multi-line messages continue until the first frame.
                    var j = i + 1
                    while (j < lines.size && !frameRegex.containsMatchIn(lines[j]) && !lines[j].trim().startsWith("Caused by:") && j - i < 15) {
                        if (lines[j].isNotBlank()) message = (message?.plus("\n") ?: "") + lines[j].trim()
                        j++
                    }
                    current = Triple(ex.groupValues[1], message, mutableListOf())
                    i = j
                    continue
                }
            }
            i++
        }
        current?.let { out += ExceptionInfo(it.first, it.second, it.third) }
        return out
    }

    private fun continuationThenFrame(lines: List<String>, i: Int): Boolean {
        for (j in i + 1 until minOf(lines.size, i + 15)) if (frameRegex.containsMatchIn(lines[j])) return true
        return false
    }

    private fun parseFrame(m: MatchResult): StackFrame {
        val loc = m.groupValues[3]
        val native = loc == "Native Method"
        val file = loc.substringBefore(':').takeIf { it.isNotEmpty() && it != "Unknown Source" && !native }
        val line = loc.substringAfter(':', "").toIntOrNull()
        return StackFrame(m.groupValues[1], m.groupValues[2], file, line, native)
    }

    /** Finds the source file for a frame inside the workspace using the package path and file name. */
    fun locate(workspace: File, frame: StackFrame): SourceLocation? {
        val fileName = frame.fileName ?: return null
        val pkgPath = frame.className.substringBeforeLast('.', "").replace('.', '/')
        val candidates = workspace.walkTopDown().onEnter { it.name !in setOf("build", ".gradle", ".git", "node_modules") }
            .filter { it.isFile && it.name == fileName }.toList()
        val best = candidates.firstOrNull { it.parentFile.invariantSeparatorsPath.endsWith(pkgPath) } ?: candidates.firstOrNull() ?: return null
        return SourceLocation(best.relativeTo(workspace).invariantSeparatorsPath, frame.line)
    }

    private data class Explanation(val text: String, val suggestions: List<String>, val findings: List<Finding> = emptyList())

    private fun explain(chain: List<ExceptionInfo>, root: ExceptionInfo, manifestPath: String?, declared: Set<String>, workspace: File?): Explanation {
        val all = chain.joinToString("\n") { "${it.type}: ${it.message.orEmpty()}" }
        val msg = root.message.orEmpty()
        val t = root.type
        fun has(s: String) = all.contains(s, ignoreCase = false)
        return when {
            has("ActivityNotFoundException") && has("have you declared this activity") -> {
                val cls = Regex("""\{([\w.]+)/([\w.$]+)\}""").find(all)?.groupValues?.get(2)
                val extra = if (cls != null && manifestPath != null && cls !in declared) listOf(
                    Finding("manifest.activity_not_declared", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST,
                        "$cls is not declared in the manifest", "The app tried to start $cls, but it has no <activity> entry.",
                        file = manifestPath, suggestedFix = "Declare the activity.", fixLabel = "Declare activity",
                        fixData = mapOf("path" to manifestPath, "name" to cls)),
                ) else emptyList()
                Explanation("An activity was started that is not declared in AndroidManifest.xml${cls?.let { " ($it)" } ?: ""}.",
                    listOf("Add an <activity android:name=\"…\"> entry for it inside <application>."), extra)
            }
            has("ActivityNotFoundException") -> Explanation("No installed app can handle the Intent that was started (for example a browser, email or camera intent).",
                listOf("Wrap startActivity in try/catch for ActivityNotFoundException, or check intent.resolveActivity() first.", "On Android 11+, declare <queries> for intents you query."))
            t.endsWith("UninitializedPropertyAccessException") -> Explanation("A Kotlin lateinit property was read before it was assigned: $msg.",
                listOf("Initialise the property earlier (for example in onCreate before use) or check ::prop.isInitialized."))
            t.endsWith("NullPointerException") || t.endsWith("KotlinNullPointerException") -> Explanation(
                "Code used a null reference" + (Regex("""'([^']+)'""").find(msg)?.let { " (${it.groupValues[1]})" } ?: "") + ". In Kotlin this is often `!!`, a platform type from Java, or a view looked up before setContentView().",
                listOf("Check the variable at the reported line for null.", "Replace `!!` with safe calls (?.) or explicit checks.", "Make sure findViewById is called after setContentView with the right layout."))
            has("Resources\$NotFoundException") -> Explanation("A resource ID could not be found at runtime. A common cause is passing an Int to setText() (it is treated as a resource ID) or a resource missing for the device configuration.",
                listOf("Use setText(value.toString()) for numbers.", "Make sure the resource exists in the default (unqualified) res folder."))
            has("InflateException") || has("Error inflating class") -> Explanation("A layout failed to inflate" + (Regex("""Binary XML file line #(\d+)""").find(all)?.let { " at layout line ${it.groupValues[1]}" } ?: "") + ". Usually a custom view class name is wrong, a theme attribute is missing, or a drawable is invalid.",
                listOf("Check the layout line mentioned in the message.", "If the message mentions a theme, make sure the activity uses a compatible theme (Theme.AppCompat / Theme.Material3)."))
            has("You need to use a Theme.AppCompat theme") -> Explanation("An AppCompatActivity is using a theme that does not extend Theme.AppCompat (or Material Components).",
                listOf("Set android:theme on the activity or application to a Theme.AppCompat/Theme.Material3 based style."))
            t.endsWith("NetworkOnMainThreadException") -> Explanation("A network request was made on the main thread, which Android forbids.",
                listOf("Run network calls in a coroutine with Dispatchers.IO, or with an async HTTP client."))
            t.endsWith("SecurityException") || has("Permission Denial") -> {
                val perm = Regex("""android\.permission\.[A-Z_]+""").find(all)?.value
                val extra = if (perm != null && manifestPath != null && workspace != null) {
                    val m = File(workspace, manifestPath)
                    if (m.isFile && !m.readText().contains(perm)) listOf(
                        Finding("crash.missing_permission", Severity.ERROR, Certainty.LIKELY, Categories.MANIFEST,
                            "$perm is not declared", "The crash mentions $perm, which the manifest does not request.",
                            file = manifestPath, suggestedFix = "Declare the permission (dangerous permissions must also be requested at runtime).",
                            fixLabel = "Add $perm", fixData = mapOf("path" to manifestPath, "permission" to perm)),
                    ) else emptyList()
                } else emptyList()
                Explanation("The app used a protected API without the required permission${perm?.let { " ($it)" } ?: ""}.",
                    listOf("Declare the permission in AndroidManifest.xml.", "For runtime (dangerous) permissions, request them with ActivityResultContracts.RequestPermission before use."), extra)
            }
            has("CalledFromWrongThreadException") || has("Only the original thread that created a view hierarchy") -> Explanation("A view was modified from a background thread.",
                listOf("Update UI on the main thread (withContext(Dispatchers.Main), runOnUiThread, or View.post)."))
            has("FLAG_IMMUTABLE or FLAG_MUTABLE") -> Explanation("Since Android 12, every PendingIntent must specify FLAG_IMMUTABLE or FLAG_MUTABLE.",
                listOf("Add PendingIntent.FLAG_IMMUTABLE to the flags (use FLAG_MUTABLE only if the intent must be modified)."))
            has("ForegroundServiceStartNotAllowedException") || has("MissingForegroundServiceTypeException") || has("foregroundServiceType") -> Explanation("Foreground service rules were violated. Android 12+ restricts starting them from the background and Android 14+ requires a declared foregroundServiceType.",
                listOf("Declare android:foregroundServiceType and the matching FOREGROUND_SERVICE_* permission.", "Start the service while the app is visible, or use WorkManager."))
            has("did not then call Service.startForeground") -> Explanation("startForegroundService() was called but the service did not call startForeground() within the time limit.",
                listOf("Call startForeground() at the start of onStartCommand()."))
            t.endsWith("ClassNotFoundException") || t.endsWith("NoClassDefFoundError") -> Explanation("A class was missing at runtime. Common causes: R8/ProGuard removed or renamed it, a dependency is compileOnly, or the manifest names a class that does not exist.",
                listOf("Add -keep rules for classes loaded by reflection.", "Check the class name in the manifest.", "Make sure the dependency is 'implementation', not 'compileOnly'."))
            t.endsWith("UnsatisfiedLinkError") -> Explanation("A native library (.so) could not be loaded, usually because the APK has no build of it for this device's CPU architecture (ABI).",
                listOf("Include the device ABI (arm64-v8a, armeabi-v7a, x86_64) in abiFilters.", "Check that the library name in System.loadLibrary matches the .so file."))
            t.endsWith("OutOfMemoryError") -> Explanation("The app ran out of memory, often by decoding large bitmaps or leaking activities.",
                listOf("Load images with downsampling (Coil/Glide) instead of full-size bitmaps.", "Look for leaked activities or large caches."))
            t.endsWith("IllegalStateException") && has("onSaveInstanceState") -> Explanation("A fragment transaction or navigation happened after the activity saved its state.",
                listOf("Perform the transaction earlier, or use commitAllowingStateLoss only if losing it is acceptable."))
            t.endsWith("IllegalStateException") && has("not attached to") -> Explanation("A fragment used its context or activity after being detached.",
                listOf("Check isAdded / use viewLifecycleOwner scopes so callbacks stop when the view is destroyed."))
            t.endsWith("BadTokenException") -> Explanation("A dialog or window was shown after its activity finished.",
                listOf("Check !isFinishing && !isDestroyed before showing dialogs, or tie them to the lifecycle."))
            t.endsWith("ClassCastException") -> Explanation("An object was cast to the wrong type: $msg.", listOf("Check the cast at the reported line (for example a findViewById type or a Parcelable)."))
            t.endsWith("IndexOutOfBoundsException") -> Explanation("A list or array was accessed outside its bounds: $msg.", listOf("Check indexes and empty lists at the reported line."))
            t.endsWith("NumberFormatException") -> Explanation("Text was converted to a number but was not a valid number: $msg.", listOf("Use toIntOrNull()/toDoubleOrNull() and handle invalid input."))
            t.endsWith("FileUriExposedException") -> Explanation("A file:// URI was shared with another app, which Android 7+ forbids.", listOf("Share files through FileProvider and content:// URIs."))
            t.endsWith("TransactionTooLargeException") -> Explanation("Too much data was passed through a Bundle or Intent (limit about 1 MB).", listOf("Pass IDs instead of large objects; store data in a database or file."))
            t.endsWith("SQLiteException") -> Explanation("A database error occurred: $msg.", listOf("Check the SQL and schema migrations."))
            t.endsWith("IllegalArgumentException") -> Explanation("A method received an invalid argument: $msg.", listOf("Validate the arguments passed at the reported line."))
            else -> Explanation("${t.substringAfterLast('.')} was thrown${if (msg.isNotEmpty()) ": $msg" else ""}.", listOf("Open the first app frame in the stack trace and inspect the values used there."))
        }
    }
}

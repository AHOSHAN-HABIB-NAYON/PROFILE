package com.appfix.core.ai

import com.appfix.core.analysis.Finding
import com.appfix.core.build.BuildPlanner
import com.appfix.core.patch.UnifiedPatch
import com.appfix.core.project.ProjectInfo
import com.appfix.core.util.PathSafety
import com.appfix.core.util.TextFiles
import java.io.File

/** What the user chose to share with the assistant for one question. */
data class AiRequest(
    val question: String,
    val files: List<String> = emptyList(),
    val findings: List<Finding> = emptyList(),
    val log: String? = null,
)

data class SharedFile(val path: String, val chars: Int, val truncated: Boolean, val redactions: Int)

/** The exact text that will be sent, so the user can review it first. */
data class AiPrompt(val system: String, val user: String, val shared: List<SharedFile>, val skipped: List<String>)

/**
 * Builds the prompt. Only files the user picked are included; secrets are never sent: signing/secret files
 * are skipped and lines that look like passwords, tokens or keys are redacted.
 */
object AiContextBuilder {
    const val MAX_FILE_CHARS = 24_000
    const val MAX_TOTAL_CHARS = 90_000
    const val MAX_LOG_CHARS = 16_000

    val SYSTEM = """
        You are the repair assistant inside AppFix Studio, an Android app editor. You help the user fix and improve
        an app they own. Be concise and concrete.
        Rules:
        - When you propose code changes, output them as ONE unified diff in a ```diff fenced block, with paths relative
          to the project root (--- a/path, +++ b/path, /dev/null for new files) and at least 3 lines of unchanged context.
        - Only change files whose current content you were shown, or create new files. Never change keystores,
          signing configs, passwords or secrets.
        - Never claim a problem is fixed. Say what the change should do and that a rebuild is needed to confirm it.
        - Mark uncertainty clearly. If you need another file, ask for it by path instead of guessing its content.
        - Refuse to help with signature bypass, licence circumvention, credential theft, malware or evading security controls.
    """.trimIndent()

    private val secretLine = Regex(
        """(?i)(password|passwd|secret|token|api[_-]?key|private[_-]?key|storePassword|keyPassword|client[_-]?secret|authorization)\w*["']?\s*(?:[:=]|\s["'])""",
    )
    private val keyLike = Regex("""(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)""")

    fun redact(text: String): Pair<String, Int> {
        var count = 0
        val out = text.lines().joinToString("\n") { line ->
            when {
                secretLine.containsMatchIn(line) -> { count++; line.substringBefore(secretLine.find(line)!!.value) + secretLine.find(line)!!.value + " <redacted by AppFix>" }
                keyLike.containsMatchIn(line) -> { count++; keyLike.replace(line, "<redacted by AppFix>") }
                else -> line
            }
        }
        return out to count
    }

    fun build(projectRoot: File, info: ProjectInfo?, request: AiRequest): AiPrompt {
        val sb = StringBuilder()
        val shared = mutableListOf<SharedFile>()
        val skipped = mutableListOf<String>()
        if (info != null) {
            sb.appendLine("## Project")
            sb.appendLine("Framework: ${info.framework}; languages: ${info.languages.joinToString()}; UI: ${info.uiToolkits.joinToString()}")
            sb.appendLine("Gradle: ${info.gradleVersion ?: "?"}; AGP: ${info.agpVersion ?: "?"}; Kotlin: ${info.kotlinVersion ?: "?"}")
            if (info.modules.isNotEmpty()) sb.appendLine("Modules: ${info.modules.joinToString { it.gradlePath }}")
            sb.appendLine()
        }
        if (request.findings.isNotEmpty()) {
            sb.appendLine("## Findings from AppFix analysis")
            request.findings.take(30).forEach { f ->
                sb.appendLine("- [${f.severity}/${f.certainty}] ${f.title}${f.file?.let { " ($it${f.line?.let { l -> ":$l" } ?: ""})" } ?: ""}: ${f.description.take(400)}")
            }
            sb.appendLine()
        }
        request.log?.takeIf { it.isNotBlank() }?.let { log ->
            val (clean, _) = redact(log.takeLast(MAX_LOG_CHARS))
            sb.appendLine("## Log (last ${clean.length} characters)").appendLine("```").appendLine(clean).appendLine("```").appendLine()
        }
        var total = sb.length
        for (path in request.files.distinct()) {
            val rel = PathSafety.normalizeRelative(path)
            val file = rel?.let { PathSafety.resolveInside(projectRoot, it) }
            when {
                rel == null || file == null -> { skipped += "$path (unsafe path)"; continue }
                BuildPlanner.isSecret(rel) -> { skipped += "$rel (secret or signing file — never shared)"; continue }
                !file.isFile -> { skipped += "$rel (not found)"; continue }
                !TextFiles.isProbablyText(file) || file.length() > UnifiedPatch.MAX_FILE_BYTES -> { skipped += "$rel (binary or too large)"; continue }
            }
            val raw = file!!.readText()
            val (clean, redactions) = redact(raw)
            val budget = minOf(MAX_FILE_CHARS, MAX_TOTAL_CHARS - total)
            if (budget < 500) { skipped += "$rel (context limit reached)"; continue }
            val truncated = clean.length > budget
            val body = if (truncated) clean.take(budget) else clean
            sb.appendLine("## File: $rel${if (truncated) " (truncated — do not patch past the end of what you see)" else ""}")
            sb.appendLine("```${TextFiles.languageFor(rel!!)}").appendLine(body).appendLine("```").appendLine()
            total = sb.length
            shared += SharedFile(rel, body.length, truncated, redactions)
        }
        sb.appendLine("## Question").appendLine(request.question.trim())
        return AiPrompt(SYSTEM, sb.toString(), shared, skipped)
    }
}

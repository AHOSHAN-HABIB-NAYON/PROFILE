package com.appfix.core.analysis

import kotlinx.serialization.Serializable

@Serializable
enum class Severity { ERROR, WARNING, INFO }

/**
 * How sure the analyzer is. CONFIRMED findings are definite (the build will fail or the file is
 * provably wrong). LIKELY findings are probable but depend on things static analysis cannot see
 * (for example resources coming from a library). SUGGESTIONs are improvements.
 */
@Serializable
enum class Certainty { CONFIRMED, LIKELY, SUGGESTION }

@Serializable
data class Finding(
    val ruleId: String,
    val severity: Severity,
    val certainty: Certainty,
    val category: String,
    val title: String,
    val description: String,
    /** Workspace-relative path, when known. */
    val file: String? = null,
    val line: Int? = null,
    val likelyCause: String? = null,
    val suggestedFix: String? = null,
    /** Present when [RepairEngine] can generate a deterministic fix. */
    val fixLabel: String? = null,
    val fixData: Map<String, String> = emptyMap(),
) {
    val hasFix: Boolean get() = fixLabel != null
    val key: String get() = "$ruleId|${file.orEmpty()}|${line ?: 0}|${fixData.entries.sortedBy { it.key }.joinToString()}"
}

@Serializable
data class AnalysisReport(
    val findings: List<Finding>,
    val analyzedFiles: Int,
    val durationMs: Long,
    val limitations: List<String>,
) {
    val errorCount: Int get() = findings.count { it.severity == Severity.ERROR }
    val warningCount: Int get() = findings.count { it.severity == Severity.WARNING }
}

object Categories {
    const val BUILD = "Build configuration"
    const val MANIFEST = "Manifest"
    const val RESOURCES = "Resources"
    const val SDK = "SDK levels"
    const val CODE = "Source code"
    const val PROJECT = "Project structure"
    const val CRASH = "Crash"
}

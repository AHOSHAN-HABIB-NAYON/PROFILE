package com.appfix.core.build

import com.appfix.core.project.ProjectInfo
import com.appfix.core.util.CancelToken
import com.appfix.core.util.ProgressListener
import kotlinx.serialization.Serializable
import java.io.File

@Serializable
enum class BuildState { UPLOADING, QUEUED, RUNNING, DOWNLOADING, SUCCEEDED, FAILED, CANCELLED }

@Serializable
data class BuildStepStatus(val name: String, val status: String, val conclusion: String?)

@Serializable
data class BuildRecord(
    val id: String,
    val projectId: String,
    val variant: BuildVariant,
    val repo: String,
    val branch: String,
    val commitSha: String? = null,
    val runId: Long? = null,
    val runUrl: String? = null,
    val state: BuildState,
    val startedAt: Long,
    val finishedAt: Long? = null,
    val steps: List<BuildStepStatus> = emptyList(),
    val outputFile: String? = null,
    val outputSize: Long? = null,
    val message: String? = null,
    val uploadedFiles: Int = 0,
) {
    val durationMs: Long? get() = finishedAt?.let { it - startedAt }
    val isActive: Boolean get() = state in setOf(BuildState.UPLOADING, BuildState.QUEUED, BuildState.RUNNING, BuildState.DOWNLOADING)
}

/**
 * Runs a build on GitHub Actions in a repository the user owns:
 * upload files as an orphan commit (with the generated workflow) to `appfix-build/<id>`,
 * which triggers the workflow; then poll, fetch logs and download the artifact.
 */
class CloudBuild(private val client: GitHubClient, private val owner: String, private val repo: String) {

    fun upload(projectRoot: File, info: ProjectInfo, variant: BuildVariant, buildId: String, progress: ProgressListener, cancel: CancelToken): Pair<String, Int> {
        val plan = BuildPlanner.uploadPlan(projectRoot)
        val workflow = BuildPlanner.workflow(info, variant).toByteArray()
        val entries = mutableListOf<Triple<String, String, Boolean>>()
        var done = 0L
        for (f in plan.files) {
            cancel.throwIfCancelled()
            val sha = client.createBlob(owner, repo, File(projectRoot, f.path).readBytes())
            entries += Triple(f.path, sha, f.executable)
            done += f.size
            progress.onProgress(done, plan.totalBytes, "Uploading ${f.path}")
        }
        entries += Triple(BuildPlanner.WORKFLOW_PATH, client.createBlob(owner, repo, workflow), false)
        cancel.throwIfCancelled()
        val tree = client.createTree(owner, repo, entries)
        val commit = client.createCommit(owner, repo, "AppFix Studio build $buildId (${variant.gradleTask})", tree)
        client.setBranch(owner, repo, branchFor(buildId), commit)
        return commit to plan.files.size
    }

    /** Refreshes [record] from GitHub. Returns the new record. */
    fun poll(record: BuildRecord): BuildRecord {
        val sha = record.commitSha ?: return record
        val run = record.runId?.let { client.run(owner, repo, it) } ?: client.findRun(owner, repo, record.branch, sha) ?: return record.copy(state = BuildState.QUEUED, message = "Waiting for GitHub to start the workflow…")
        val steps = runCatching { client.jobs(owner, repo, run.id).flatMap { j -> j.steps.map { BuildStepStatus(it.name, it.status, it.conclusion) } } }.getOrDefault(record.steps)
        val state = when {
            run.status != "completed" -> if (run.status == "queued" || run.status == "waiting" || run.status == "pending") BuildState.QUEUED else BuildState.RUNNING
            run.conclusion == "success" -> BuildState.DOWNLOADING
            run.conclusion == "cancelled" -> BuildState.CANCELLED
            else -> BuildState.FAILED
        }
        return record.copy(runId = run.id, runUrl = run.htmlUrl, state = state, steps = steps,
            message = when (state) { BuildState.QUEUED -> "Waiting for a GitHub runner…"; BuildState.RUNNING -> steps.lastOrNull { it.status == "in_progress" }?.name?.let { "Running: $it" } ?: "Running…"; else -> record.message })
    }

    /** Combined text log of every job in the run (available once jobs finish). */
    fun logs(record: BuildRecord): String {
        val runId = record.runId ?: return ""
        return client.jobs(owner, repo, runId).joinToString("\n") { j ->
            "=== ${j.name} (${j.conclusion ?: j.status}) ===\n" + runCatching { client.jobLog(owner, repo, j.id) }.getOrElse { "(log unavailable: ${it.message})" }
        }
    }

    /** Downloads the build artifact ZIP into [target]. Returns false when the run produced none. */
    fun downloadArtifact(record: BuildRecord, target: File, cancel: CancelToken): Boolean {
        val runId = record.runId ?: return false
        val artifact = client.artifacts(owner, repo, runId).firstOrNull { it.name == "appfix-output" && !it.expired } ?: return false
        client.downloadArtifact(owner, repo, artifact.id, target, cancel)
        return true
    }

    fun cancel(record: BuildRecord) {
        record.runId?.let { client.cancel(owner, repo, it) }
    }

    fun cleanup(record: BuildRecord) = client.deleteBranch(owner, repo, record.branch)

    companion object {
        fun branchFor(buildId: String) = BuildPlanner.BRANCH_PREFIX + buildId.take(12)
    }
}

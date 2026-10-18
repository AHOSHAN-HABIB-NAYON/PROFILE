package com.appfix.studio.data.build

import com.appfix.core.apk.ApkInspector
import com.appfix.core.archive.ExtractionPolicy
import com.appfix.core.archive.SafeZipExtractor
import com.appfix.core.build.BuildPlanner
import com.appfix.core.build.BuildRecord
import com.appfix.core.build.BuildState
import com.appfix.core.build.BuildVariant
import com.appfix.core.build.CloudBuild
import com.appfix.core.build.GitHubClient
import com.appfix.core.project.ProjectDetector
import com.appfix.core.util.CancelToken
import com.appfix.studio.data.repo.ProjectStorage
import com.appfix.studio.security.SecretStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** Upload progress of the build being started, shown while files are sent. */
data class UploadProgress(val buildId: String, val done: Long, val total: Long, val label: String)

/**
 * Runs cloud builds in an application-wide scope so they keep going while the user moves between
 * screens. Records, logs and outputs are stored under projects/<id>/builds/<buildId>/.
 */
class BuildRunner(private val storage: ProjectStorage, private val secrets: SecretStore) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true; encodeDefaults = true }
    private val jobs = ConcurrentHashMap<String, Job>()
    private val cancelFlags = ConcurrentHashMap<String, AtomicBoolean>()
    private val _records = MutableStateFlow<Map<String, BuildRecord>>(emptyMap())
    val records: StateFlow<Map<String, BuildRecord>> = _records.asStateFlow()
    val upload = MutableStateFlow<UploadProgress?>(null)

    fun buildsDir(projectId: String) = File(storage.projectDir(projectId), "builds")
    fun buildDir(projectId: String, buildId: String): File {
        require(buildId.matches(Regex("[A-Za-z0-9-]{8,64}"))) { "Invalid build id" }
        return File(buildsDir(projectId), buildId)
    }
    fun logFile(projectId: String, buildId: String) = File(buildDir(projectId, buildId), "log.txt")

    fun history(projectId: String): List<BuildRecord> {
        val dir = buildsDir(projectId)
        val stored = dir.listFiles().orEmpty().mapNotNull { d -> File(d, "record.json").takeIf { it.isFile }?.let { runCatching { json.decodeFromString(BuildRecord.serializer(), it.readText()) }.getOrNull() } }
        val live = _records.value.values.filter { it.projectId == projectId }.associateBy { it.id }
        return (stored.associateBy { it.id } + live).values.sortedByDescending { it.startedAt }
    }

    private fun save(record: BuildRecord) {
        _records.value = _records.value + (record.id to record)
        val dir = buildDir(record.projectId, record.id).apply { mkdirs() }
        File(dir, "record.json").writeText(json.encodeToString(BuildRecord.serializer(), record))
    }

    fun client(): GitHubClient = GitHubClient(secrets.get(SecretStore.GITHUB_TOKEN) ?: throw IllegalStateException("Add a GitHub token in the build settings first."))

    fun start(projectId: String, repo: String, variant: BuildVariant): String {
        val (owner, name) = repo.split('/').takeIf { it.size == 2 } ?: throw IllegalArgumentException("Build repository must be owner/name")
        val id = UUID.randomUUID().toString().replace("-", "").take(16)
        val ws = storage.workspace(projectId)
        val info = ProjectDetector.detect(ws)
        val projectRoot = if (info.root.isEmpty()) ws else File(ws, info.root)
        val cloud = CloudBuild(client(), owner, name)
        var record = BuildRecord(id, projectId, variant, repo, CloudBuild.branchFor(id), state = BuildState.UPLOADING, startedAt = System.currentTimeMillis(), message = "Uploading project files…")
        save(record)
        val cancel = AtomicBoolean(false).also { cancelFlags[id] = it }
        jobs[id] = scope.launch {
            try {
                val (sha, count) = cloud.upload(projectRoot, info, variant, id, { d, t, l -> upload.value = UploadProgress(id, d, t, l) }, CancelToken { cancel.get() })
                upload.value = null
                record = record.copy(commitSha = sha, uploadedFiles = count, state = BuildState.QUEUED, message = "Waiting for GitHub to start the workflow…")
                save(record)
                follow(record, cloud, cancel)
            } catch (e: Exception) {
                upload.value = null
                save(record.copy(state = if (cancel.get()) BuildState.CANCELLED else BuildState.FAILED, finishedAt = System.currentTimeMillis(), message = e.message ?: e.javaClass.simpleName))
            }
        }
        return id
    }

    /** Resumes polling an unfinished build (e.g. after the app was restarted). */
    fun resume(record: BuildRecord) {
        if (!record.isActive || jobs[record.id]?.isActive == true || record.commitSha == null) return
        val (owner, name) = record.repo.split('/')
        val cloud = runCatching { CloudBuild(client(), owner, name) }.getOrNull() ?: return
        val cancel = AtomicBoolean(false).also { cancelFlags[record.id] = it }
        jobs[record.id] = scope.launch {
            try { follow(record, cloud, cancel) } catch (e: Exception) {
                save(record.copy(state = BuildState.FAILED, finishedAt = System.currentTimeMillis(), message = e.message))
            }
        }
    }

    private suspend fun kotlinx.coroutines.CoroutineScope.follow(start: BuildRecord, cloud: CloudBuild, cancel: AtomicBoolean) {
        var record = start
        val deadline = System.currentTimeMillis() + 60 * 60 * 1000L
        while (isActive && record.state in setOf(BuildState.QUEUED, BuildState.RUNNING)) {
            if (cancel.get()) {
                runCatching { cloud.cancel(record) }
                record = record.copy(state = BuildState.CANCELLED, finishedAt = System.currentTimeMillis(), message = "Cancelled")
                save(record)
                break
            }
            if (System.currentTimeMillis() > deadline) {
                record = record.copy(state = BuildState.FAILED, finishedAt = System.currentTimeMillis(), message = "Stopped waiting after 60 minutes")
                save(record)
                break
            }
            delay(if (record.state == BuildState.QUEUED) 6_000 else 10_000)
            record = runCatching { cloud.poll(record) }.getOrElse { record.copy(message = "Network problem, retrying: ${it.message}") }
            save(record)
        }
        if (record.state in setOf(BuildState.DOWNLOADING, BuildState.FAILED, BuildState.CANCELLED) && record.runId != null) {
            val log = runCatching { cloud.logs(record) }.getOrElse { "Log unavailable: ${it.message}" }
            logFile(record.projectId, record.id).writeText(log)
        }
        if (record.state == BuildState.DOWNLOADING) {
            record = record.copy(message = "Downloading the build output…")
            save(record)
            record = collectOutput(record, cloud, cancel)
        } else if (record.finishedAt == null) {
            record = record.copy(finishedAt = System.currentTimeMillis(), message = record.message ?: "Build ${record.state.name.lowercase()}")
        }
        save(record)
        runCatching { cloud.cleanup(record) }
    }

    private fun collectOutput(record: BuildRecord, cloud: CloudBuild, cancel: AtomicBoolean): BuildRecord {
        val dir = buildDir(record.projectId, record.id)
        val zip = File(dir, "artifact.zip")
        val extracted = File(dir, "artifact")
        return try {
            if (!cloud.downloadArtifact(record, zip, CancelToken { cancel.get() })) {
                return record.copy(state = BuildState.FAILED, finishedAt = System.currentTimeMillis(), message = "The build succeeded but produced no APK or AAB.")
            }
            extracted.deleteRecursively()
            SafeZipExtractor(ExtractionPolicy(skipBuildOutputs = false)).extract(zip, extracted, CancelToken { cancel.get() })
            val output = BuildPlanner.pickOutput(extracted, record.variant) ?: return record.copy(state = BuildState.FAILED, finishedAt = System.currentTimeMillis(), message = "No ${if (record.variant == BuildVariant.RELEASE_AAB) "AAB" else "APK"} found in the build output.")
            val target = File(dir, output.name)
            output.copyTo(target, overwrite = true)
            zip.delete()
            extracted.deleteRecursively()
            val note = if (target.extension == "apk") {
                val report = runCatching { ApkInspector.inspect(target) }.getOrNull()
                report?.let { "Built ${it.manifest?.packageName ?: ""} ${it.manifest?.versionName ?: ""} · ${it.signing.schemes.joinToString().ifEmpty { "unsigned" }}" } ?: "Built, but the APK could not be inspected"
            } else "App bundle built (unsigned). Sign it for upload with your upload key."
            record.copy(state = BuildState.SUCCEEDED, finishedAt = System.currentTimeMillis(), outputFile = target.name, outputSize = target.length(), message = note)
        } catch (e: Exception) {
            record.copy(state = BuildState.FAILED, finishedAt = System.currentTimeMillis(), message = "Downloading the output failed: ${e.message}")
        }
    }

    fun cancel(buildId: String) { cancelFlags[buildId]?.set(true) }

    fun delete(projectId: String, buildId: String) {
        cancel(buildId)
        jobs.remove(buildId)?.cancel()
        _records.value = _records.value - buildId
        buildDir(projectId, buildId).deleteRecursively()
    }

    fun outputFile(record: BuildRecord): File? = record.outputFile?.let { File(buildDir(record.projectId, record.id), it).takeIf(File::isFile) }
}

package com.appfix.studio.data.repo

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.graphics.drawable.toBitmap
import androidx.documentfile.provider.DocumentFile
import com.appfix.core.analysis.AnalysisReport
import com.appfix.core.analysis.BuildLogAnalyzer
import com.appfix.core.analysis.BuildLogReport
import com.appfix.core.analysis.CrashLogAnalyzer
import com.appfix.core.analysis.CrashReport
import com.appfix.core.analysis.Finding
import com.appfix.core.analysis.FixResources
import com.appfix.core.analysis.ProjectAnalyzer
import com.appfix.core.analysis.RepairEngine
import com.appfix.core.apk.ApkInspector
import com.appfix.core.apk.ApkReport
import com.appfix.core.archive.ExtractionPolicy
import com.appfix.core.archive.ExtractionResult
import com.appfix.core.archive.SafeZipExtractor
import com.appfix.core.backup.Snapshot
import com.appfix.core.backup.SnapshotManager
import com.appfix.core.patch.ChangeApplier
import com.appfix.core.patch.ChangeRecord
import com.appfix.core.patch.ChangeSet
import com.appfix.core.project.ProjectDetector
import com.appfix.core.project.ProjectInfo
import com.appfix.core.util.B64
import com.appfix.core.util.CancelToken
import com.appfix.core.util.Hashing
import com.appfix.core.util.ProgressListener
import com.appfix.core.util.SizeLimitExceededException
import com.appfix.core.util.formatBytes
import com.appfix.studio.data.db.ProjectDao
import com.appfix.studio.data.db.ProjectEntity
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.signing.ApkSignatureVerifier
import com.appfix.studio.signing.SignatureVerification
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** User-facing import failure. [message] is written to be shown directly in the UI. */
class ImportException(message: String, cause: Throwable? = null) : Exception(message, cause)

data class ImportOutcome(val projectId: String, val warnings: List<String>)

class ProjectRepository(
    private val context: Context,
    private val dao: ProjectDao,
    val storage: ProjectStorage,
) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true; encodeDefaults = true }

    val projects: Flow<List<ProjectEntity>> = dao.observeAll()
    fun observe(id: String): Flow<ProjectEntity?> = dao.observe(id)
    suspend fun get(id: String): ProjectEntity? = dao.get(id)

    // ------------------------------------------------------------------ Import

    suspend fun importApk(uri: Uri, progress: ProgressListener, cancel: CancelToken): ImportOutcome = withContext(Dispatchers.IO) {
        val (displayName, declaredSize) = queryName(uri)
        val name = displayName ?: "imported.apk"
        val id = newId()
        val original = File(storage.originalDir(id), safeFileName(name, "apk"))
        try {
            original.parentFile!!.mkdirs()
            val (size, sha) = context.contentResolver.openInputStream(uri)?.use { input ->
                original.outputStream().buffered().use { out -> Hashing.copyAndHash(input, out, declaredSize, MAX_APK_BYTES, cancel, progress) }
            } ?: throw ImportException("The selected file could not be opened.")
            original.setReadOnly()
            progress.onProgress(size, size, "Inspecting APK")
            val report = try {
                ApkInspector.inspect(original, name, cancel, sha)
            } catch (e: ApkInspector.InvalidApkException) {
                throw ImportException(e.message ?: "This file is not a valid APK.", e)
            }
            val label = extractIconAndLabel(id, original) ?: report.label
            save(id, REPORT_APK, report, ApkReport.serializer())
            val now = System.currentTimeMillis()
            dao.upsert(
                ProjectEntity(
                    id = id,
                    name = label ?: report.manifest?.packageName ?: name.removeSuffix(".apk"),
                    kind = ProjectKind.APK,
                    framework = report.frameworks.firstOrNull { it.id !in setOf("kotlin", "views", "compose") }?.displayName ?: "Native Android",
                    packageName = report.manifest?.packageName,
                    versionName = report.manifest?.versionName,
                    sizeBytes = size,
                    sha256 = sha,
                    origin = name,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
            ImportOutcome(id, report.warnings)
        } catch (t: Throwable) {
            storage.projectDir(id).deleteRecursivelySafe()
            throw translate(t)
        }
    }

    suspend fun importZip(uri: Uri, progress: ProgressListener, cancel: CancelToken): ImportOutcome = withContext(Dispatchers.IO) {
        val (displayName, declaredSize) = queryName(uri)
        val name = displayName ?: "project.zip"
        val temp = File(storage.tempDir, "${UUID.randomUUID()}.zip")
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                temp.outputStream().buffered().use { out -> Hashing.copyAndHash(input, out, declaredSize, MAX_ARCHIVE_BYTES, cancel, progress) }
            } ?: throw ImportException("The selected file could not be opened.")
            importArchive(temp, name.removeSuffix(".zip"), name, progress, cancel)
        } catch (t: Throwable) {
            throw translate(t)
        } finally {
            temp.delete()
        }
    }

    suspend fun importSample(progress: ProgressListener, cancel: CancelToken): ImportOutcome = withContext(Dispatchers.IO) {
        val temp = File(storage.tempDir, "sample-${UUID.randomUUID()}.zip")
        try {
            context.assets.open(SAMPLE_ASSET).use { input -> temp.outputStream().use { input.copyTo(it) } }
            importArchive(temp, "Sample Notes", "Bundled sample project", progress, cancel)
        } catch (t: Throwable) {
            throw translate(t)
        } finally {
            temp.delete()
        }
    }

    /**
     * Downloads a GitHub repository as a ZIP archive (GitHub's zipball API) and imports it.
     * [token] is used only for this request and never stored.
     */
    suspend fun importGitHub(input: String, ref: String?, token: String?, progress: ProgressListener, cancel: CancelToken): ImportOutcome = withContext(Dispatchers.IO) {
        val (owner, repo) = parseGitHub(input) ?: throw ImportException("Enter a repository as owner/name or a github.com URL.")
        val refPart = ref?.trim()?.takeIf { it.isNotEmpty() }?.let { "/" + it.split('/').joinToString("/") { seg -> Uri.encode(seg) } }.orEmpty()
        val url = URL("https://api.github.com/repos/$owner/$repo/zipball$refPart")
        val temp = File(storage.tempDir, "gh-${UUID.randomUUID()}.zip")
        try {
            val conn = (url.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 20_000
                readTimeout = 60_000
                setRequestProperty("Accept", "application/vnd.github+json")
                setRequestProperty("User-Agent", "AppFixStudio")
                setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
                if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer ${token.trim()}")
            }
            try {
                when (val code = conn.responseCode) {
                    200 -> Unit
                    401 -> throw ImportException("GitHub rejected the access token (401).")
                    403 -> throw ImportException("GitHub refused the request (403). You may have hit the rate limit; try again later or add a token.")
                    404 -> throw ImportException("Repository or branch not found. For private repositories, provide a token with read access.")
                    else -> throw ImportException("GitHub returned HTTP $code.")
                }
                val length = conn.contentLengthLong
                conn.inputStream.use { input -> temp.outputStream().buffered().use { out -> Hashing.copyAndHash(input, out, length, MAX_ARCHIVE_BYTES, cancel, progress) } }
            } finally {
                conn.disconnect()
            }
            importArchive(temp, repo, "github.com/$owner/$repo${ref?.takeIf { it.isNotBlank() }?.let { "@$it" } ?: ""}", progress, cancel)
        } catch (t: Throwable) {
            throw translate(t)
        } finally {
            temp.delete()
        }
    }

    /** Copies a folder picked with the Storage Access Framework into a new workspace. */
    suspend fun importFolder(treeUri: Uri, progress: ProgressListener, cancel: CancelToken): ImportOutcome = withContext(Dispatchers.IO) {
        val tree = DocumentFile.fromTreeUri(context, treeUri) ?: throw ImportException("The folder could not be opened.")
        val id = newId()
        val ws = storage.workspace(id)
        val policy = ExtractionPolicy()
        val skipped = mutableListOf<String>()
        var files = 0
        var bytes = 0L
        try {
            ws.mkdirs()
            fun copy(dir: DocumentFile, target: File, depth: Int) {
                if (depth > 40) throw ImportException("The folder is nested too deeply.")
                for (child in dir.listFiles()) {
                    cancel.throwIfCancelled()
                    val n = child.name ?: continue
                    if (n == "." || n == ".." || n.contains('/') || n.contains('\u0000')) continue
                    if (child.isDirectory) {
                        if (n in BUILD_DIRS) continue
                        copy(child, File(target, n).apply { mkdirs() }, depth + 1)
                    } else if (child.isFile) {
                        if (n.substringAfterLast('.', "").lowercase() in policy.blockedExtensions) { skipped += n; continue }
                        if (++files > policy.maxEntries) throw ImportException("The folder has more than ${policy.maxEntries} files.")
                        val out = File(target, n)
                        context.contentResolver.openInputStream(child.uri)?.use { input ->
                            out.outputStream().buffered().use { o ->
                                val (count, _) = Hashing.copyAndHash(input, o, child.length(), policy.maxEntryBytes, cancel)
                                bytes += count
                            }
                        }
                        if (bytes > policy.maxTotalBytes) throw ImportException("The folder is larger than ${formatBytes(policy.maxTotalBytes)}.")
                        progress.onProgress(bytes, -1, n)
                    }
                }
            }
            copy(tree, ws, 0)
            val warnings = skipped.take(20).map { "Skipped blocked file $it" }
            finishSourceImport(id, tree.name ?: "Folder project", tree.name ?: "Local folder", warnings)
        } catch (t: Throwable) {
            storage.projectDir(id).deleteRecursivelySafe()
            throw translate(t)
        }
    }

    private suspend fun importArchive(archive: File, fallbackName: String, origin: String, progress: ProgressListener, cancel: CancelToken): ImportOutcome {
        val id = newId()
        try {
            progress.onProgress(0, -1, "Extracting")
            val result: ExtractionResult = SafeZipExtractor().extract(archive, storage.workspace(id), cancel, progress)
            val warnings = result.warnings + result.skipped.take(20).map { "Skipped ${it.name} (${it.reason})" } +
                (if (result.skipped.size > 20) listOf("…and ${result.skipped.size - 20} more skipped entries") else emptyList())
            return finishSourceImport(id, fallbackName, origin, warnings)
        } catch (t: Throwable) {
            storage.projectDir(id).deleteRecursivelySafe()
            throw t
        }
    }

    private suspend fun finishSourceImport(id: String, fallbackName: String, origin: String, warnings: List<String>): ImportOutcome {
        val ws = storage.workspace(id)
        if (ws.list().isNullOrEmpty()) throw ImportException("The archive or folder contains no files that can be imported.")
        val info = ProjectDetector.detect(ws)
        save(id, REPORT_PROJECT, info, ProjectInfo.serializer())
        val app = info.appModule
        val now = System.currentTimeMillis()
        dao.upsert(
            ProjectEntity(
                id = id,
                name = appLabel(ws, info) ?: info.root.substringAfterLast('/').takeIf { it.isNotEmpty() } ?: fallbackName,
                kind = ProjectKind.SOURCE,
                framework = info.framework.displayName,
                packageName = app?.applicationId ?: app?.namespace,
                versionName = app?.versionName,
                sizeBytes = storage.sizeOf(ws),
                sha256 = null,
                origin = origin,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return ImportOutcome(id, warnings + info.notes)
    }

    /** Reads app_name from the app module's default strings.xml, if present. */
    private fun appLabel(ws: File, info: ProjectInfo): String? {
        val res = info.appModule?.resDir ?: return null
        val strings = File(File(ws, info.root), "$res/values/strings.xml").takeIf { it.isFile } ?: return null
        return Regex("""<string\s+name="app_name"[^>]*>([^<]{1,80})</string>""").find(strings.readText())?.groupValues?.get(1)?.trim()
    }

    /** Uses the platform PackageManager to render the real launcher icon and label. */
    private fun extractIconAndLabel(id: String, apk: File): String? = try {
        val pm = context.packageManager
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageArchiveInfo(apk.path, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageArchiveInfo(apk.path, 0)
        }
        val ai = info?.applicationInfo
        if (ai != null) {
            ai.sourceDir = apk.path
            ai.publicSourceDir = apk.path
            runCatching {
                val bmp = ai.loadIcon(pm).toBitmap(192, 192)
                storage.iconFile(id).outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }
            ai.loadLabel(pm).toString().takeIf { it.isNotBlank() && it != ai.packageName }
        } else {
            null
        }
    } catch (e: Exception) {
        null
    }

    // ------------------------------------------------------------------ Reports

    fun apkReport(id: String): ApkReport? = load(id, REPORT_APK, ApkReport.serializer())
    fun projectInfo(id: String): ProjectInfo? = load(id, REPORT_PROJECT, ProjectInfo.serializer())
    fun lastAnalysis(id: String): AnalysisReport? = load(id, REPORT_ANALYSIS, AnalysisReport.serializer())

    suspend fun refreshProjectInfo(id: String): ProjectInfo = withContext(Dispatchers.IO) {
        val info = ProjectDetector.detect(storage.workspace(id))
        save(id, REPORT_PROJECT, info, ProjectInfo.serializer())
        info
    }

    suspend fun verifySignature(id: String): SignatureVerification = withContext(Dispatchers.Default) {
        val apk = storage.originalApk(id) ?: throw ImportException("The original APK is missing.")
        ApkSignatureVerifier.verify(apk)
    }

    suspend fun analyze(id: String, cancel: CancelToken): AnalysisReport = withContext(Dispatchers.Default) {
        val info = ProjectDetector.detect(storage.workspace(id))
        save(id, REPORT_PROJECT, info, ProjectInfo.serializer())
        val report = ProjectAnalyzer(storage.workspace(id)).analyze(info, cancel)
        save(id, REPORT_ANALYSIS, report, AnalysisReport.serializer())
        dao.setAnalysisCounts(id, report.errorCount, report.warningCount)
        report
    }

    suspend fun createFix(id: String, finding: Finding): ChangeSet = withContext(Dispatchers.IO) {
        RepairEngine(storage.workspace(id), fixResources()).createFix(finding)
    }

    /** Applies a reviewed change set. A backup is taken first for larger changes when enabled. */
    suspend fun applyChange(id: String, change: ChangeSet, backupFirst: Boolean): ChangeRecord = withContext(Dispatchers.IO) {
        if (backupFirst && change.changes.size >= BACKUP_THRESHOLD) {
            snapshots(id).create("Before: ${change.title}")
        }
        val record = applier(id).apply(change)
        dao.touch(id)
        record
    }

    fun validateChange(id: String, change: ChangeSet): List<String> = applier(id).validate(change)

    suspend fun history(id: String): List<ChangeRecord> = withContext(Dispatchers.IO) { applier(id).history() }

    suspend fun undo(id: String, changeId: String, force: Boolean = false): ChangeRecord = withContext(Dispatchers.IO) {
        applier(id).undo(changeId, force).also { dao.touch(id) }
    }

    suspend fun backups(id: String): List<Snapshot> = withContext(Dispatchers.IO) { snapshots(id).list() }
    suspend fun createBackup(id: String, label: String): Snapshot = withContext(Dispatchers.IO) { snapshots(id).create(label.ifBlank { "Manual backup" }) }
    suspend fun restoreBackup(id: String, snapshotId: String) = withContext(Dispatchers.IO) {
        snapshots(id).restore(snapshotId)
        dao.touch(id)
    }
    suspend fun deleteBackup(id: String, snapshotId: String) = withContext(Dispatchers.IO) { snapshots(id).delete(snapshotId) }

    suspend fun analyzeCrash(id: String?, log: String): CrashReport = withContext(Dispatchers.Default) {
        if (id == null) return@withContext CrashLogAnalyzer.analyze(log)
        val project = dao.get(id)
        val info = if (project?.kind == ProjectKind.SOURCE) projectInfo(id) else null
        val ws = storage.workspace(id).takeIf { it.isDirectory }
        val app = info?.appModule
        val root = info?.root.orEmpty()
        val manifest = app?.manifestPath?.let { if (root.isEmpty()) it else "$root/$it" }
        val declared = mutableSetOf<String>()
        if (ws != null && manifest != null) {
            val text = File(ws, manifest).takeIf { it.isFile }?.readText().orEmpty()
            val ns = app?.namespace ?: app?.applicationId
            Regex("""<activity[^>]*android:name="([^"]+)"""").findAll(text).forEach { m ->
                val n = m.groupValues[1]
                declared += if (n.startsWith(".") && ns != null) ns + n else n
            }
        }
        val packages = listOfNotNull(project?.packageName, app?.namespace, app?.applicationId).distinct()
        CrashLogAnalyzer.analyze(log, packages, ws, manifest, declared)
    }

    suspend fun analyzeBuildLog(id: String?, log: String): BuildLogReport = withContext(Dispatchers.Default) {
        val ws = id?.let { storage.workspace(it).takeIf { d -> d.isDirectory } }
        BuildLogAnalyzer.analyze(log, ws, id?.let { projectInfo(it)?.root }.orEmpty())
    }

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        dao.delete(id)
        storage.projectDir(id).deleteRecursivelySafe()
    }

    suspend fun rename(id: String, name: String) {
        val p = dao.get(id) ?: return
        dao.upsert(p.copy(name = name.trim().take(80).ifEmpty { p.name }, updatedAt = System.currentTimeMillis()))
    }

    // ------------------------------------------------------------------ Helpers

    private fun applier(id: String) = ChangeApplier(storage.workspace(id), storage.historyDir(id))
    private fun snapshots(id: String) = SnapshotManager(storage.workspace(id), storage.backupDir(id))

    private var cachedFixResources: FixResources? = null

    private fun fixResources(): FixResources = cachedFixResources ?: run {
        fun asset(name: String) = runCatching { context.assets.open(name).use { it.readBytes() } }.getOrNull()
        FixResources(
            gradlewScript = asset("bundled/wrapper/gradlew")?.decodeToString(),
            gradlewBat = asset("bundled/wrapper/gradlew.bat")?.decodeToString(),
            wrapperJarBase64 = asset("bundled/wrapper/gradle-wrapper.jar")?.let(B64::encode),
        ).also { cachedFixResources = it }
    }

    private fun <T> save(id: String, name: String, value: T, serializer: KSerializer<T>) {
        File(storage.reportsDir(id), name).writeText(json.encodeToString(serializer, value))
    }

    private fun <T> load(id: String, name: String, serializer: KSerializer<T>): T? =
        File(storage.reportsDir(id), name).takeIf { it.isFile }?.let { f -> runCatching { json.decodeFromString(serializer, f.readText()) }.getOrNull() }

    private fun queryName(uri: Uri): Pair<String?, Long> {
        var name: String? = null
        var size = -1L
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val si = c.getColumnIndex(OpenableColumns.SIZE)
                    if (ni >= 0) name = c.getString(ni)
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
                }
            }
        }
        return name to size
    }

    private fun translate(t: Throwable): Throwable = when (t) {
        is ImportException, is kotlinx.coroutines.CancellationException, is com.appfix.core.util.OperationCancelledException -> t
        is com.appfix.core.archive.ArchiveSecurityException -> ImportException("Import blocked for safety: ${t.message}", t)
        is com.appfix.core.archive.InvalidArchiveException -> ImportException(t.message ?: "The file is not a valid ZIP archive.", t)
        is SizeLimitExceededException -> ImportException(t.message ?: "The file is too large.", t)
        is java.net.UnknownHostException -> ImportException("No internet connection (could not reach ${t.message}).", t)
        is java.net.SocketTimeoutException -> ImportException("The download timed out. Check your connection and try again.", t)
        is IOException -> ImportException("Storage or network error: ${t.message ?: t.javaClass.simpleName}", t)
        else -> ImportException("Import failed: ${t.message ?: t.javaClass.simpleName}", t)
    }

    companion object {
        const val SAMPLE_ASSET = "bundled/sample-project.zip"
        private const val REPORT_APK = "apk-report.json"
        private const val REPORT_PROJECT = "project-info.json"
        private const val REPORT_ANALYSIS = "analysis.json"
        private const val MAX_APK_BYTES = 2L * 1024 * 1024 * 1024
        private const val MAX_ARCHIVE_BYTES = 1L * 1024 * 1024 * 1024
        private const val BACKUP_THRESHOLD = 3
        private val BUILD_DIRS = setOf("build", ".gradle", ".idea", ".cxx", "node_modules", ".dart_tool", ".kotlin")

        fun newId(): String = UUID.randomUUID().toString()

        fun safeFileName(name: String, ext: String): String {
            val base = name.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._ -]"), "_").trim().take(100).ifEmpty { "file" }
            return if (base.endsWith(".$ext", ignoreCase = true)) base else "$base.$ext"
        }

        /** Accepts owner/repo, https://github.com/owner/repo(.git)(/tree/…), or git@github.com:owner/repo.git. */
        fun parseGitHub(input: String): Pair<String, String>? {
            val s = input.trim().removeSuffix("/").removeSuffix(".git")
            val m = Regex("""^(?:https?://)?(?:www\.)?github\.com[/:]([A-Za-z0-9-]{1,39})/([A-Za-z0-9._-]{1,100})""").find(s)
                ?: Regex("""^git@github\.com:([A-Za-z0-9-]{1,39})/([A-Za-z0-9._-]{1,100})$""").find(s)
                ?: Regex("""^([A-Za-z0-9-]{1,39})/([A-Za-z0-9._-]{1,100})$""").find(s)
                ?: return null
            val repo = m.groupValues[2]
            if (repo == "." || repo == "..") return null
            return m.groupValues[1] to repo
        }
    }
}

private fun File.deleteRecursivelySafe() {
    runCatching { walkBottomUp().forEach { it.setWritable(true); it.delete() } }
}

package com.webtecit.filepilot.feature.analyzer

import android.content.Context
import com.webtecit.filepilot.core.common.ApplicationScope
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.PriorityQueue
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SizedEntry(val path: String, val name: String, val bytes: Long, val files: Int = 0)

@Serializable
data class KindTotal(val kind: String, val count: Int, val bytes: Long)

@Serializable
data class AnalysisResult(
    val rootId: String,
    val scannedAt: Long,
    val totalFiles: Int,
    val totalFolders: Int,
    val totalBytes: Long,
    val kinds: List<KindTotal>,
    val topFolders: List<SizedEntry>,
    val largeFolders: List<SizedEntry>,
    val largestFiles: List<SizedEntry>,
    val skipped: Int,
)

data class AnalyzerState(
    val scanning: Boolean = false,
    val rootId: String? = null,
    val scannedFiles: Int = 0,
    val currentFolder: String = "",
    val result: AnalysisResult? = null,
)

/**
 * Walks a storage volume in the background and builds a breakdown by folder and file type.
 * The last result per volume is cached on disk so the screen opens instantly next time.
 */
@Singleton
class StorageAnalyzer @Inject constructor(
    @ApplicationContext private val context: Context,
    @ApplicationScope private val scope: CoroutineScope,
    @IoDispatcher private val io: CoroutineDispatcher,
    private val tasks: com.webtecit.filepilot.core.tasks.BackgroundTasks,
) {
    private val _state = MutableStateFlow(AnalyzerState())
    val state: StateFlow<AnalyzerState> = _state.asStateFlow()
    private var job: Job? = null
    private val json = Json { ignoreUnknownKeys = true }

    fun loadCached(rootId: String) {
        if (_state.value.scanning) return
        scope.launch(io) {
            val cached = runCatching { json.decodeFromString<AnalysisResult>(cacheFile(rootId).readText()) }.getOrNull()
            _state.update { it.copy(rootId = rootId, result = cached) }
        }
    }

    fun scan(rootId: String) {
        job?.cancel()
        _state.value = AnalyzerState(scanning = true, rootId = rootId, result = _state.value.result?.takeIf { it.rootId == rootId })
        job = scope.launch(io) {
            val taskId = tasks.start("Storage analysis", "Scanning…")
            val result = runCatching { analyze(rootId) }.getOrNull()
            if (result != null) tasks.finish(taskId, "${"%,d".format(result.totalFiles)} files analyzed") else tasks.dismiss(taskId)
            _state.update { it.copy(scanning = false, result = result ?: it.result) }
            if (result != null) runCatching { cacheFile(rootId).writeText(json.encodeToString(AnalysisResult.serializer(), result)) }
        }
    }

    fun cancel() {
        job?.cancel()
        tasks.clearAll("Storage analysis")
        _state.update { it.copy(scanning = false) }
    }

    private fun cacheFile(rootId: String) = File(context.cacheDir, "analysis_${rootId.hashCode()}.json")

    private class Counter {
        var files = 0
        var folders = 0
        var skipped = 0
        var lastPublish = 0L
        val kinds = HashMap<FileKind, LongArray>()
        val largestFiles = PriorityQueue<SizedEntry>(compareBy { it.bytes })
        val largeFolders = PriorityQueue<SizedEntry>(compareBy { it.bytes })
    }

    private suspend fun analyze(rootId: String): AnalysisResult {
        val root = File(rootId)
        val counter = Counter()
        val top = ArrayList<SizedEntry>()
        var total = 0L
        for (child in root.listFiles().orEmpty()) {
            currentCoroutineContext().ensureActive()
            val (bytes, files) = if (child.isDirectory) walk(child, 1, counter) else {
                record(child, counter)
                child.length() to 1
            }
            total += bytes
            if (child.isDirectory) top += SizedEntry(child.absolutePath, child.name, bytes, files)
        }
        return AnalysisResult(
            rootId = rootId,
            scannedAt = System.currentTimeMillis(),
            totalFiles = counter.files,
            totalFolders = counter.folders,
            totalBytes = total,
            kinds = counter.kinds.map { (k, v) -> KindTotal(k.name, v[0].toInt(), v[1]) }.sortedByDescending { it.bytes },
            topFolders = top.sortedByDescending { it.bytes },
            largeFolders = counter.largeFolders.sortedByDescending { it.bytes },
            largestFiles = counter.largestFiles.sortedByDescending { it.bytes },
            skipped = counter.skipped,
        )
    }

    /** Returns (bytes, file count) of [dir]. */
    private suspend fun walk(dir: File, depth: Int, counter: Counter): Pair<Long, Int> {
        currentCoroutineContext().ensureActive()
        counter.folders++
        val children = dir.listFiles()
        if (children == null) {
            counter.skipped++
            return 0L to 0
        }
        var bytes = 0L
        var files = 0
        for (c in children) {
            if (c.isDirectory) {
                val (b, f) = walk(c, depth + 1, counter)
                bytes += b
                files += f
            } else {
                record(c, counter)
                bytes += c.length()
                files++
            }
        }
        if (depth in 2..4) offer(counter.largeFolders, SizedEntry(dir.absolutePath, dir.name, bytes, files), 25)
        val now = System.currentTimeMillis()
        if (now - counter.lastPublish > 200) {
            counter.lastPublish = now
            _state.update { it.copy(scannedFiles = counter.files, currentFolder = dir.name) }
            tasks.update("Storage analysis", "${"%,d".format(counter.files)} files · ${dir.name}", null)
        }
        return bytes to files
    }

    private fun record(f: File, counter: Counter) {
        counter.files++
        val size = f.length()
        val kind = FileTypes.kindOf(f.name, false)
        val totals = counter.kinds.getOrPut(kind) { LongArray(2) }
        totals[0]++
        totals[1] += size
        offer(counter.largestFiles, SizedEntry(f.absolutePath, f.name, size), 50)
    }

    private fun offer(queue: PriorityQueue<SizedEntry>, entry: SizedEntry, limit: Int) {
        if (queue.size < limit) queue.add(entry)
        else if (entry.bytes > (queue.peek()?.bytes ?: 0)) {
            queue.poll()
            queue.add(entry)
        }
    }
}

package com.webtecit.filepilot.core.operations

import com.webtecit.filepilot.core.common.ApplicationScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystem
import com.webtecit.filepilot.core.storage.FileSystemResolver
import com.webtecit.filepilot.core.storage.FsError
import com.webtecit.filepilot.core.storage.FsException
import com.webtecit.filepilot.core.storage.NameRules
import com.webtecit.filepilot.core.storage.userMessage
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class ConflictPolicy(val label: String) { REPLACE("Replace"), SKIP("Skip"), KEEP_BOTH("Keep both") }

enum class OperationKind { COPY, MOVE, DELETE }

enum class OperationStatus {
    PREPARING, RUNNING, COMPLETED, FAILED, CANCELLED;

    val finished: Boolean get() = this == COMPLETED || this == FAILED || this == CANCELLED
}

data class OperationError(val name: String, val message: String)

data class FileOperation(
    val id: Long,
    val kind: OperationKind,
    val title: String,
    val status: OperationStatus = OperationStatus.PREPARING,
    val totalItems: Int = 0,
    val doneItems: Int = 0,
    val totalBytes: Long = 0,
    val doneBytes: Long = 0,
    val currentName: String = "",
    val errors: List<OperationError> = emptyList(),
    /** Folders whose content changed, so open screens can refresh. */
    val affectedDirs: Set<String> = emptySet(),
    val succeededIds: List<String> = emptyList(),
) {
    val progress: Float?
        get() = when {
            totalBytes > 0 -> (doneBytes.toFloat() / totalBytes).coerceIn(0f, 1f)
            totalItems > 0 -> (doneItems.toFloat() / totalItems).coerceIn(0f, 1f)
            else -> null
        }

    val summary: String
        get() = when (status) {
            OperationStatus.PREPARING -> "Preparing…"
            OperationStatus.RUNNING ->
                if (totalBytes > 0) "${Formatters.size(doneBytes)} of ${Formatters.size(totalBytes)}"
                else "$doneItems of $totalItems"
            OperationStatus.COMPLETED -> when (kind) {
                OperationKind.COPY -> "Copied"
                OperationKind.MOVE -> "Moved"
                OperationKind.DELETE -> "Deleted"
            }
            OperationStatus.FAILED -> Formatters.count(errors.size, "problem")
            OperationStatus.CANCELLED -> "Cancelled. Partly copied files were removed."
        }
}

/**
 * Runs copy, move and delete operations outside any screen so they continue while the user
 * browses. Progress is published as [operations]; each can be cancelled.
 *
 * Safety rules:
 *  - Files are written to a hidden temporary name and renamed only when complete.
 *  - "Replace" keeps the old file until the new copy is complete (renamed to a backup first).
 *  - A move deletes the source only after its copy finished without any error.
 *  - Cancelling removes the partly written file.
 */
@Singleton
class FileOperationManager @Inject constructor(
    private val resolver: FileSystemResolver,
    @ApplicationScope private val scope: CoroutineScope,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    private val _operations = MutableStateFlow<List<FileOperation>>(emptyList())
    val operations: StateFlow<List<FileOperation>> = _operations.asStateFlow()

    private val _finished = MutableSharedFlow<FileOperation>(extraBufferCapacity = 32)
    /** Emits each operation once when it finishes. */
    val finished: SharedFlow<FileOperation> = _finished.asSharedFlow()

    private val jobs = ConcurrentHashMap<Long, Job>()

    /** Called whenever an operation starts (the app uses it to start its progress service). */
    @Volatile var onActivity: (() -> Unit)? = null
    private val nextId = AtomicLong(1)

    /** Names in [targetDirId] that the pasted items would collide with. */
    suspend fun conflicts(sources: List<FileItem>, targetDirId: String): List<String> = withContext(io) {
        val existing = resolver.of(targetDirId).list(targetDirId).mapTo(HashSet()) { it.name.lowercase() }
        sources.filter { it.name.lowercase() in existing }.map { it.name }
    }

    fun transfer(sources: List<FileItem>, targetDirId: String, move: Boolean, policy: ConflictPolicy): Long {
        val kind = if (move) OperationKind.MOVE else OperationKind.COPY
        val verb = if (move) "Moving" else "Copying"
        val id = start(FileOperation(nextId.getAndIncrement(), kind, "$verb ${itemsLabel(sources)}"))
        launch(id) { tracker ->
            val targetFs = resolver.of(targetDirId)
            val fastMove = move && sources.all { resolver.of(it.id) === targetFs }
            if (fastMove) {
                tracker.setTotals(sources.size, 0)
            } else {
                var items = 0
                var bytes = 0L
                for (s in sources) {
                    val (i, b) = measure(s)
                    items += i
                    bytes += b
                }
                tracker.setTotals(items, bytes)
                val free = targetFs.freeSpace(targetDirId)
                if (free != null && bytes > free) {
                    throw FsException(
                        FsError.NO_SPACE,
                        "Not enough space: ${Formatters.size(bytes)} needed, ${Formatters.size(free)} free.",
                    )
                }
            }
            tracker.affected(targetDirId)
            val existing = targetFs.list(targetDirId).associateByTo(HashMap()) { it.name.lowercase() }
            for (source in sources) {
                currentCoroutineContext().ensureActive()
                tracker.guard(source.name) {
                    resolver.of(source.id).parentId(source.id)?.let(tracker::affected)
                    val placed = place(source, targetDirId, existing, policy, move, fastMove, tracker)
                    if (placed) tracker.succeeded(source.id)
                }
            }
        }
        return id
    }

    fun delete(items: List<FileItem>): Long {
        val id = start(FileOperation(nextId.getAndIncrement(), OperationKind.DELETE, "Deleting ${itemsLabel(items)}"))
        launch(id) { tracker ->
            var total = 0
            for (item in items) {
                val fs = resolver.of(item.id)
                total += if (item.isDirectory && !fs.nativeRecursiveDelete) measure(item).first else 1
            }
            tracker.setTotals(total, 0)
            for (item in items) {
                currentCoroutineContext().ensureActive()
                tracker.guard(item.name) {
                    val fs = resolver.of(item.id)
                    fs.parentId(item.id)?.let(tracker::affected)
                    deleteTree(fs, item, tracker)
                    tracker.succeeded(item.id)
                }
            }
        }
        return id
    }

    fun cancel(id: Long) {
        jobs[id]?.cancel()
    }

    fun dismiss(id: Long) {
        _operations.update { list -> list.filterNot { it.id == id && it.status.finished } }
    }

    // ---------------------------------------------------------------------------------------

    /** Places one item in [targetDirId]. Returns false when it was skipped. */
    private suspend fun place(
        source: FileItem,
        targetDirId: String,
        existing: MutableMap<String, FileItem>,
        policy: ConflictPolicy,
        move: Boolean,
        fastMove: Boolean,
        tracker: Tracker,
    ): Boolean {
        val sourceFs = resolver.of(source.id)
        val targetFs = resolver.of(targetDirId)
        if (source.isDirectory && sourceFs === targetFs && sourceFs.isAncestor(source.id, targetDirId)) {
            throw FsException(FsError.INVALID_NAME, "A folder can't be ${if (move) "moved" else "copied"} into itself.")
        }
        tracker.current(source.name)
        var name = source.name
        val clash = existing[name.lowercase()]
        var replace: FileItem? = null
        var merge: FileItem? = null
        if (clash != null) {
            val sameItem = clash.id == source.id
            when {
                sameItem && policy == ConflictPolicy.KEEP_BOTH ->
                    name = NameRules.uniqueName(name, existing.values.map { it.name }, source.isDirectory)
                sameItem -> {
                    tracker.skip(source, if (fastMove) 1 to 0L else measure(source))
                    return false
                }
                policy == ConflictPolicy.SKIP -> {
                    tracker.skip(source, if (fastMove) 1 to 0L else measure(source))
                    return false
                }
                policy == ConflictPolicy.KEEP_BOTH ->
                    name = NameRules.uniqueName(name, existing.values.map { it.name }, source.isDirectory)
                clash.isDirectory && source.isDirectory -> merge = clash
                else -> replace = clash
            }
        }

        if (move && replace == null && merge == null && sourceFs === targetFs) {
            val moved = sourceFs.moveFast(source, targetDirId, name)
            if (moved != null) {
                existing[moved.name.lowercase()] = moved
                tracker.itemsDone(if (fastMove) 1 else measure(source).first)
                return true
            }
        }

        val errorsBefore = tracker.errorCount
        val result = when {
            merge != null -> {
                val into: FileItem = merge
                tracker.itemsDone(1)
                val children = targetFs.list(into.id).associateByTo(HashMap()) { it.name.lowercase() }
                for (child in sourceFs.list(source.id)) {
                    currentCoroutineContext().ensureActive()
                    tracker.guard(child.name) { place(child, into.id, children, policy, false, false, tracker) }
                }
                into
            }
            source.isDirectory -> copyDirectory(source, targetDirId, name, replace, tracker)
            else -> copyFile(source, targetDirId, name, replace, tracker)
        }
        existing[result.name.lowercase()] = result
        if (move && tracker.errorCount == errorsBefore) {
            // Only now, with a complete copy, remove the original.
            deleteTree(sourceFs, source, null)
        }
        return tracker.errorCount == errorsBefore
    }

    private suspend fun copyDirectory(
        source: FileItem,
        targetDirId: String,
        name: String,
        replace: FileItem?,
        tracker: Tracker,
    ): FileItem {
        val sourceFs = resolver.of(source.id)
        val targetFs = resolver.of(targetDirId)
        val buildName = if (replace != null) tempName(name) else name
        val dir = targetFs.createDirectory(targetDirId, buildName)
        tracker.itemsDone(1)
        val children = HashMap<String, FileItem>()
        val errorsBefore = tracker.errorCount
        for (child in sourceFs.list(source.id)) {
            currentCoroutineContext().ensureActive()
            tracker.guard(child.name) {
                val copied = if (child.isDirectory) copyDirectory(child, dir.id, child.name, null, tracker)
                else copyFile(child, dir.id, child.name, null, tracker)
                children[child.name.lowercase()] = copied
            }
        }
        if (replace == null) return dir
        if (tracker.errorCount != errorsBefore) {
            throw FsException(FsError.IO, "\"$name\" was not replaced because some files couldn't be copied.")
        }
        return swapIn(targetFs, dir, replace, name)
    }

    private suspend fun copyFile(
        source: FileItem,
        targetDirId: String,
        name: String,
        replace: FileItem?,
        tracker: Tracker,
    ): FileItem {
        val sourceFs = resolver.of(source.id)
        val targetFs = resolver.of(targetDirId)
        tracker.current(source.name)
        val temp = tempName(name)
        targetFs.childOf(targetDirId, temp)?.let { targetFs.delete(it.id) }
        val partial = targetFs.createFile(targetDirId, temp)
        try {
            sourceFs.openInput(source.id).use { input ->
                targetFs.openOutput(partial.id).use { output -> copyStream(input, output, tracker) }
            }
        } catch (t: Throwable) {
            withContext(NonCancellable) { runCatching { targetFs.delete(partial.id) } }
            throw t
        }
        targetFs.setLastModified(partial.id, source.lastModified)
        tracker.itemsDone(1)
        val finalItem = if (replace != null) swapIn(targetFs, partial, replace, name) else targetFs.rename(partial.id, name)
        return finalItem
    }

    /** Replaces [old] with the completed [fresh] copy, restoring [old] if the final rename fails. */
    private suspend fun swapIn(fs: FileSystem, fresh: FileItem, old: FileItem, finalName: String): FileItem {
        val backup = fs.rename(old.id, backupName(finalName))
        val placed = try {
            fs.rename(fresh.id, finalName)
        } catch (e: Exception) {
            runCatching { fs.rename(backup.id, finalName) }
            throw e
        }
        withContext(NonCancellable) { runCatching { deleteTree(fs, backup, null) } }
        return placed
    }

    private suspend fun deleteTree(fs: FileSystem, item: FileItem, tracker: Tracker?) {
        currentCoroutineContext().ensureActive()
        tracker?.current(item.name)
        if (item.isDirectory && !fs.nativeRecursiveDelete) {
            for (child in fs.list(item.id)) deleteTree(fs, child, tracker)
        }
        fs.delete(item.id)
        tracker?.itemsDone(1)
    }

    private suspend fun measure(item: FileItem): Pair<Int, Long> {
        if (!item.isDirectory) return 1 to item.size
        currentCoroutineContext().ensureActive()
        var items = 1
        var bytes = 0L
        val children = runCatching { resolver.of(item.id).list(item.id) }.getOrDefault(emptyList())
        for (child in children) {
            val (i, b) = measure(child)
            items += i
            bytes += b
        }
        return items to bytes
    }

    private suspend fun copyStream(input: InputStream, output: OutputStream, tracker: Tracker) {
        val buffer = ByteArray(BUFFER_SIZE)
        while (true) {
            currentCoroutineContext().ensureActive()
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            tracker.bytes(read.toLong())
        }
        output.flush()
    }

    private fun start(op: FileOperation): Long {
        _operations.update { it + op }
        runCatching { onActivity?.invoke() }
        return op.id
    }

    private fun launch(id: Long, block: suspend (Tracker) -> Unit) {
        val tracker = Tracker(id)
        val job = scope.launch(io) {
            try {
                block(tracker)
                finish(tracker, if (tracker.errorCount == 0) OperationStatus.COMPLETED else OperationStatus.FAILED)
            } catch (e: CancellationException) {
                finish(tracker, OperationStatus.CANCELLED)
                throw e
            } catch (e: Exception) {
                tracker.error("", e)
                finish(tracker, OperationStatus.FAILED)
            } finally {
                jobs.remove(id)
            }
        }
        jobs[id] = job
    }

    private fun finish(tracker: Tracker, status: OperationStatus) {
        tracker.publish(force = true, status = status)
        _operations.value.firstOrNull { it.id == tracker.id }?.let { _finished.tryEmit(it) }
    }

    private fun tempName(name: String): String = clampName(".$name.fmp-part")

    private fun backupName(name: String): String = clampName(".$name.fmp-old")

    private fun clampName(name: String): String =
        if (name.toByteArray().size <= 240) name else ".fmp-${System.nanoTime()}"

    private fun itemsLabel(items: List<FileItem>): String =
        if (items.size == 1) "\"${items[0].name}\"" else Formatters.count(items.size, "item")

    /** Collects progress and publishes it at most every [PUBLISH_INTERVAL_MS] to keep the UI smooth. */
    private inner class Tracker(val id: Long) {
        private var totalItems = 0
        private var totalBytes = 0L
        private var doneItems = 0
        private var doneBytes = 0L
        private var currentName = ""
        private val errors = ArrayList<OperationError>()
        private val affected = LinkedHashSet<String>()
        private val succeeded = ArrayList<String>()
        private var lastPublish = 0L

        val errorCount: Int @Synchronized get() = errors.size

        @Synchronized fun setTotals(items: Int, bytes: Long) {
            totalItems = items
            totalBytes = bytes
            publish(force = true, status = OperationStatus.RUNNING)
        }

        @Synchronized fun current(name: String) {
            currentName = name
            publish()
        }

        @Synchronized fun itemsDone(n: Int) {
            doneItems += n
            publish()
        }

        @Synchronized fun bytes(n: Long) {
            doneBytes += n
            publish()
        }

        @Synchronized fun skip(item: FileItem, measured: Pair<Int, Long>) {
            doneItems += measured.first
            doneBytes += measured.second
            publish()
        }

        @Synchronized fun affected(dirId: String) {
            affected += dirId
        }

        @Synchronized fun succeeded(id: String) {
            succeeded += id
        }

        @Synchronized fun error(name: String, e: Throwable) {
            errors += OperationError(name, e.userMessage())
            publish(force = true)
        }

        /** Runs [block], recording a failure for [name] instead of stopping the whole operation. */
        suspend fun guard(name: String, block: suspend () -> Unit) {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error(name, e)
            }
        }

        @Synchronized fun publish(force: Boolean = false, status: OperationStatus? = null) {
            val now = System.currentTimeMillis()
            if (!force && now - lastPublish < PUBLISH_INTERVAL_MS) return
            lastPublish = now
            _operations.update { list ->
                list.map { op ->
                    if (op.id != id) op
                    else op.copy(
                        status = status ?: if (op.status == OperationStatus.PREPARING) op.status else OperationStatus.RUNNING,
                        totalItems = totalItems,
                        doneItems = doneItems.coerceAtMost(maxOf(totalItems, doneItems)),
                        totalBytes = totalBytes,
                        doneBytes = doneBytes,
                        currentName = currentName,
                        errors = errors.toList(),
                        affectedDirs = affected.toSet(),
                        succeededIds = succeeded.toList(),
                    )
                }
            }
        }
    }

    private companion object {
        const val BUFFER_SIZE = 256 * 1024
        const val PUBLISH_INTERVAL_MS = 100L
    }
}

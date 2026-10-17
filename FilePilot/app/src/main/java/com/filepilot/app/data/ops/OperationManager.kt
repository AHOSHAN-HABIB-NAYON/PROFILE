package com.filepilot.app.data.ops

import android.os.SystemClock
import android.provider.DocumentsContract
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.LocalStore
import com.filepilot.app.data.OperationStatus
import com.filepilot.app.data.archive.ZipArchives
import com.filepilot.app.data.files.DirHandle
import com.filepilot.app.data.files.FileAccessException
import com.filepilot.app.data.files.FileRepository
import com.filepilot.app.data.files.LocalDir
import com.filepilot.app.data.files.LocalFiles
import com.filepilot.app.data.files.userMessage
import com.filepilot.app.core.util.MimeTypes
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class OpKind(val verb: String) {
    COPY("Copying"), MOVE("Moving"), DELETE("Deleting"), COMPRESS("Compressing"), EXTRACT("Extracting"), HASH("Scanning")
}

data class OperationProgress(
    val kind: OpKind,
    val title: String,
    val currentName: String = "",
    val doneBytes: Long = 0,
    val totalBytes: Long = 0,
    val doneItems: Int = 0,
    val totalItems: Int = 0,
) {
    /** 0..1 when the total is known, null for indeterminate progress. */
    val fraction: Float?
        get() = when {
            totalBytes > 0 -> (doneBytes.toFloat() / totalBytes).coerceIn(0f, 1f)
            totalItems > 0 -> (doneItems.toFloat() / totalItems).coerceIn(0f, 1f)
            else -> null
        }
}

data class OperationResult(val kind: OpKind, val status: OperationStatus, val message: String)

/**
 * Runs long file operations one at a time on a background dispatcher, with real progress,
 * cancellation and a record in the local operation history. Nothing here runs unless the
 * user started it.
 */
class OperationManager(
    private val repo: FileRepository,
    private val store: LocalStore,
    private val scope: CoroutineScope,
) {
    private val _progress = MutableStateFlow<OperationProgress?>(null)
    val progress: StateFlow<OperationProgress?> = _progress.asStateFlow()

    private val _results = MutableSharedFlow<OperationResult>(extraBufferCapacity = 8)
    val results: SharedFlow<OperationResult> = _results.asSharedFlow()

    /** Increments after every finished operation so screens know to reload. */
    private val _version = MutableStateFlow(0)
    val version: StateFlow<Int> = _version.asStateFlow()

    private var job: Job? = null
    val isBusy: Boolean get() = job?.isActive == true

    fun cancel() {
        job?.cancel()
    }

    /** Bump the change counter after quick operations (rename, new folder) done elsewhere. */
    fun notifyChanged() {
        _version.value++
    }

    private class Ctx(val kind: OpKind, var progress: OperationProgress) {
        val newPaths = mutableListOf<String>()
        val removedPaths = mutableListOf<String>()
        val removedIds = mutableSetOf<String>()
        var failures = 0
        var firstError: String? = null
        var lastEmit = 0L
        var bytes = 0L
    }

    private fun launchOp(
        kind: OpKind,
        title: String,
        historyTitle: String,
        itemCount: Int,
        block: suspend (Ctx) -> Unit,
    ): Boolean {
        if (isBusy) return false
        val ctx = Ctx(kind, OperationProgress(kind, title))
        _progress.value = ctx.progress
        job = scope.launch {
            var status = OperationStatus.FAILED
            var message = ""
            try {
                block(ctx)
                status = if (ctx.failures == 0) OperationStatus.SUCCESS else OperationStatus.PARTIAL
                message = if (ctx.failures == 0) "$historyTitle complete" else "$historyTitle finished with ${ctx.failures} error(s): ${ctx.firstError}"
            } catch (e: CancellationException) {
                status = OperationStatus.CANCELLED
                message = "$historyTitle cancelled"
            } catch (e: Throwable) {
                status = OperationStatus.FAILED
                message = e.userMessage()
            }
            withContext(NonCancellable) {
                repo.scan(ctx.newPaths + ctx.removedPaths)
                if (ctx.removedIds.isNotEmpty()) store.forget(ctx.removedIds)
                val detail = when (status) {
                    OperationStatus.SUCCESS -> "${Format.items(itemCount)}" + if (ctx.bytes > 0) " · ${Format.size(ctx.bytes)}" else ""
                    else -> message
                }
                store.addHistory(historyTitle, detail, status, itemCount, ctx.bytes)
                _progress.value = null
                _version.value++
                _results.emit(OperationResult(kind, status, message))
            }
        }
        return true
    }

    private suspend fun checkActive() {
        val job = currentCoroutineContext()[Job]
        if (job != null && !job.isActive) throw CancellationException()
    }

    private fun update(ctx: Ctx, force: Boolean = false, transform: (OperationProgress) -> OperationProgress) {
        ctx.progress = transform(ctx.progress)
        val now = SystemClock.elapsedRealtime()
        if (force || now - ctx.lastEmit > 80) {
            ctx.lastEmit = now
            _progress.value = ctx.progress
        }
    }

    // ------------------------------------------------------------------ Copy / move

    fun copy(items: List<FileItem>, destination: Location, move: Boolean): Boolean {
        val kind = if (move) OpKind.MOVE else OpKind.COPY
        val label = if (move) "Move" else "Copy"
        return launchOp(kind, "${kind.verb} ${Format.items(items.size)}", label, items.size) { ctx ->
            if (move && items.any { it.source == SourceKind.MEDIA }) throw FileAccessException(FileRepository.MEDIA_READ_ONLY)
            items.forEach { validateTarget(it, destination) }
            val dest = repo.dirHandle(destination)

            val total = items.sumOf { measure(it) }
            update(ctx, true) { it.copy(totalBytes = total, totalItems = items.size) }
            val free = dest.freeBytes()
            val needsSpace = !(move && items.all { sameLocalVolume(it, destination) })
            if (needsSpace && free in 0 until total) {
                throw FileAccessException("Not enough free space: ${Format.size(total)} needed, ${Format.size(free)} available")
            }

            for ((index, item) in items.withIndex()) {
                checkActive()
                try {
                    if (move && tryFastMove(item, destination, ctx)) {
                        update(ctx) { it.copy(doneBytes = it.doneBytes + measureCached(item)) }
                    } else {
                        copyRecursive(item, dest, ctx)
                        if (move) deleteRecursive(item, ctx, countProgress = false)
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Throwable) {
                    ctx.failures++
                    if (ctx.firstError == null) ctx.firstError = "${item.name}: ${e.userMessage()}"
                }
                update(ctx, true) { it.copy(doneItems = index + 1) }
            }
            ctx.bytes = ctx.progress.doneBytes
            if (ctx.failures == items.size) throw FileAccessException(ctx.firstError ?: "$label failed")
        }
    }

    private val sizeCache = HashMap<String, Long>()
    private fun measureCached(item: FileItem): Long = sizeCache[item.id] ?: 0L

    private suspend fun measure(item: FileItem): Long {
        checkActive()
        val size = if (!item.isDirectory) item.size.coerceAtLeast(0) else {
            val loc = item.asLocation() ?: return 0
            repo.list(loc, showHidden = true).sumOf { measure(it) }
        }
        sizeCache[item.id] = size
        return size
    }

    private fun sameLocalVolume(item: FileItem, dest: Location): Boolean {
        if (item.source != SourceKind.LOCAL || dest !is Location.Local) return false
        val src = item.path ?: return false
        val primary = LocalFiles.primaryRoot
        return src.startsWith(primary) == dest.path.startsWith(primary)
    }

    private fun validateTarget(item: FileItem, dest: Location) {
        when {
            item.source == SourceKind.LOCAL && dest is Location.Local && item.isDirectory -> {
                val src = File(item.path!!).canonicalPath
                val dst = File(dest.path).canonicalPath
                if (dst == src || dst.startsWith("$src/")) throw FileAccessException("Can't place a folder inside itself")
            }
            item.source == SourceKind.SAF && dest is Location.Saf && item.isDirectory && item.treeUri == dest.treeUri -> {
                if (item.documentId == dest.documentId) throw FileAccessException("Can't place a folder inside itself")
                val inside = runCatching {
                    DocumentsContract.isChildDocument(
                        repo.resolver, item.uri, repo.saf.documentUri(dest.treeUri, dest.documentId),
                    )
                }.getOrDefault(false)
                if (inside) throw FileAccessException("Can't place a folder inside itself")
            }
        }
    }

    /** Same-volume local moves are a rename: instant, no extra space. */
    private fun tryFastMove(item: FileItem, dest: Location, ctx: Ctx): Boolean {
        if (item.source != SourceKind.LOCAL || dest !is Location.Local) return false
        val src = File(item.path ?: return false)
        val dir = LocalDir(File(dest.path))
        if (src.parentFile?.absolutePath == File(dest.path).absolutePath) {
            throw FileAccessException("Already in this folder")
        }
        val target = File(dest.path, dir.uniqueName(src.name, src.isDirectory))
        if (!src.renameTo(target)) return false
        ctx.removedPaths += src.absolutePath
        ctx.newPaths += target.absolutePath
        ctx.removedIds += item.id
        return true
    }

    private suspend fun copyRecursive(item: FileItem, dest: DirHandle, ctx: Ctx) {
        checkActive()
        if (item.isDirectory) {
            val loc = item.asLocation() ?: throw FileAccessException("Can't read ${item.name}")
            val sub = dest.childDir(item.name)
            for (child in repo.list(loc, showHidden = true)) copyRecursive(child, sub, ctx)
            return
        }
        update(ctx) { it.copy(currentName = item.name) }
        val (out, created) = dest.createFile(item.name, item.mimeType)
        try {
            repo.openInput(item).use { input -> out.use { output -> pump(input, output, ctx) } }
            created.path?.let { ctx.newPaths += it }
        } catch (e: Throwable) {
            runCatching { out.close() }
            created.delete()
            throw e
        }
    }

    private suspend fun pump(input: InputStream, output: OutputStream, ctx: Ctx, limit: Long = Long.MAX_VALUE): Long {
        val buffer = ByteArray(BUFFER)
        var total = 0L
        while (true) {
            checkActive()
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            total += read
            if (total > limit) throw FileAccessException("Not enough free space to finish")
            update(ctx) { it.copy(doneBytes = it.doneBytes + read) }
        }
        output.flush()
        return total
    }

    // ------------------------------------------------------------------ Delete

    fun delete(items: List<FileItem>): Boolean =
        launchOp(OpKind.DELETE, "Deleting ${Format.items(items.size)}", "Delete", items.size) { ctx ->
            if (items.any { it.source == SourceKind.MEDIA }) throw FileAccessException(FileRepository.MEDIA_READ_ONLY)
            update(ctx, true) { it.copy(totalItems = items.size) }
            for ((index, item) in items.withIndex()) {
                checkActive()
                try {
                    deleteRecursive(item, ctx, countProgress = true)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Throwable) {
                    ctx.failures++
                    if (ctx.firstError == null) ctx.firstError = "${item.name}: ${e.userMessage()}"
                }
                update(ctx, true) { it.copy(doneItems = index + 1) }
            }
            if (ctx.failures == items.size) throw FileAccessException(ctx.firstError ?: "Delete failed")
        }

    private suspend fun deleteRecursive(item: FileItem, ctx: Ctx, countProgress: Boolean) {
        when (item.source) {
            SourceKind.LOCAL -> deleteLocal(File(item.path ?: return), ctx)
            SourceKind.SAF -> {
                update(ctx) { it.copy(currentName = item.name) }
                repo.saf.delete(item)
            }
            SourceKind.MEDIA -> throw FileAccessException(FileRepository.MEDIA_READ_ONLY)
        }
        ctx.removedIds += item.id
    }

    private suspend fun deleteLocal(file: File, ctx: Ctx) {
        checkActive()
        if (LocalFiles.isRestricted(file.absolutePath)) throw FileAccessException("Protected system folder")
        if (file.isDirectory) {
            file.listFiles()?.forEach { deleteLocal(it, ctx) }
        }
        update(ctx) { it.copy(currentName = file.name) }
        if (!file.delete() && file.exists()) {
            throw FileAccessException(repo.writeDeniedMessage(file.parent ?: file.path))
        }
        ctx.removedPaths += file.absolutePath
    }

    // ------------------------------------------------------------------ Compress

    fun compress(items: List<FileItem>, destination: Location, archiveName: String): Boolean =
        launchOp(OpKind.COMPRESS, "Compressing ${Format.items(items.size)}", "Compress", items.size) { ctx ->
            val total = items.sumOf { measure(it) }
            update(ctx, true) { it.copy(totalBytes = total, totalItems = items.size) }
            val dest = repo.dirHandle(destination)
            val name = if (archiveName.endsWith(".zip", true)) archiveName else "$archiveName.zip"
            val (out, created) = dest.createFile(name, "application/zip")
            try {
                ZipOutputStream(out.buffered()).use { zip ->
                    for (item in items) addToZip(zip, item, "", ctx)
                }
                created.path?.let { ctx.newPaths += it }
            } catch (e: Throwable) {
                runCatching { out.close() }
                created.delete()
                throw e
            }
            ctx.bytes = total
        }

    private suspend fun addToZip(zip: ZipOutputStream, item: FileItem, prefix: String, ctx: Ctx) {
        checkActive()
        val entryName = prefix + item.name
        if (item.isDirectory) {
            zip.putNextEntry(ZipEntry("$entryName/").apply { time = item.lastModified })
            zip.closeEntry()
            val loc = item.asLocation() ?: return
            for (child in repo.list(loc, showHidden = true)) addToZip(zip, child, "$entryName/", ctx)
            return
        }
        update(ctx) { it.copy(currentName = item.name) }
        zip.putNextEntry(ZipEntry(entryName).apply { if (item.lastModified > 0) time = item.lastModified })
        repo.openInput(item).use { pump(it, zip, ctx) }
        zip.closeEntry()
    }

    // ------------------------------------------------------------------ Extract

    /**
     * Extracts [archive] into a new folder inside [destination]. When [selection] is given, only
     * those entry paths (and their children) are extracted, relative to [basePath].
     */
    fun extract(
        archive: FileItem,
        destination: Location,
        selection: Set<String>? = null,
        basePath: String = "",
        intoNewFolder: Boolean = true,
    ): Boolean = launchOp(OpKind.EXTRACT, "Extracting ${archive.name}", "Extract", 1) { ctx ->
        ZipArchives.ensureZip(archive)
        val entries = ZipArchives.list(repo, archive).filterNot { it.isDirectory }
        val wanted = entries.filter { e -> selection == null || selection.any { s -> e.path == s || e.path.startsWith("$s/") } }
        val total = wanted.sumOf { it.size.coerceAtLeast(0) }
        update(ctx, true) { it.copy(totalBytes = total, totalItems = wanted.size) }

        val base = repo.dirHandle(destination)
        val free = base.freeBytes()
        if (free in 0 until total) {
            throw FileAccessException("Not enough free space: ${Format.size(total)} needed, ${Format.size(free)} available")
        }
        val root = if (intoNewFolder) base.childDir(archive.name.substringBeforeLast('.')) else base
        val dirCache = HashMap<String, DirHandle>()
        val wantedPaths = wanted.mapTo(HashSet()) { it.path }
        val job = currentCoroutineContext()[Job]
        var blocked = 0
        var written = 0L
        var done = 0
        val spaceLimit = if (free > 0) free else Long.MAX_VALUE

        ZipArchives.forEachEntry(repo, archive) { entry, input ->
            if (job != null && !job.isActive) throw CancellationException()
            if (entry.isDirectory) return@forEachEntry
            val segments = ZipArchives.safeSegments(entry.name)
            if (segments == null) {
                blocked++
                return@forEachEntry
            }
            val path = segments.joinToString("/")
            if (path !in wantedPaths) return@forEachEntry
            val relative = if (basePath.isNotEmpty() && path.startsWith("$basePath/")) path.removePrefix("$basePath/") else path
            val relSegments = relative.split('/')
            var dir = root
            var key = ""
            for (seg in relSegments.dropLast(1)) {
                key = if (key.isEmpty()) seg else "$key/$seg"
                dir = dirCache.getOrPut(key) { dir.childDir(seg, reuse = true) }
            }
            val fileName = relSegments.last()
            update(ctx) { it.copy(currentName = fileName) }
            val (out, created) = dir.createFile(fileName, MimeTypes.fromName(fileName))
            try {
                out.use { o ->
                    val buffer = ByteArray(BUFFER)
                    while (true) {
                        if (job != null && !job.isActive) throw CancellationException()
                        val read = input.read(buffer)
                        if (read < 0) break
                        o.write(buffer, 0, read)
                        written += read
                        if (written > spaceLimit) throw FileAccessException("Not enough free space to finish")
                        update(ctx) { it.copy(doneBytes = it.doneBytes + read) }
                    }
                }
                created.path?.let { ctx.newPaths += it }
            } catch (e: Throwable) {
                runCatching { out.close() }
                created.delete()
                throw e
            }
            done++
            update(ctx) { it.copy(doneItems = done) }
        }
        ctx.bytes = written
        if (blocked > 0) {
            ctx.failures += blocked
            ctx.firstError = "$blocked unsafe entr${if (blocked == 1) "y was" else "ies were"} skipped"
        }
    }

    private companion object {
        const val BUFFER = 256 * 1024
    }
}

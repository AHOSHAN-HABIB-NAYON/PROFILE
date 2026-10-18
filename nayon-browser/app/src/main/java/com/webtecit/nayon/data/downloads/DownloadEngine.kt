package com.webtecit.nayon.data.downloads

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max
import kotlin.math.min

/** Everything needed to start a download from a web page. */
data class DownloadRequest(
    val url: String,
    val fileName: String,
    val mimeType: String?,
    val userAgent: String?,
    val cookies: String?,
    val referer: String?,
    val isPrivate: Boolean,
)

/** Fast-changing progress, kept in memory (the database is updated every few seconds). */
data class LiveProgress(val downloaded: Long, val total: Long, val bytesPerSecond: Long, val connections: Int)

sealed interface DownloadNotice {
    data class Finished(val id: Long, val fileName: String) : DownloadNotice
    data class Failed(val id: Long, val fileName: String) : DownloadNotice
}

/**
 * NAYON's download engine.
 *
 * - Up to [MAX_CONNECTIONS] parallel HTTP range requests per file.
 * - Work stealing: when a connection finishes its part, it takes over half of the largest
 *   remaining part, so all connections stay busy until the very end.
 * - True pause / resume (also after the app restarts), automatic retries.
 * - Files go straight to the public Downloads folder (Android 10+) or the app's own
 *   Downloads folder on Android 7–9 (no storage permission needed).
 */
class DownloadEngine(private val context: Context, private val dao: DownloadDao) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = ConcurrentHashMap<Long, Job>()
    private val stopReason = ConcurrentHashMap<Long, Stop>()
    private enum class Stop { PAUSE, DELETE }

    val records: Flow<List<DownloadRecord>> = dao.all()

    private val _live = MutableStateFlow<Map<Long, LiveProgress>>(emptyMap())
    val live: StateFlow<Map<Long, LiveProgress>> = _live.asStateFlow()

    private val _active = MutableStateFlow(0)
    val activeCount: StateFlow<Int> = _active.asStateFlow()

    private val _notices = MutableSharedFlow<DownloadNotice>(extraBufferCapacity = 8)
    val notices: SharedFlow<DownloadNotice> = _notices

    init {
        scope.launch { dao.markInterrupted() }
    }

    // ---- Public API --------------------------------------------------------------------

    suspend fun enqueue(request: DownloadRequest): Long {
        val id = dao.insert(
            DownloadRecord(
                url = request.url,
                fileName = sanitize(request.fileName),
                mimeType = request.mimeType,
                createdAt = System.currentTimeMillis(),
                sourceHost = runCatching { Uri.parse(request.referer ?: request.url).host.orEmpty() }.getOrDefault("").removePrefix("www."),
                userAgent = request.userAgent,
                cookies = request.cookies,
                referer = request.referer,
                isPrivate = request.isPrivate,
            ),
        )
        start(id)
        return id
    }

    /** Saves a `data:` URL (e.g. an inline image) directly. */
    suspend fun saveDataUrl(dataUrl: String, isPrivate: Boolean): Long? = withContext(Dispatchers.IO) {
        val header = dataUrl.substringBefore(',', "")
        val payload = dataUrl.substringAfter(',', "")
        if (header.isEmpty()) return@withContext null
        val mime = header.removePrefix("data:").substringBefore(';').ifBlank { "application/octet-stream" }
        val bytes = runCatching {
            if (header.contains(";base64")) Base64.decode(payload, Base64.DEFAULT)
            else java.net.URLDecoder.decode(payload, "UTF-8").toByteArray()
        }.getOrNull() ?: return@withContext null
        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "bin"
        val name = "download_${System.currentTimeMillis()}.$ext"
        val dest = createDestination(name, mime) ?: return@withContext null
        openChannel(dest).use { (channel, _) -> channel.write(ByteBuffer.wrap(bytes), 0) }
        finalizeDestination(dest)
        val id = dao.insert(
            DownloadRecord(
                url = "data:$mime", fileName = name, mimeType = mime, totalBytes = bytes.size.toLong(),
                downloadedBytes = bytes.size.toLong(), status = DownloadStatus.COMPLETED, destUri = dest,
                createdAt = System.currentTimeMillis(), finishedAt = System.currentTimeMillis(), isPrivate = isPrivate,
            ),
        )
        _notices.tryEmit(DownloadNotice.Finished(id, name))
        id
    }

    fun start(id: Long) {
        if (jobs[id]?.isActive == true) return
        stopReason.remove(id)
        val job = scope.launch { run(id) }
        jobs[id] = job
        updateActive()
        job.invokeOnCompletion {
            jobs.remove(id, job)
            _live.update { it - id }
            updateActive()
        }
        DownloadService.start(context)
    }

    fun pause(id: Long) {
        val job = jobs[id] ?: return
        stopReason[id] = Stop.PAUSE
        job.cancel()
    }

    fun pauseAll() = jobs.keys.toList().forEach { pause(it) }

    /** Cancels (if running), deletes the file and removes the entry. */
    fun delete(id: Long) {
        scope.launch {
            val job = jobs[id]
            if (job != null) {
                stopReason[id] = Stop.DELETE
                job.cancel()
                job.join()
            }
            val rec = dao.get(id) ?: return@launch
            rec.destUri?.let { deleteDestination(it) }
            dao.delete(id)
        }
    }

    /** Removes the entry from the list but keeps the file. */
    fun forget(id: Long) {
        scope.launch { if (jobs[id] == null) dao.delete(id) }
    }

    suspend fun get(id: Long): DownloadRecord? = dao.get(id)

    // ---- Engine ------------------------------------------------------------------------

    private class Segment(val start: Long, end: Long, done: Long) {
        val end = AtomicLong(end)          // inclusive; -1 = until the stream ends
        val done = AtomicLong(done)
        @Volatile var finished = false
        fun position() = start + done.get()
        fun remaining(): Long = if (end.get() < 0) Long.MAX_VALUE else max(0, end.get() - position() + 1)
        fun encode() = "$start:${end.get()}:${done.get()}"
    }

    private fun decode(s: String): MutableList<Segment> = s.split(';').filter { it.isNotBlank() }.mapNotNull { part ->
        val p = part.split(':').mapNotNull { it.toLongOrNull() }
        if (p.size == 3) Segment(p[0], p[1], p[2]).also { seg -> seg.finished = p[1] >= 0 && p[0] + p[2] > p[1] } else null
    }.let { CopyOnWriteArrayList(it) }

    private suspend fun run(id: Long) {
        var rec = dao.get(id) ?: return
        rec = rec.copy(status = DownloadStatus.RUNNING, error = null)
        dao.update(rec)
        var segments = decode(rec.segments)
        try {
            if (segments.isEmpty() || rec.destUri == null) {
                val probe = probe(rec)
                val name = if (rec.fileName.startsWith("downloadfile") && probe.fileName != null) sanitize(probe.fileName) else rec.fileName
                val mime = rec.mimeType?.takeIf { it.isNotBlank() && it != "application/octet-stream" } ?: probe.mime ?: guessMime(name)
                val dest = rec.destUri ?: createDestination(name, mime) ?: throw IOException("Can't create the file")
                segments = plan(probe.total, probe.rangeSupported)
                rec = rec.copy(
                    url = probe.finalUrl, fileName = name, mimeType = mime, totalBytes = probe.total,
                    rangeSupported = probe.rangeSupported, destUri = dest, segments = segments.joinToString(";") { it.encode() },
                )
                dao.update(rec)
            } else if (!rec.rangeSupported && segments.any { it.done.get() > 0 }) {
                // Server can't resume: start over.
                segments = plan(rec.totalBytes, false)
            }
            download(rec, segments)
            withContext(NonCancellable) {
                finalizeDestination(rec.destUri!!)
                val size = segments.sumOf { it.done.get() }.let { if (rec.totalBytes > 0) rec.totalBytes else it }
                dao.update(
                    rec.copy(
                        status = DownloadStatus.COMPLETED, downloadedBytes = size, totalBytes = size,
                        segments = "", cookies = null, finishedAt = System.currentTimeMillis(),
                    ),
                )
                _notices.tryEmit(DownloadNotice.Finished(id, rec.fileName))
                dao.get(id)?.let { DownloadService.notifyFinished(context, it, success = true) }
            }
        } catch (e: CancellationException) {
            withContext(NonCancellable) {
                when (stopReason.remove(id)) {
                    Stop.DELETE -> Unit // delete() cleans up
                    else -> dao.update(
                        rec.copy(
                            status = DownloadStatus.PAUSED,
                            downloadedBytes = segments.sumOf { it.done.get() },
                            segments = segments.joinToString(";") { it.encode() },
                        ),
                    )
                }
            }
            throw e
        } catch (e: Exception) {
            withContext(NonCancellable) {
                dao.update(
                    rec.copy(
                        status = DownloadStatus.FAILED,
                        error = e.message ?: e.javaClass.simpleName,
                        downloadedBytes = segments.sumOf { it.done.get() },
                        segments = segments.joinToString(";") { it.encode() },
                    ),
                )
                _notices.tryEmit(DownloadNotice.Failed(id, rec.fileName))
                dao.get(id)?.let { DownloadService.notifyFinished(context, it, success = false) }
            }
        }
    }

    private data class Probe(val finalUrl: String, val total: Long, val rangeSupported: Boolean, val fileName: String?, val mime: String?)

    /** Asks for the first byte only: tells us the size, the real address and if ranges work. */
    private fun probe(rec: DownloadRecord): Probe {
        val c = open(rec, rec.url, "bytes=0-0")
        try {
            val code = c.responseCode
            if (code >= 400) throw IOException("Server error $code")
            val disposition = c.getHeaderField("Content-Disposition")
            val mime = c.contentType?.substringBefore(';')?.trim()?.takeIf { it.isNotBlank() }
            val name = if (disposition != null || mime != null) URLUtil.guessFileName(c.url.toString(), disposition, mime) else null
            return if (code == 206) {
                val total = c.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: -1L
                Probe(c.url.toString(), total, total > 0, name, mime)
            } else {
                val len = c.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
                Probe(c.url.toString(), len, false, name, mime)
            }
        } finally {
            c.disconnect()
        }
    }

    private fun plan(total: Long, ranged: Boolean): MutableList<Segment> {
        if (!ranged || total <= 0) return CopyOnWriteArrayList(listOf(Segment(0, if (total > 0) total - 1 else -1, 0)))
        val parts = when {
            total < 2L * MB -> 1
            total < 16L * MB -> 4
            else -> MAX_CONNECTIONS
        }
        val size = total / parts
        return CopyOnWriteArrayList(
            List(parts) { i ->
                val start = i * size
                val end = if (i == parts - 1) total - 1 else start + size - 1
                Segment(start, end, 0)
            },
        )
    }

    private suspend fun download(rec: DownloadRecord, segments: MutableList<Segment>) = coroutineScope {
        val dest = rec.destUri!!
        openChannel(dest).use { (channel, _) ->
            if (!rec.rangeSupported && segments.single().done.get() == 0L) runCatching { channel.truncate(0) }
            val lock = Any()
            val connections = AtomicLong(0)

            // Progress reporter
            val reporter = launch {
                var last = segments.sumOf { it.done.get() }
                var speed = 0.0
                var tick = 0
                while (isActive) {
                    delay(500)
                    val now = segments.sumOf { min(it.done.get(), if (it.end.get() < 0) Long.MAX_VALUE else it.end.get() - it.start + 1) }
                    val instant = (now - last) * 2.0
                    speed = if (speed == 0.0) instant else speed * 0.7 + instant * 0.3
                    last = now
                    _live.update { it + (rec.id to LiveProgress(now, rec.totalBytes, speed.toLong(), connections.get().toInt())) }
                    if (++tick % 4 == 0) {
                        val snapshot = synchronized(lock) { segments.joinToString(";") { it.encode() } }
                        dao.saveProgress(rec.id, now, snapshot)
                    }
                }
            }

            fun steal(): Segment? = synchronized(lock) {
                if (!rec.rangeSupported) return null
                val victim = segments.filter { !it.finished && it.end.get() >= 0 }.maxByOrNull { it.remaining() } ?: return null
                val remaining = victim.remaining()
                if (remaining < 2 * MIN_SPLIT) return null
                val oldEnd = victim.end.get()
                val mid = victim.position() + remaining / 2
                victim.end.set(mid - 1)
                Segment(mid, oldEnd, 0).also { segments.add(it) }
            }

            val workers = segments.filter { !it.finished }.map { first ->
                launch {
                    var seg: Segment? = first
                    while (seg != null) {
                        connections.incrementAndGet()
                        try { fetch(rec, seg, channel) } finally { connections.decrementAndGet() }
                        seg = steal()
                    }
                }
            }
            workers.forEach { it.join() }
            reporter.cancel()
            channel.force(true)
        }
    }

    /** Downloads one segment with retries. */
    private suspend fun fetch(rec: DownloadRecord, seg: Segment, channel: FileChannel) {
        var attempt = 0
        val buffer = ByteArray(BUFFER)
        while (!seg.finished) {
            coroutineContextActive()
            try {
                val from = seg.position()
                val end = seg.end.get()
                val range = if (rec.rangeSupported) "bytes=$from-${if (end >= 0) end.toString() else ""}" else null
                val c = open(rec, rec.url, range)
                try {
                    val code = c.responseCode
                    if (code >= 400) throw IOException("Server error $code")
                    if (rec.rangeSupported && code != 206) throw IOException("Server stopped supporting resume")
                    c.inputStream.use { input ->
                        while (true) {
                            coroutineContextActive()
                            val e = seg.end.get()
                            val pos = seg.position()
                            if (e >= 0 && pos > e) { seg.finished = true; break }
                            val want = if (e >= 0) min(buffer.size.toLong(), e - pos + 1).toInt() else buffer.size
                            val n = input.read(buffer, 0, want)
                            if (n < 0) {
                                if (e < 0 || pos > e) seg.finished = true
                                break
                            }
                            val bb = ByteBuffer.wrap(buffer, 0, n)
                            var at = pos
                            while (bb.hasRemaining()) at += channel.write(bb, at)
                            seg.done.addAndGet(n.toLong())
                            attempt = 0
                        }
                    }
                } finally {
                    c.disconnect()
                }
                if (!seg.finished) throw IOException("Connection closed early")
            } catch (e: IOException) {
                if (++attempt > MAX_RETRIES) throw e
                delay(800L * attempt)
            }
        }
    }

    private suspend fun coroutineContextActive() = kotlin.coroutines.coroutineContext.ensureActive()

    private fun open(rec: DownloadRecord, url: String, range: String?): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000
        c.readTimeout = 30_000
        c.instanceFollowRedirects = true
        // Ranges must apply to the real bytes, so never let the server compress the response.
        c.setRequestProperty("Accept-Encoding", "identity")
        rec.userAgent?.let { c.setRequestProperty("User-Agent", it) }
        rec.cookies?.takeIf { it.isNotBlank() }?.let { c.setRequestProperty("Cookie", it) }
        rec.referer?.takeIf { it.startsWith("http") }?.let { c.setRequestProperty("Referer", it) }
        range?.let { c.setRequestProperty("Range", it) }
        return c
    }

    // ---- Storage -----------------------------------------------------------------------

    private fun createDestination(name: String, mime: String?): String? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime ?: guessMime(name))
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)?.toString()
        } else {
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(context.filesDir, "downloads")
            dir.mkdirs()
            var file = File(dir, name)
            var n = 1
            val base = name.substringBeforeLast('.')
            val ext = name.substringAfterLast('.', "").let { if (it.isNotEmpty()) ".$it" else "" }
            while (file.exists()) file = File(dir, "$base (${n++})$ext")
            file.createNewFile()
            Uri.fromFile(file).toString()
        }
    }.getOrNull()

    private class ChannelHandle(val channel: FileChannel, val closeable: java.io.Closeable) : java.io.Closeable {
        operator fun component1() = channel
        operator fun component2() = closeable
        override fun close() { runCatching { channel.close() }; runCatching { closeable.close() } }
    }

    private fun openChannel(dest: String): ChannelHandle {
        val uri = Uri.parse(dest)
        return if (uri.scheme == "file") {
            val raf = RandomAccessFile(File(uri.path!!), "rw")
            ChannelHandle(raf.channel, raf)
        } else {
            val pfd = context.contentResolver.openFileDescriptor(uri, "rw") ?: throw IOException("Can't open the file")
            ChannelHandle(FileOutputStream(pfd.fileDescriptor).channel, pfd)
        }
    }

    private fun finalizeDestination(dest: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && dest.startsWith("content:")) {
            runCatching {
                context.contentResolver.update(Uri.parse(dest), ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            }
        }
    }

    private fun deleteDestination(dest: String) {
        val uri = Uri.parse(dest)
        runCatching {
            if (uri.scheme == "file") File(uri.path!!).delete() else context.contentResolver.delete(uri, null, null)
        }
    }

    private fun updateActive() { _active.value = jobs.count { it.value.isActive } }

    companion object {
        const val MAX_CONNECTIONS = 8
        private const val MB = 1024L * 1024
        private const val MIN_SPLIT = 512L * 1024
        private const val BUFFER = 64 * 1024
        private const val MAX_RETRIES = 6

        fun guessMime(name: String): String {
            val ext = name.substringAfterLast('.', "").lowercase()
            return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                ?: if (ext == "apk") "application/vnd.android.package-archive" else "application/octet-stream"
        }

        fun sanitize(name: String): String =
            name.replace(Regex("""[\\/:*?"<>|\u0000-\u001f]"""), "_").trim().take(150).ifBlank { "download" }
    }
}

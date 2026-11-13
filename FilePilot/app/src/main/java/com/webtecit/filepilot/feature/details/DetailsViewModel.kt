package com.webtecit.filepilot.feature.details

import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.operations.Checksums
import com.webtecit.filepilot.core.operations.HashAlgorithm
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.SafFileSystem
import com.webtecit.filepilot.core.storage.StorageVolumes
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.BasicFileAttributes
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class HashState(
    val running: Boolean = false,
    val progress: Float = 0f,
    val value: String? = null,
    val error: String? = null,
)

data class DetailsState(
    val item: FileItem? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val location: String = "",
    val folderItems: Int? = null,
    val folderBytes: Long? = null,
    val counting: Boolean = false,
    val properties: List<Pair<String, String>> = emptyList(),
    val hashes: Map<HashAlgorithm, HashState> = emptyMap(),
)

@HiltViewModel
class DetailsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileSystems: FileSystems,
    private val volumes: StorageVolumes,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel() {

    private val _state = MutableStateFlow(DetailsState())
    val state: StateFlow<DetailsState> = _state.asStateFlow()

    private var loadedId: String? = null
    private val hashJobs = HashMap<HashAlgorithm, Job>()

    fun load(id: String) {
        if (loadedId == id) return
        loadedId = id
        viewModelScope.launch {
            val fs = runCatching { fileSystems.of(id) }.getOrNull()
            val item = runCatching { fs?.stat(id) }.getOrNull()
            if (fs == null || item == null) {
                _state.value = DetailsState(loading = false, error = "This item no longer exists.")
                return@launch
            }
            val parent = fs.parentId(id)
            val location = parent?.let { p ->
                val path = fs.displayPath(p)
                volumes.volumeOf(p)?.let { v -> v.label + path.removePrefix(v.rootId) } ?: path
            } ?: fs.displayPath(id)
            _state.value = DetailsState(item = item, loading = false, location = location)
            val props = withContext(io) { properties(item) }
            _state.update { it.copy(properties = props) }
            if (item.isDirectory) countFolder(item)
        }
    }

    private suspend fun countFolder(item: FileItem) {
        _state.update { it.copy(counting = true, folderItems = 0, folderBytes = 0) }
        var items = 0
        var bytes = 0L
        var lastPublish = 0L
        withContext(io) {
            val queue = ArrayDeque<String>()
            queue.addLast(item.id)
            while (queue.isNotEmpty()) {
                ensureActive()
                val dir = queue.removeFirst()
                val children = runCatching { fileSystems.of(dir).list(dir) }.getOrDefault(emptyList())
                for (c in children) {
                    items++
                    if (c.isDirectory) queue.addLast(c.id) else bytes += c.size
                }
                val now = System.currentTimeMillis()
                if (now - lastPublish > 250) {
                    lastPublish = now
                    _state.update { it.copy(folderItems = items, folderBytes = bytes) }
                }
            }
        }
        _state.update { it.copy(folderItems = items, folderBytes = bytes, counting = false) }
    }

    fun computeHash(algorithm: HashAlgorithm) {
        val item = _state.value.item ?: return
        if (item.isDirectory || hashJobs[algorithm]?.isActive == true) return
        updateHash(algorithm) { HashState(running = true) }
        hashJobs[algorithm] = viewModelScope.launch {
            try {
                val total = item.size.coerceAtLeast(1)
                var lastPublish = 0L
                val hex = withContext(io) {
                    Checksums.compute(fileSystems.of(item.id).openInput(item.id), algorithm) { read ->
                        val now = System.currentTimeMillis()
                        if (now - lastPublish > 120) {
                            lastPublish = now
                            updateHash(algorithm) { it.copy(progress = (read.toFloat() / total).coerceIn(0f, 1f)) }
                        }
                    }
                }
                updateHash(algorithm) { HashState(value = hex, progress = 1f) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateHash(algorithm) { HashState(error = e.userMessage()) }
            }
        }
    }

    fun cancelHash(algorithm: HashAlgorithm) {
        hashJobs[algorithm]?.cancel()
        updateHash(algorithm) { HashState() }
    }

    private fun updateHash(algorithm: HashAlgorithm, transform: (HashState) -> HashState) {
        _state.update { s -> s.copy(hashes = s.hashes + (algorithm to transform(s.hashes[algorithm] ?: HashState()))) }
    }

    private fun properties(item: FileItem): List<Pair<String, String>> {
        val out = ArrayList<Pair<String, String>>()
        out += "Type" to if (item.isDirectory) "Folder" else describeType(item)
        if (!item.isDirectory) out += "Size" to "${Formatters.size(item.size)} (${"%,d".format(item.size)} bytes)"
        out += "Modified" to Formatters.date(item.lastModified)
        if (!item.id.startsWith(SafFileSystem.PREFIX)) {
            val file = File(item.id)
            if (Build.VERSION.SDK_INT >= 26) {
                runCatching { Files.readAttributes(file.toPath(), BasicFileAttributes::class.java).creationTime().toMillis() }
                    .getOrNull()?.takeIf { it > 0 }?.let { out += "Created" to Formatters.date(it) }
            }
            val access = buildList {
                if (file.canRead()) add("Read")
                if (file.canWrite()) add("Write")
            }.joinToString(" · ").ifEmpty { "No access" }
            out += "Access" to access
        } else {
            out += "Access" to "Through granted folder access"
        }
        out += "Hidden" to if (item.isHidden) "Yes" else "No"
        if (!item.isDirectory) out += mediaProperties(item)
        return out
    }

    private fun describeType(item: FileItem): String {
        val ext = item.extension.uppercase()
        val kind = item.kind.name.lowercase().replaceFirstChar { it.uppercase() }
        return when {
            ext.isEmpty() -> item.mimeType
            item.kind == FileKind.OTHER -> "$ext file"
            else -> "$ext · $kind"
        }
    }

    private fun mediaProperties(item: FileItem): List<Pair<String, String>> = runCatching {
        when (item.kind) {
            FileKind.IMAGE -> {
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                fileSystems.of(item.id).openInput(item.id).use { BitmapFactory.decodeStream(it, null, opts) }
                if (opts.outWidth > 0) listOf("Dimensions" to "${opts.outWidth} × ${opts.outHeight} px") else emptyList()
            }
            FileKind.VIDEO, FileKind.AUDIO -> {
                val retriever = MediaMetadataRetriever()
                try {
                    if (item.id.startsWith(SafFileSystem.PREFIX)) retriever.setDataSource(context, SafFileSystem.uriOf(item.id))
                    else retriever.setDataSource(item.id)
                    fun meta(key: Int) = retriever.extractMetadata(key)?.takeIf { it.isNotBlank() }
                    buildList {
                        meta(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { add("Duration" to Formatters.duration(it)) }
                        val w = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                        val h = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                        if (w != null && h != null) add("Resolution" to "$w × $h")
                        meta(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toLongOrNull()?.let { add("Bitrate" to "${it / 1000} kbps") }
                        meta(MediaMetadataRetriever.METADATA_KEY_TITLE)?.let { add("Title" to it) }
                        meta(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.let { add("Artist" to it) }
                        meta(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.let { add("Album" to it) }
                    }
                } finally {
                    runCatching { retriever.release() }
                }
            }
            else -> emptyList()
        }
    }.getOrDefault(emptyList())
}

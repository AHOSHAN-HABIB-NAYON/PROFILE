@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.analyzer

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.GradientIcon
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.storage.StorageVolumes
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** One entry of the shown folder; [bytes] is null while a folder is still being measured. */
data class SizedChild(val name: String, val path: String, val bytes: Long?, val isDirectory: Boolean)

data class FolderSizeState(
    val root: String = "",
    val path: String = "",
    val children: List<SizedChild> = emptyList(),
    val scanning: Boolean = false,
    val scannedFiles: Int = 0,
    val measuredFolders: Int = 0,
    val totalFolders: Int = 0,
    val seconds: Long = 0,
    val biggestFirst: Boolean = true,
    val totalBytes: Long = 0,
    val freeBytes: Long = 0,
    val error: String? = null,
)

/**
 * Measures the top folders one by one and shows each as soon as it is done; every folder's size is
 * remembered, so opening a sub-folder afterwards is instant.
 */
@HiltViewModel
class FolderSizeViewModel @Inject constructor(private val volumes: StorageVolumes) : ViewModel() {
    private val _state = MutableStateFlow(FolderSizeState())
    val state: StateFlow<FolderSizeState> = _state.asStateFlow()
    private val sizes = ConcurrentHashMap<String, Long>()
    private var job: Job? = null

    fun start(path: String?) {
        if (_state.value.root.isNotEmpty()) return
        val root = path?.takeIf { it.isNotBlank() } ?: volumes.primaryRoot()
        _state.update { it.copy(root = root, path = root) }
        scan()
    }

    fun scan() {
        job?.cancel()
        sizes.clear()
        val root = _state.value.root
        val started = System.currentTimeMillis()
        job = viewModelScope.launch {
            try {
                val stat = withContext(Dispatchers.IO) { runCatching { android.os.StatFs(root) }.getOrNull() }
                val top = withContext(Dispatchers.IO) { File(root).listFiles().orEmpty().toList() }
                // Files show right away; folders show "measuring" until done.
                val initial = top.map { f -> SizedChild(f.name, f.absolutePath, if (f.isDirectory) null else f.length(), f.isDirectory) }
                val folders = top.filter { it.isDirectory && !isLink(it) }
                _state.update {
                    it.copy(
                        path = root, children = initial, scanning = true, scannedFiles = 0, measuredFolders = 0,
                        totalFolders = folders.size, error = null,
                        totalBytes = stat?.totalBytes ?: 0, freeBytes = stat?.availableBytes ?: 0,
                    )
                }
                val counter = intArrayOf(top.count { it.isFile })
                for (dir in folders) {
                    val size = withContext(Dispatchers.IO) { sizeOf(dir, counter) }
                    _state.update { s ->
                        s.copy(
                            children = if (s.path == root) s.children.map { if (it.path == dir.absolutePath) it.copy(bytes = size) else it } else s.children,
                            measuredFolders = s.measuredFolders + 1,
                            scannedFiles = counter[0],
                        )
                    }
                }
                sizes[root] = top.sumOf { f -> if (f.isDirectory) sizes[f.absolutePath] ?: 0L else f.length() }
                _state.update { it.copy(scanning = false, scannedFiles = counter[0], seconds = (System.currentTimeMillis() - started) / 1000) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(scanning = false, error = e.message ?: "The folder couldn't be read.") }
            }
        }
    }

    private suspend fun sizeOf(dir: File, counter: IntArray): Long {
        coroutineContext.ensureActive()
        var total = 0L
        val list = dir.listFiles() ?: return 0L
        for (f in list) {
            total += if (f.isDirectory && !isLink(f)) {
                sizeOf(f, counter)
            } else {
                counter[0]++
                if (counter[0] % 500 == 0) _state.update { it.copy(scannedFiles = counter[0]) }
                f.length()
            }
        }
        sizes[dir.absolutePath] = total
        return total
    }

    private fun isLink(f: File): Boolean = runCatching { java.nio.file.Files.isSymbolicLink(f.toPath()) }.getOrDefault(false)

    /** Shows the contents of [path] using the measured sizes. */
    fun show(path: String) {
        viewModelScope.launch {
            val children = withContext(Dispatchers.IO) {
                File(path).listFiles().orEmpty().map { f ->
                    SizedChild(f.name, f.absolutePath, if (f.isDirectory) sizes[f.absolutePath] else f.length(), f.isDirectory)
                }
            }
            _state.update { it.copy(path = path, children = children) }
        }
    }

    /** Goes to the parent folder; false when already at the top. */
    fun up(): Boolean {
        val s = _state.value
        if (s.path == s.root) return false
        val parent = File(s.path).parentFile?.absolutePath ?: return false
        show(parent)
        return true
    }

    fun setBiggestFirst(value: Boolean) = _state.update { it.copy(biggestFirst = value) }
}

private val chartColors = listOf(Palette.Pink, Palette.Green, Palette.Blue, Palette.Purple, Palette.Orange, Palette.Cyan)

/** Icon for well-known folders, so the list is easy to scan. */
private fun folderIcon(name: String): ImageVector = when (name.lowercase()) {
    "dcim", "camera" -> Icons.Rounded.PhotoCamera
    "whatsapp", "telegram" -> Icons.Rounded.Forum
    "download", "downloads" -> Icons.Rounded.Download
    "movies", "video", "videos" -> Icons.Rounded.Movie
    "music", "audio", "podcasts", "ringtones" -> Icons.Rounded.MusicNote
    "pictures", "screenshots", "images" -> Icons.Rounded.Image
    "documents" -> Icons.Rounded.Description
    "android" -> Icons.Rounded.Android
    else -> Icons.Rounded.Folder
}

@Composable
fun FolderSizeScreen(startPath: String?, onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: FolderSizeViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.start(startPath) }
    val atRoot = state.path == state.root
    BackHandler(enabled = !atRoot) { viewModel.up() }
    val sorted = remember(state.children, state.biggestFirst) {
        if (state.biggestFirst) state.children.sortedWith(compareByDescending<SizedChild> { it.bytes ?: -1L }.thenBy { it.name.lowercase() })
        else state.children.sortedBy { it.name.lowercase() }
    }
    val measured = remember(state.children) { state.children.sumOf { it.bytes ?: 0L } }
    val largest = remember(state.children) { state.children.maxOfOrNull { it.bytes ?: 0L } ?: 0L }
    val rank = remember(state.children) {
        state.children.filter { it.isDirectory && it.bytes != null }.sortedByDescending { it.bytes }.withIndex().associate { (i, c) -> c.path to i }
    }
    val progress = if (state.totalFolders == 0) 1f else state.measuredFolders.toFloat() / state.totalFolders

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Folder size", style = MaterialTheme.typography.titleLarge)
                        if (!atRoot) Text(File(state.path).name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = { IconButton(onClick = { if (!viewModel.up()) onBack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = {
                    IconButton(onClick = { onOpenFolder(state.path) }) { Icon(Icons.Rounded.FolderOpen, "Open this folder") }
                    IconButton(onClick = viewModel::scan, enabled = !state.scanning) { Icon(Icons.Rounded.Refresh, "Scan again") }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).testTag("folder_sizes"),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "hero") {
                Surface(shape = RoundedCornerShape(22.dp), color = Color.Transparent, shadowElevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.background(Brush.linearGradient(listOf(Color(0xFF3B7BFF), Palette.Navy))).padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val parts = state.children.filter { it.isDirectory && it.bytes != null }.sortedByDescending { it.bytes }.take(chartColors.size).map { it.bytes ?: 0L }
                        Donut(parts, if (atRoot && state.totalBytes > 0) (state.totalBytes - state.freeBytes) else measured, Modifier.size(92.dp)) {
                            Text(Formatters.size(measured), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
                            Text("found", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(if (atRoot && File(state.root).name == "0") "Internal storage" else File(state.path).name, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (atRoot && state.freeBytes > 0) {
                                Text("${Formatters.size(state.freeBytes)} free", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Color.White)
                            } else {
                                Text(Formatters.size(measured), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Color.White)
                            }
                            Text(
                                if (state.scanning) "Scanning… ${"%,d".format(state.scannedFiles)} files · ${(progress * 100).toInt()}%"
                                else "${"%,d".format(state.scannedFiles)} files in ${state.seconds} s",
                                style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f),
                            )
                            if (state.scanning) {
                                Spacer(Modifier.height(6.dp))
                                Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f))) {
                                    Box(Modifier.fillMaxWidth(progress.coerceIn(0.02f, 1f)).fillMaxHeight().clip(CircleShape).background(Color.White))
                                }
                            }
                        }
                    }
                }
            }
            item(key = "sort") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(selected = state.biggestFirst, onClick = { viewModel.setBiggestFirst(true) }, label = { Text("Biggest first") })
                    Spacer(Modifier.width(6.dp))
                    FilterChip(selected = !state.biggestFirst, onClick = { viewModel.setBiggestFirst(false) }, label = { Text("A–Z") })
                    Spacer(Modifier.weight(1f))
                    if (state.scanning) Text("Results appear as found", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            state.error?.let { msg -> item(key = "error") { Text(msg, color = MaterialTheme.colorScheme.error) } }
            if (!state.scanning && sorted.isEmpty()) {
                item(key = "empty") { Text("This folder is empty.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
            }
            if (sorted.isNotEmpty()) {
                item(key = "list") {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(vertical = 4.dp)) {
                            sorted.take(300).forEach { child ->
                                val color = if (child.isDirectory) chartColors[(rank[child.path] ?: 5) % chartColors.size] else Palette.Slate
                                SizeRow(child, color, if (largest > 0 && child.bytes != null) child.bytes.toFloat() / largest else 0f) {
                                    if (child.isDirectory) { if (child.bytes != null) viewModel.show(child.path) } else onOpenFolder(state.path)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SizeRow(child: SizedChild, color: Color, fraction: Float, onClick: () -> Unit) {
    val animations = LocalAnimationsEnabled.current
    val grow = remember(child.path) { Animatable(0f) }
    LaunchedEffect(child.path, fraction) { grow.animateTo(fraction, tween(if (animations) 700 else 0, easing = FastOutSlowInEasing)) }
    val shimmer = rememberInfiniteTransition(label = "measuring")
    val pulse by shimmer.animateFloat(0.25f, 0.6f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "pulse")
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GradientIcon(if (child.isDirectory) folderIcon(child.name) else Icons.AutoMirrored.Rounded.InsertDriveFile, if (child.bytes == null) Palette.Slate else color, size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(child.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                if (child.bytes == null) {
                    Text("measuring…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Text(Formatters.size(child.bytes), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = color)
                }
            }
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                if (child.bytes == null) {
                    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = pulse)))
                } else {
                    Box(Modifier.fillMaxWidth(grow.value.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.7f), color))))
                }
            }
        }
        if (child.isDirectory) {
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 4.dp))
        }
    }
}

@Composable
private fun Donut(parts: List<Long>, total: Long, modifier: Modifier, center: @Composable () -> Unit) {
    val animations = LocalAnimationsEnabled.current
    val sweep = remember { Animatable(0f) }
    LaunchedEffect(parts.size) { sweep.animateTo(1f, tween(if (animations) 900 else 0, easing = FastOutSlowInEasing)) }
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 11.dp.toPx()
            val inset = stroke / 2
            val arc = Size(size.width - stroke, size.height - stroke)
            val topLeft = Offset(inset, inset)
            drawArc(Color.White.copy(alpha = 0.22f), 0f, 360f, false, topLeft, arc, style = Stroke(stroke))
            if (total > 0) {
                var start = -90f
                val light = listOf(Color(0xFFFF8FB1), Color(0xFF8FF0C8), Color.White, Color(0xFFC9B8FF), Color(0xFFFFD08A), Color(0xFF9BE7F5))
                parts.forEachIndexed { i, bytes ->
                    val angle = (360f * bytes / total * sweep.value).coerceAtMost(360f - (start + 90f))
                    if (angle > 0.5f) drawArc(light[i % light.size], start, (angle - 1.5f).coerceAtLeast(0.5f), false, topLeft, arc, style = Stroke(stroke))
                    start += angle
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) { center() }
    }
}

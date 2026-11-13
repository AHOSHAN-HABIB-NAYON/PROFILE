@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.analyzer

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
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
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.storage.StorageVolumes
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

data class SizedChild(val name: String, val path: String, val bytes: Long, val isDirectory: Boolean)

data class FolderSizeState(
    val root: String = "",
    val path: String = "",
    val children: List<SizedChild> = emptyList(),
    val scanning: Boolean = false,
    val scannedFiles: Int = 0,
    val seconds: Long = 0,
    val biggestFirst: Boolean = true,
    val error: String? = null,
)

/**
 * Walks a storage once and remembers the size of every folder, so opening a sub-folder afterwards
 * is instant.
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
        _state.update { it.copy(scanning = true, scannedFiles = 0, children = emptyList(), error = null) }
        job = viewModelScope.launch {
            try {
                val counter = intArrayOf(0)
                withContext(Dispatchers.IO) { sizeOf(File(root), counter) }
                _state.update {
                    it.copy(scanning = false, scannedFiles = counter[0], seconds = (System.currentTimeMillis() - started) / 1000)
                }
                show(_state.value.path)
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
                if (counter[0] % 400 == 0) _state.update { it.copy(scannedFiles = counter[0]) }
                f.length()
            }
        }
        sizes[dir.absolutePath] = total
        return total
    }

    private fun isLink(f: File): Boolean = runCatching { java.nio.file.Files.isSymbolicLink(f.toPath()) }.getOrDefault(false)

    /** Shows the contents of [path], using the sizes measured during the scan. */
    fun show(path: String) {
        viewModelScope.launch {
            val children = withContext(Dispatchers.IO) {
                File(path).listFiles().orEmpty().map { f ->
                    val dir = f.isDirectory
                    SizedChild(f.name, f.absolutePath, if (dir) sizes[f.absolutePath] ?: 0L else f.length(), dir)
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

    fun sizeOfCurrent(): Long = sizes[_state.value.path] ?: 0L
}

private val chartColors = listOf(Palette.Pink, Palette.Blue, Palette.Orange, Palette.Purple, Palette.Green, Palette.Cyan)

@Composable
fun FolderSizeScreen(startPath: String?, onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: FolderSizeViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.start(startPath) }
    val atRoot = state.path == state.root
    BackHandler(enabled = !atRoot) { viewModel.up() }
    val sorted = remember(state.children, state.biggestFirst) {
        if (state.biggestFirst) state.children.sortedByDescending { it.bytes } else state.children.sortedBy { it.name.lowercase() }
    }
    val total = remember(state.children) { state.children.sumOf { it.bytes } }
    val largest = remember(state.children) { state.children.maxOfOrNull { it.bytes } ?: 0L }
    // Colour by size rank, so the biggest folders match the chart.
    val rank = remember(state.children) {
        state.children.filter { it.isDirectory }.sortedByDescending { it.bytes }.withIndex().associate { (i, c) -> c.path to i }
    }

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
            item(key = "summary") {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerLowest,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Donut(if (state.scanning) emptyList() else state.children.filter { it.isDirectory }.sortedByDescending { it.bytes }.take(chartColors.size).map { it.bytes }, total, Modifier.size(96.dp)) {
                                Text(if (state.scanning) "…" else Formatters.size(total), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1)
                                Text("used", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(if (atRoot && File(state.root).name == "0") "Internal storage" else File(state.path).name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    if (state.scanning) "Scanning… ${"%,d".format(state.scannedFiles)} files"
                                    else "Scanned ${"%,d".format(state.scannedFiles)} files in ${state.seconds} s",
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    FilterChip(selected = state.biggestFirst, onClick = { viewModel.setBiggestFirst(true) }, label = { Text("Biggest first") })
                                    FilterChip(selected = !state.biggestFirst, onClick = { viewModel.setBiggestFirst(false) }, label = { Text("A–Z") })
                                }
                            }
                        }
                        if (state.scanning) {
                            Spacer(Modifier.height(12.dp))
                            LinearProgressIndicator(Modifier.fillMaxWidth().clip(CircleShape))
                        }
                    }
                }
            }
            state.error?.let { msg -> item(key = "error") { Text(msg, color = MaterialTheme.colorScheme.error) } }
            if (!state.scanning) {
                if (sorted.isEmpty()) {
                    item(key = "empty") {
                        Text("This folder is empty.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp))
                    }
                }
                item(key = "list") {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(vertical = 4.dp)) {
                            // Long folders: show the biggest 300 entries; the rest are tiny.
                            sorted.take(300).forEach { child ->
                                val color = if (child.isDirectory) chartColors[(rank[child.path] ?: 0) % chartColors.size] else Palette.Slate
                                SizeRow(child, color, if (largest > 0) child.bytes.toFloat() / largest else 0f) {
                                    if (child.isDirectory) viewModel.show(child.path) else onOpenFolder(state.path)
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
    val grow = remember(child.path) { Animatable(if (animations) 0f else fraction) }
    LaunchedEffect(child.path, fraction) { grow.animateTo(fraction, tween(if (animations) 700 else 0, easing = FastOutSlowInEasing)) }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
            Icon(if (child.isDirectory) Icons.Rounded.Folder else Icons.AutoMirrored.Rounded.InsertDriveFile, null, tint = color)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(child.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(Formatters.size(child.bytes), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = color)
            }
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                Box(Modifier.fillMaxWidth(grow.value.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(color))
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
    val sweep = remember(parts) { Animatable(if (animations) 0f else 1f) }
    LaunchedEffect(parts) { sweep.animateTo(1f, tween(if (animations) 1000 else 0, easing = FastOutSlowInEasing)) }
    val track = MaterialTheme.colorScheme.surfaceContainerHigh
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 12.dp.toPx()
            val inset = stroke / 2
            val arc = Size(size.width - stroke, size.height - stroke)
            val topLeft = Offset(inset, inset)
            drawArc(track, 0f, 360f, false, topLeft, arc, style = Stroke(stroke))
            if (total > 0) {
                var start = -90f
                parts.forEachIndexed { i, bytes ->
                    val angle = 360f * bytes / total * sweep.value
                    if (angle > 0.5f) drawArc(chartColors[i % chartColors.size], start, (angle - 1.5f).coerceAtLeast(0.5f), false, topLeft, arc, style = Stroke(stroke))
                    start += angle
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) { center() }
    }
}

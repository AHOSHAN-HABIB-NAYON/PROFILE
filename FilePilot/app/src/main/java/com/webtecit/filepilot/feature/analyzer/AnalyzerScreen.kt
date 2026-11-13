@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.analyzer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.ChartSegment
import com.webtecit.filepilot.core.designsystem.DonutChart
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.SectionHeader
import com.webtecit.filepilot.core.designsystem.UsageBar
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.StorageVolumeInfo
import com.webtecit.filepilot.core.storage.StorageVolumes
import com.webtecit.filepilot.data.FileOpener
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

@HiltViewModel
class AnalyzerViewModel @Inject constructor(
    private val analyzer: StorageAnalyzer,
    private val volumes: StorageVolumes,
    private val opener: FileOpener,
) : ViewModel() {
    val state = analyzer.state
    val volumeList = MutableStateFlow<List<StorageVolumeInfo>>(emptyList())
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val v = runCatching { volumes.load() }.getOrDefault(emptyList())
            volumeList.value = v
            val root = state.value.rootId ?: v.firstOrNull()?.rootId ?: return@launch
            if (state.value.result?.rootId != root) analyzer.loadCached(root)
        }
    }

    fun select(rootId: String) = analyzer.loadCached(rootId)
    fun scan(rootId: String) = analyzer.scan(rootId)
    fun cancel() = analyzer.cancel()
    fun open(path: String) {
        viewModelScope.launch { _events.send(opener.openId(path)) }
    }
}

@Composable
fun AnalyzerScreen(onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: AnalyzerViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val volumes by viewModel.volumeList.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    val root = state.rootId ?: volumes.firstOrNull()?.rootId
    val result = state.result?.takeIf { it.rootId == root }
    var autoStarted by remember { mutableStateOf(false) }
    LaunchedEffect(root, result, state.scanning) {
        if (!autoStarted && root != null && result == null && !state.scanning) {
            autoStarted = true
            viewModel.scan(root)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Storage Analyzer") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = {
                    if (root != null && !state.scanning) IconButton(onClick = { viewModel.scan(root) }) { Icon(Icons.Rounded.Refresh, "Scan again") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (volumes.size > 1) {
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(volumes) { v ->
                            FilterChip(selected = v.rootId == root, onClick = { viewModel.select(v.rootId) }, label = { Text(v.label) })
                        }
                    }
                }
            }
            if (state.scanning) {
                item {
                    AppCard {
                        Text("Scanning…", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${"%,d".format(state.scannedFiles)} files · ${state.currentFolder}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(10.dp))
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = viewModel::cancel) { Text("Stop scan") }
                    }
                }
            }
            if (result == null) {
                if (!state.scanning) item {
                    EmptyState(
                        Icons.Rounded.DonutLarge, "See what uses your space",
                        "Scan a storage to see the biggest folders, files and file types.",
                        actionLabel = "Scan now", onAction = { root?.let(viewModel::scan) },
                    )
                }
                return@LazyColumn
            }
            item {
                AppCard {
                    val segments = result.kinds.take(7).map { k ->
                        val kind = runCatching { FileKind.valueOf(k.kind) }.getOrDefault(FileKind.OTHER)
                        Triple(k, kind, k.bytes.toFloat())
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DonutChart(
                            segments.map { (k, kind, v) -> ChartSegment(k.kind, v, kindStyle(kind).tint) },
                            size = 150.dp,
                        ) {
                            Text(Formatters.size(result.totalBytes), style = MaterialTheme.typography.titleMedium)
                            Text("scanned", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.width(16.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            segments.forEach { (k, kind, _) ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(10.dp).clip(CircleShape).background(kindStyle(kind).tint))
                                    Spacer(Modifier.width(8.dp))
                                    Text(kindLabel(kind), style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                                    Text(Formatters.size(k.bytes), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "${"%,d".format(result.totalFiles)} files in ${"%,d".format(result.totalFolders)} folders · scanned ${Formatters.date(result.scannedAt)}" +
                            if (result.skipped > 0) " · ${result.skipped} protected folders skipped" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item { SectionHeader("Folders") }
            val maxTop = result.topFolders.firstOrNull()?.bytes?.coerceAtLeast(1) ?: 1
            items(result.topFolders.take(15), key = { "t" + it.path }) { e ->
                SizedRow(e, e.bytes.toFloat() / maxTop, isFolder = true) { onOpenFolder(e.path) }
            }
            if (result.largeFolders.isNotEmpty()) {
                item { SectionHeader("Large folders") }
                items(result.largeFolders.take(15), key = { "l" + it.path }) { e ->
                    SizedRow(e, e.bytes.toFloat() / maxTop, isFolder = true, subtitle = e.path.removePrefix(result.rootId)) { onOpenFolder(e.path) }
                }
            }
            item { SectionHeader("Largest files") }
            val maxFile = result.largestFiles.firstOrNull()?.bytes?.coerceAtLeast(1) ?: 1
            items(result.largestFiles.take(30), key = { "f" + it.path }) { e ->
                SizedRow(e, e.bytes.toFloat() / maxFile, isFolder = false, subtitle = e.path.removePrefix(result.rootId).substringBeforeLast('/')) {
                    viewModel.open(e.path)
                }
            }
            item {
                Button(onClick = { onOpenFolder(result.rootId) }, modifier = Modifier.fillMaxWidth()) { Text("Browse this storage") }
            }
        }
    }
}

fun kindLabel(kind: FileKind): String = when (kind) {
    FileKind.IMAGE -> "Images"
    FileKind.VIDEO -> "Videos"
    FileKind.AUDIO -> "Audio"
    FileKind.DOCUMENT, FileKind.PDF, FileKind.SPREADSHEET, FileKind.PRESENTATION -> "Documents"
    FileKind.ARCHIVE -> "Archives"
    FileKind.APK -> "APKs"
    FileKind.CODE -> "Code"
    FileKind.TEXT -> "Text"
    FileKind.FONT -> "Fonts"
    FileKind.DATABASE -> "Databases"
    FileKind.FOLDER -> "Folders"
    FileKind.OTHER -> "Other"
}

@Composable
private fun SizedRow(e: SizedEntry, fraction: Float, isFolder: Boolean, subtitle: String? = null, onClick: () -> Unit) {
    val style = kindStyle(if (isFolder) FileKind.FOLDER else FileTypes.kindOf(e.name, false))
    Row(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).clickable(onClick = onClick).padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(if (isFolder) Icons.Rounded.Folder else style.icon, style.tint, size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row {
                Text(e.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(Formatters.size(e.bytes), style = MaterialTheme.typography.labelLarge)
            }
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(6.dp))
            UsageBar(fraction, color = style.tint)
        }
    }
}

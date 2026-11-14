@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.cleaner

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Environment
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Gif
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil3.compose.AsyncImage
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.Feedback
import com.webtecit.filepilot.core.designsystem.GradientIcon
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.feature.browser.DeleteSheet
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Kinds of WhatsApp media, with the folders they live in. */
enum class WaKind(val label: String, val unit: String, val folders: List<String>, val icon: ImageVector, val tint: Color) {
    IMAGES("Images", "photos", listOf("WhatsApp Images"), Icons.Rounded.Image, Palette.Blue),
    VIDEOS("Videos", "videos", listOf("WhatsApp Video"), Icons.Rounded.Movie, Palette.Pink),
    VOICE("Voice notes", "messages", listOf("WhatsApp Voice Notes"), Icons.Rounded.Mic, Palette.Orange),
    DOCUMENTS("Documents", "files", listOf("WhatsApp Documents"), Icons.Rounded.Description, Palette.Green),
    AUDIO("Audio", "files", listOf("WhatsApp Audio"), Icons.Rounded.MusicNote, Palette.Cyan),
    GIFS("GIFs & stickers", "files", listOf("WhatsApp Animated Gifs", "WhatsApp Stickers"), Icons.Rounded.Gif, Palette.Purple),
}

enum class WaFilter(val label: String) { ALL("All"), RECEIVED("Received"), SENT("Sent"), OLD("Older than 30 days") }

data class WaFile(val file: File, val size: Long, val modified: Long, val sent: Boolean)

data class WhatsAppState(
    val loading: Boolean = true,
    val found: Boolean = true,
    val files: Map<WaKind, List<WaFile>> = emptyMap(),
    val filter: WaFilter = WaFilter.ALL,
    val checkedKinds: Set<WaKind> = setOf(WaKind.IMAGES, WaKind.VIDEOS, WaKind.GIFS),
    val open: WaKind? = null,
    val selected: Set<String> = emptySet(),
    val oldestFirst: Boolean = false,
)

@HiltViewModel
class WhatsAppViewModel @Inject constructor(
    private val recycleBin: com.webtecit.filepilot.core.cleaning.RecycleBin,
    private val operations: com.webtecit.filepilot.core.operations.FileOperationManager,
    private val preferences: com.webtecit.filepilot.core.preferences.PreferencesRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(WhatsAppState())
    val state: StateFlow<WhatsAppState> = _state.asStateFlow()

    init { scan() }

    fun scan() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                val roots = mediaRoots()
                if (roots.isEmpty()) return@withContext null
                WaKind.entries.associateWith { kind ->
                    roots.flatMap { root -> kind.folders.map { File(root, it) } }
                        .filter { it.isDirectory }
                        .flatMap { dir ->
                            dir.walkTopDown().filter { it.isFile && !it.name.startsWith(".") }
                                .map { WaFile(it, it.length(), it.lastModified(), it.path.contains("/Sent/") || it.path.contains("/Private/Sent")) }
                                .toList()
                        }
                }
            }
            _state.update { it.copy(loading = false, found = result != null, files = result ?: emptyMap(), selected = emptySet()) }
        }
    }

    private fun mediaRoots(): List<File> {
        val root = Environment.getExternalStorageDirectory()
        return listOf(
            "Android/media/com.whatsapp/WhatsApp/Media", "WhatsApp/Media",
            "Android/media/com.whatsapp.w4b/WhatsApp Business/Media", "WhatsApp Business/Media",
        ).map { File(root, it) }.filter { it.isDirectory }
    }

    fun filtered(kind: WaKind, s: WhatsAppState = _state.value): List<WaFile> {
        val cutoff = System.currentTimeMillis() - 30L * 24 * 3600 * 1000
        return s.files[kind].orEmpty().filter {
            when (s.filter) {
                WaFilter.ALL -> true
                WaFilter.RECEIVED -> !it.sent
                WaFilter.SENT -> it.sent
                WaFilter.OLD -> it.modified < cutoff
            }
        }
    }

    fun setFilter(f: WaFilter) = _state.update { it.copy(filter = f, selected = emptySet()) }
    fun toggleKind(k: WaKind) = _state.update { s -> s.copy(checkedKinds = if (k in s.checkedKinds) s.checkedKinds - k else s.checkedKinds + k) }
    fun openKind(k: WaKind?) = _state.update { it.copy(open = k, selected = emptySet()) }
    fun toggleFile(path: String) = _state.update { s -> s.copy(selected = if (path in s.selected) s.selected - path else s.selected + path) }
    fun selectAll(k: WaKind) = _state.update { s ->
        val all = filtered(k, s).map { it.file.path }.toSet()
        s.copy(selected = if (s.selected.containsAll(all)) emptySet() else all)
    }
    fun setOldestFirst(v: Boolean) = _state.update { it.copy(oldestFirst = v) }

    fun recycleBinOn(): Boolean = runCatching { kotlinx.coroutines.runBlocking { preferences.current().recycleBin } }.getOrDefault(true)

    fun delete(files: List<WaFile>, permanently: Boolean) {
        if (files.isEmpty()) return
        val items = files.map { FileItem(it.file.path, it.file.name, false, it.size, it.modified, FileTypes.mimeOf(it.file.name)) }
        val freed = Formatters.size(files.sumOf { it.size })
        viewModelScope.launch {
            if (!permanently && items.all(recycleBin::supports)) {
                runCatching { recycleBin.trashEntries(items) }
                    .onSuccess { entries ->
                        Feedback.deleted("Deleted", "${Formatters.count(files.size, "file")} · $freed freed", undo = {
                            recycleBin.undo(entries)
                            scan()
                        })
                    }
                    .onFailure { Feedback.error("Couldn't delete", it.message.orEmpty()) }
            } else {
                operations.delete(items)
            }
            val gone = files.map { it.file.path }.toSet()
            _state.update { s -> s.copy(files = s.files.mapValues { (_, l) -> l.filterNot { it.file.path in gone } }, selected = emptySet()) }
        }
    }
}

@Composable
fun WhatsAppScreen(onBack: () -> Unit, viewModel: WhatsAppViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirm by remember { mutableStateOf<List<WaFile>?>(null) }
    BackHandler(enabled = state.open != null) { viewModel.openKind(null) }
    val open = state.open
    if (open == null) {
        Overview(state, viewModel, onBack) { confirm = it }
    } else {
        KindGrid(open, state, viewModel) { confirm = it }
    }
    confirm?.let { files ->
        DeleteSheet(
            items = files.take(200).map { FileItem(it.file.path, it.file.name, false, it.size, it.modified, FileTypes.mimeOf(it.file.name)) },
            canUseRecycleBin = viewModel.recycleBinOn(),
            onDelete = { permanently -> confirm = null; viewModel.delete(files, permanently) },
            onDismiss = { confirm = null },
        )
    }
}

@Composable
private fun Overview(state: WhatsAppState, viewModel: WhatsAppViewModel, onBack: () -> Unit, onDelete: (List<WaFile>) -> Unit) {
    val totals = WaKind.entries.associateWith { viewModel.filtered(it, state) }
    val totalBytes = state.files.values.flatten().sumOf { it.size }
    val chosen = state.checkedKinds.flatMap { totals[it].orEmpty() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("WhatsApp media") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { IconButton(onClick = viewModel::scan, enabled = !state.loading) { Icon(Icons.Rounded.Refresh, "Scan again") } },
            )
        },
        bottomBar = {
            if (state.found && !state.loading) {
                Surface(shadowElevation = 8.dp) {
                    Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
                        DeleteButton("Delete selected · ${Formatters.size(chosen.sumOf { it.size })}", enabled = chosen.isNotEmpty(), modifier = Modifier.weight(1f)) { onDelete(chosen) }
                    }
                }
            }
        },
    ) { padding ->
        when {
            state.loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(12.dp))
                    Text("Looking through WhatsApp media…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            !state.found -> Box(Modifier.fillMaxSize().padding(padding).padding(32.dp), contentAlignment = Alignment.Center) {
                Text("WhatsApp media wasn't found on this phone. If WhatsApp is installed, allow file access in Settings.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(
                Modifier.fillMaxSize().padding(padding).testTag("whatsapp"),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "hero") {
                    Surface(shape = RoundedCornerShape(22.dp), color = Color.Transparent, shadowElevation = 4.dp) {
                        Row(
                            Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF2BC48A), Color(0xFF0E7A57)))).padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Ring(WaKind.entries.map { k -> state.files[k].orEmpty().sumOf { it.size } }, totalBytes, Modifier.size(86.dp))
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("WhatsApp takes", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                                Text(Formatters.size(totalBytes), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = Color.White)
                                Text("${"%,d".format(state.files.values.sumOf { it.size })} files", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                            }
                        }
                    }
                }
                item(key = "filters") {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        WaFilter.entries.forEach { f -> FilterChip(selected = state.filter == f, onClick = { viewModel.setFilter(f) }, label = { Text(f.label) }) }
                    }
                }
                item(key = "kinds") {
                    Surface(
                        shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                    ) {
                        Column(Modifier.padding(vertical = 4.dp)) {
                            WaKind.entries.forEach { kind ->
                                val list = totals[kind].orEmpty()
                                Row(
                                    Modifier.fillMaxWidth().clickable { viewModel.openKind(kind) }.padding(start = 4.dp, end = 10.dp, top = 6.dp, bottom = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(checked = kind in state.checkedKinds, onCheckedChange = { viewModel.toggleKind(kind) })
                                    GradientIcon(kind.icon, kind.tint, size = 42.dp)
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(kind.label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                                        Text("${"%,d".format(list.size)} ${kind.unit}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text(Formatters.size(list.sumOf { it.size }), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = kind.tint)
                                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.outline)
                                }
                            }
                        }
                    }
                }
                item(key = "note") {
                    Text(
                        "Chats stay in WhatsApp; only the files are removed, and old messages will show them as missing.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun KindGrid(kind: WaKind, state: WhatsAppState, viewModel: WhatsAppViewModel, onDelete: (List<WaFile>) -> Unit) {
    val list = remember(state, kind) {
        val l = viewModel.filtered(kind, state)
        if (state.oldestFirst) l.sortedBy { it.modified } else l.sortedByDescending { it.size }
    }
    val chosen = list.filter { it.file.path in state.selected }
    val visual = kind == WaKind.IMAGES || kind == WaKind.VIDEOS || kind == WaKind.GIFS
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(kind.label)
                        Text("${"%,d".format(list.size)} ${kind.unit} · ${Formatters.size(list.sumOf { it.size })}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = { IconButton(onClick = { viewModel.openKind(null) }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { TextButton(onClick = { viewModel.selectAll(kind) }, enabled = list.isNotEmpty()) { Text(if (chosen.size == list.size && list.isNotEmpty()) "Clear" else "Select all") } },
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${chosen.size} selected", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("${Formatters.size(chosen.sumOf { it.size })} will be freed", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    DeleteButton("Delete", enabled = chosen.isNotEmpty(), modifier = Modifier) { onDelete(chosen) }
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = !state.oldestFirst, onClick = { viewModel.setOldestFirst(false) }, label = { Text("Biggest first") })
                FilterChip(selected = state.oldestFirst, onClick = { viewModel.setOldestFirst(true) }, label = { Text("Oldest first") })
                WaFilter.entries.drop(1).forEach { f -> FilterChip(selected = state.filter == f, onClick = { viewModel.setFilter(if (state.filter == f) WaFilter.ALL else f) }, label = { Text(f.label) }) }
            }
            if (list.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Nothing here.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(if (visual) 3 else 1),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(list, key = { it.file.path }) { f ->
                        val on = f.file.path in state.selected
                        if (visual) MediaCell(f, kind, on) { viewModel.toggleFile(f.file.path) }
                        else FileLine(f, kind, on) { viewModel.toggleFile(f.file.path) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MediaCell(f: WaFile, kind: WaKind, selected: Boolean, onClick: () -> Unit) {
    Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable(onClick = onClick)) {
        if (kind == WaKind.VIDEOS) VideoThumb(f.file) else AsyncImage(model = f.file, contentDescription = f.file.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Box(
            Modifier.align(Alignment.TopEnd).padding(6.dp).size(22.dp).clip(CircleShape)
                .background(if (selected) Palette.Green else Color.Black.copy(alpha = 0.25f))
                .border(2.dp, Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) { if (selected) Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(14.dp)) }
        Text(
            Formatters.size(f.size), color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.BottomStart).padding(5.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 5.dp, vertical = 1.dp),
        )
        if (selected) Box(Modifier.fillMaxSize().border(3.dp, Palette.Green, RoundedCornerShape(12.dp)))
    }
}

/** First frame of a video, read on a background thread. */
@Composable
private fun VideoThumb(file: File) {
    val frame by produceState<Bitmap?>(null, file) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val r = MediaMetadataRetriever()
                try {
                    r.setDataSource(file.absolutePath)
                    r.getFrameAtTime(1_000_000)?.let { b ->
                        val scale = 240f / maxOf(b.width, b.height)
                        if (scale < 1f) Bitmap.createScaledBitmap(b, (b.width * scale).toInt().coerceAtLeast(1), (b.height * scale).toInt().coerceAtLeast(1), true) else b
                    }
                } finally {
                    r.release()
                }
            }.getOrNull()
        }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        frame?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        Box(Modifier.size(28.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun FileLine(f: WaFile, kind: WaKind, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick, shape = RoundedCornerShape(14.dp),
        color = if (selected) Palette.Green.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, if (selected) Palette.Green.copy(alpha = 0.4f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = selected, onCheckedChange = { onClick() })
            GradientIcon(kind.icon, kind.tint, size = 36.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(f.file.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${Formatters.size(f.size)} · ${Formatters.shortDate(f.modified)}${if (f.sent) " · Sent" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun DeleteButton(label: String, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier.height(50.dp).clip(RoundedCornerShape(16.dp))
            .background(if (enabled) Brush.linearGradient(listOf(Color(0xFFF0566B), Color(0xFFD02F45))) else Brush.linearGradient(listOf(Color(0xFFBFC5D2), Color(0xFFBFC5D2))))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Delete, null, tint = Color.White, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun Ring(parts: List<Long>, total: Long, modifier: Modifier) {
    val light = listOf(Color.White, Color(0xFFC6F5E1), Color(0xFFFFE07A), Color(0xFF7EE0B8), Color(0xFF9BE7F5), Color(0xFFD8C8FF))
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 11.dp.toPx()
            val arc = Size(size.width - stroke, size.height - stroke)
            val tl = Offset(stroke / 2, stroke / 2)
            drawArc(Color.White.copy(alpha = 0.2f), 0f, 360f, false, tl, arc, style = Stroke(stroke))
            if (total > 0) {
                var start = -90f
                parts.forEachIndexed { i, b ->
                    val angle = 360f * b / total
                    if (angle > 0.5f) drawArc(light[i % light.size], start, angle - 1.5f, false, tl, arc, style = Stroke(stroke))
                    start += angle
                }
            }
        }
        Text("${parts.count { it > 0 }} types", color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
    }
}

@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.webtecit.filepilot.feature.recycle

import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil3.compose.AsyncImage
import com.webtecit.filepilot.core.cleaning.RecycleBin
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.database.TrashEntity
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.GradientIcon
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.userMessage
import com.webtecit.filepilot.feature.cleaner.VideoThumb
import com.webtecit.filepilot.feature.media.CompactAudioPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@HiltViewModel
class RecycleBinViewModel @Inject constructor(private val bin: RecycleBin) : ViewModel() {
    val items = bin.items.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun restore(e: TrashEntity) = viewModelScope.launch {
        _events.send(UiEvent.Message(runCatching { bin.restore(e) }.fold({ "Restored to ${it.substringBeforeLast('/').substringAfter("/0/")}" }, { it.userMessage() })))
    }

    fun restoreAll(list: List<TrashEntity>) = viewModelScope.launch {
        var ok = 0
        list.forEach { e -> if (runCatching { bin.restore(e) }.isSuccess) ok++ }
        _events.send(UiEvent.Message("Restored ${Formatters.count(ok, "item")}."))
    }

    fun delete(e: TrashEntity) = viewModelScope.launch {
        runCatching { bin.deleteForever(e) }.onFailure { _events.send(UiEvent.Message(it.userMessage())) }
    }

    fun empty() = viewModelScope.launch {
        items.value.forEach { runCatching { bin.deleteForever(it) } }
        _events.send(UiEvent.Message("Recycle Bin emptied."))
    }
}

private enum class BinFilter(val label: String) { ALL("All"), IMAGES("Images"), VIDEOS("Videos"), AUDIO("Audio"), DOCS("Documents"), OTHER("Other") }

private fun TrashEntity.kind(): FileKind = FileTypes.kindOf(name, isDirectory)

private fun BinFilter.matches(e: TrashEntity): Boolean = when (this) {
    BinFilter.ALL -> true
    BinFilter.IMAGES -> e.kind() == FileKind.IMAGE
    BinFilter.VIDEOS -> e.kind() == FileKind.VIDEO
    BinFilter.AUDIO -> e.kind() == FileKind.AUDIO
    BinFilter.DOCS -> e.kind() in setOf(FileKind.PDF, FileKind.DOCUMENT, FileKind.SPREADSHEET, FileKind.PRESENTATION, FileKind.TEXT, FileKind.CODE)
    BinFilter.OTHER -> e.kind() !in setOf(FileKind.IMAGE, FileKind.VIDEO, FileKind.AUDIO, FileKind.PDF, FileKind.DOCUMENT, FileKind.SPREADSHEET, FileKind.PRESENTATION, FileKind.TEXT, FileKind.CODE)
}

private fun TrashEntity.daysLeft(): Long = (RecycleBin.KEEP_DAYS - (System.currentTimeMillis() - deletedAt) / RecycleBin.DAY_MS).coerceAtLeast(0)
private fun TrashEntity.fromFolder(): String = originalPath.substringBeforeLast('/').substringAfter("/0/").ifEmpty { "Internal storage" }

@Composable
fun RecycleBinScreen(onBack: () -> Unit, viewModel: RecycleBinViewModel = hiltViewModel()) {
    val entries by viewModel.items.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar)
    var confirmEmpty by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<TrashEntity?>(null) }
    var previewing by remember { mutableStateOf<TrashEntity?>(null) }
    var filter by remember { mutableStateOf(BinFilter.ALL) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Recycle Bin") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { if (entries.isNotEmpty()) IconButton(onClick = { confirmEmpty = true }) { Icon(Icons.Rounded.DeleteSweep, "Empty Recycle Bin") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        if (entries.isEmpty()) {
            EmptyState(Icons.Rounded.DeleteSweep, "Recycle Bin is empty",
                "Deleted files stay here for ${RecycleBin.KEEP_DAYS} days so you can restore them.", modifier = Modifier.padding(padding))
        } else {
            val shown = entries.filter { filter.matches(it) }
            LazyColumn(Modifier.fillMaxSize().padding(padding).testTag("bin_list"), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                item(key = "hero") {
                    Surface(shape = RoundedCornerShape(22.dp), color = Color.Transparent, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                        Row(
                            Modifier.background(Brush.linearGradient(listOf(Color(0xFFFF6B7D), Color(0xFFE0455A)))).padding(18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(Formatters.size(entries.sumOf { it.size }), color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                Text("${Formatters.count(entries.size, "item")} · kept ${RecycleBin.KEEP_DAYS} days", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium)
                                Text("Tap an item to look at it before restoring.", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall)
                            }
                            Surface(onClick = { viewModel.restoreAll(shown) }, shape = RoundedCornerShape(14.dp), color = Color.White) {
                                Row(Modifier.padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.Restore, null, tint = Palette.Red, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (filter == BinFilter.ALL) "Restore all" else "Restore ${shown.size}", color = Palette.Red, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
                item(key = "filters") {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BinFilter.entries.forEach { f ->
                            val count = entries.count { f.matches(it) }
                            if (f == BinFilter.ALL || count > 0) {
                                FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text("${f.label} $count") })
                            }
                        }
                    }
                }
                if (shown.isEmpty()) {
                    item(key = "none") {
                        Text("Nothing here.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth(), textAlign = TextAlign.Center)
                    }
                }
                items(shown, key = { it.id }) { e ->
                    BinRow(e, onOpen = { previewing = e }, onRestore = { viewModel.restore(e) }, onDelete = { confirmDelete = e })
                }
            }
        }
    }
    previewing?.let { e ->
        BinPreview(
            entry = e,
            onClose = { previewing = null },
            onRestore = { previewing = null; viewModel.restore(e) },
            onDelete = { previewing = null; confirmDelete = e },
        )
    }
    if (confirmEmpty) ConfirmDialog("Empty the Recycle Bin?", "All ${entries.size} items will be deleted permanently. This can't be undone.",
        "Empty Recycle Bin", onConfirm = { confirmEmpty = false; viewModel.empty() }, onDismiss = { confirmEmpty = false }, destructive = true)
    confirmDelete?.let { e ->
        ConfirmDialog("Delete \"${e.name}\" forever?", "It can't be restored afterwards.", "Delete forever",
            onConfirm = { confirmDelete = null; viewModel.delete(e) }, onDismiss = { confirmDelete = null }, destructive = true)
    }
}

@Composable
private fun BinRow(e: TrashEntity, onOpen: () -> Unit, onRestore: () -> Unit, onDelete: () -> Unit) {
    Surface(
        onClick = onOpen,
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            BinThumb(e, Modifier.size(56.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(e.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${if (e.isDirectory) "Folder" else Formatters.size(e.size)} · ${e.fromFolder()}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                val left = e.daysLeft()
                Text(
                    "$left days left",
                    style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold,
                    color = if (left <= 3) Palette.Red else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onRestore) { Icon(Icons.Rounded.Restore, "Restore ${e.name}", tint = Palette.Green) }
            IconButton(onClick = onDelete) { Icon(Icons.Rounded.DeleteForever, "Delete ${e.name} forever", tint = Palette.Red) }
        }
    }
}

@Composable
private fun BinThumb(e: TrashEntity, modifier: Modifier) {
    val file = File(e.trashPath)
    val style = kindStyle(e.kind())
    Box(modifier.clip(RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
        when (e.kind()) {
            FileKind.IMAGE -> AsyncImage(model = file, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            FileKind.VIDEO -> {
                Box(Modifier.fillMaxSize().background(Color.Black)) { VideoThumb(file) }
                Icon(Icons.Rounded.PlayCircle, null, tint = Color.White, modifier = Modifier.size(24.dp))
            }
            else -> GradientIcon(if (e.isDirectory) Icons.Rounded.Folder else style.icon, if (e.isDirectory) Palette.Orange else style.tint, size = 56.dp)
        }
    }
}

/** Full-screen look at a deleted item: view the picture, play the video or song, read the text, then restore. */
@Composable
private fun BinPreview(entry: TrashEntity, onClose: () -> Unit, onRestore: () -> Unit, onDelete: () -> Unit) {
    val file = File(entry.trashPath)
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(Color(0xFF0E1020)).statusBarsPadding().navigationBarsPadding().testTag("bin_preview")) {
            Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Rounded.Close, "Close", tint = Color.White) }
                Column(Modifier.weight(1f)) {
                    Text(entry.name, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${if (entry.isDirectory) "Folder" else Formatters.size(entry.size)} · from ${entry.fromFolder()} · ${entry.daysLeft()} days left",
                        color = Color.White.copy(alpha = 0.65f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                if (!file.exists()) {
                    Unavailable(entry, "The deleted copy is missing, so it can't be shown.")
                } else when (entry.kind()) {
                    FileKind.IMAGE -> AsyncImage(model = file, contentDescription = entry.name, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                    FileKind.VIDEO -> TrashVideo(file)
                    FileKind.AUDIO -> CompactAudioPlayer(file, entry.name, Modifier.fillMaxWidth().padding(horizontal = 28.dp))
                    FileKind.TEXT, FileKind.CODE -> TrashText(file)
                    else -> if (entry.isDirectory) TrashFolder(file) else Unavailable(entry, "Preview isn't available for this type. Restore it to open it.")
                }
            }
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = onDelete,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF8A9A)),
                    modifier = Modifier.weight(1f).height(52.dp),
                ) {
                    Icon(Icons.Rounded.DeleteForever, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Delete forever")
                }
                Button(
                    onClick = onRestore,
                    colors = ButtonDefaults.buttonColors(containerColor = Palette.Green, contentColor = Color.White),
                    modifier = Modifier.weight(1f).height(52.dp).testTag("preview_restore"),
                ) {
                    Icon(Icons.Rounded.Restore, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Restore", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun Unavailable(entry: TrashEntity, message: String) {
    val style = kindStyle(entry.kind())
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
        GradientIcon(if (entry.isDirectory) Icons.Rounded.Folder else style.icon, style.tint, size = 96.dp)
        Spacer(Modifier.height(16.dp))
        Text(message, color = Color.White.copy(alpha = 0.75f), textAlign = TextAlign.Center)
    }
}

@Composable
private fun TrashVideo(file: File) {
    val context = LocalContext.current
    val video = remember(file) { VideoView(context) }
    DisposableEffect(file) {
        val controller = MediaController(context).apply { setAnchorView(video) }
        video.setMediaController(controller)
        video.setVideoPath(file.absolutePath)
        video.setOnPreparedListener { video.start() }
        onDispose { video.stopPlayback() }
    }
    AndroidView(factory = { video }, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun TrashText(file: File) {
    val text by produceState("", file) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                file.inputStream().use { input ->
                    val buf = ByteArray(64 * 1024)
                    val n = input.read(buf).coerceAtLeast(0)
                    String(buf, 0, n, Charsets.UTF_8) + if (file.length() > n) "\n\n… (first 64 KB shown)" else ""
                }
            }.getOrDefault("This file can't be read.")
        }
    }
    Text(
        text, color = Color(0xFFE6E8F2), fontFamily = FontFamily.Monospace, fontSize = 13.sp,
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    )
}

@Composable
private fun TrashFolder(dir: File) {
    val children by produceState<List<File>?>(null, dir) {
        value = withContext(Dispatchers.IO) { dir.listFiles()?.sortedBy { it.name.lowercase() }.orEmpty() }
    }
    val list = children ?: return
    if (list.isEmpty()) {
        Text("This folder is empty.", color = Color.White.copy(alpha = 0.7f))
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        item { Text("${Formatters.count(list.size, "item")} inside", color = Color.White.copy(alpha = 0.65f), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(bottom = 8.dp)) }
        items(list.take(300), key = { it.absolutePath }) { f ->
            val style = kindStyle(FileTypes.kindOf(f.name, f.isDirectory))
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (FileTypes.kindOf(f.name, f.isDirectory) == FileKind.IMAGE) {
                    AsyncImage(model = f, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)))
                } else {
                    GradientIcon(if (f.isDirectory) Icons.Rounded.Folder else style.icon, if (f.isDirectory) Palette.Orange else style.tint, size = 40.dp)
                }
                Spacer(Modifier.width(12.dp))
                Text(f.name, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (f.isFile) Text(Formatters.size(f.length()), color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

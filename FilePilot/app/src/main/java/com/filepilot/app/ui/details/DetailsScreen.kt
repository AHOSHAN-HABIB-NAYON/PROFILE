package com.filepilot.app.ui.details

import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarOutline
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.actions.SystemIntents
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.FileType
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.Format
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.ErrorState
import com.filepilot.app.ui.components.FileActionsHost
import com.filepilot.app.ui.components.FileThumb
import com.filepilot.app.ui.components.rememberFileActions
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.theme.style
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class FolderStats(val files: Int, val folders: Int, val bytes: Long, val truncated: Boolean)

@Composable
fun DetailsScreen(initial: FileItem?) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val actions = rememberFileActions()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val version by container.operations.version.collectAsStateWithLifecycle()

    if (initial == null) {
        Scaffold(topBar = { BackTopBar("Details", navigator::back) }) { p ->
            ErrorState("This item can't be shown", onRetry = null, modifier = Modifier.padding(p))
        }
        return
    }
    var item by remember { mutableStateOf<FileItem>(initial) }
    var missing by remember { mutableStateOf(false) }
    var extra by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var folderStats by remember { mutableStateOf<FolderStats?>(null) }
    var computing by remember { mutableStateOf(false) }
    var deletedHere by remember { mutableStateOf(false) }

    LaunchedEffect(version) {
        val fresh = container.files.refresh(item)
        if (fresh == null) missing = true else item = fresh
        extra = withContext(Dispatchers.IO) { mediaDetails(context, item) }
    }
    val isFavorite = favorites.any { it.id == item.id }

    Scaffold(
        topBar = {
            BackTopBar("Details", navigator::back, actions = {
                IconButton(onClick = { actions.menuFor = item }) { Icon(Icons.Rounded.MoreVert, "More actions") }
            })
        },
    ) { padding ->
        if (missing) {
            ErrorState("This item was moved or deleted.", onRetry = null, modifier = Modifier.padding(padding))
            return@Scaffold
        }
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(8.dp))
            FileThumb(item, size = 112.dp, corner = 28.dp)
            Spacer(Modifier.height(14.dp))
            SelectionContainer {
                Text(
                    item.name,
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 24.dp),
                )
            }
            Text(item.type.style().label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
                FilledTonalButton(onClick = { navigator.open(item) }) {
                    Icon(Icons.Rounded.Visibility, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Open")
                }
                if (!item.isDirectory) {
                    OutlinedButton(onClick = { SystemIntents.share(context, listOf(item))?.let { container.message(it) } }) {
                        Icon(Icons.Rounded.Share, null)
                    }
                }
                OutlinedButton(onClick = {
                    scope.launch {
                        val added = container.store.toggleFavorite(item)
                        container.message(if (added) "Added to favorites" else "Removed from favorites")
                    }
                }) { Icon(if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarOutline, if (isFavorite) "Remove from favorites" else "Add to favorites") }
                if (item.source != SourceKind.MEDIA && item.canDelete) {
                    OutlinedButton(onClick = { actions.deleting = listOf(item) }) {
                        Icon(Icons.Rounded.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
            Spacer(Modifier.height(20.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(horizontal = 16.dp))

            DetailRow("Name", item.name)
            DetailRow("Type", if (item.isDirectory) "Folder" else item.type.style().label + (item.extension.takeIf { it.isNotEmpty() }?.let { " (.$it)" } ?: ""))
            if (!item.isDirectory) DetailRow("MIME type", item.mimeType)
            if (!item.isDirectory) {
                DetailRow("Size", if (item.size >= 0) "${Format.size(item.size)} (${"%,d".format(item.size)} bytes)" else "Unknown")
            } else {
                val stats = folderStats
                if (stats != null) {
                    DetailRow("Contents", "${Format.items(stats.files)} in ${stats.folders} folder${if (stats.folders == 1) "" else "s"}" + if (stats.truncated) " (partial)" else "")
                    DetailRow("Total size", Format.size(stats.bytes))
                } else if (item.source != SourceKind.MEDIA) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Total size", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.35f))
                        TextButton(enabled = !computing, onClick = {
                            computing = true
                            scope.launch {
                                folderStats = computeFolder(container, item)
                                computing = false
                            }
                        }) { Text(if (computing) "Calculating…" else "Calculate") }
                    }
                }
            }
            DetailRow("Modified", Format.dateTime(item.lastModified))
            DetailRow(
                "Location",
                when (item.source) {
                    SourceKind.LOCAL -> item.path?.substringBeforeLast('/') ?: "—"
                    SourceKind.SAF -> "Picked folder (via Android folder picker)"
                    SourceKind.MEDIA -> "Media library"
                },
                selectable = true,
            )
            DetailRow(
                "Access",
                when {
                    item.source == SourceKind.MEDIA -> "Read-only (media access)"
                    item.canDelete || item.canWrite -> "Can be changed by FilePilot"
                    else -> "Read-only"
                },
            )
            if (item.source == SourceKind.LOCAL && item.path?.let { java.io.File(it).isHidden } == true) DetailRow("Hidden", "Yes")
            extra.forEach { (k, v) -> DetailRow(k, v) }
        }
    }

    FileActionsHost(
        actions,
        favoriteIds = favorites.mapTo(HashSet()) { it.id },
        onRenamed = { item = it },
        onDeleteStarted = { deletedHere = true },
    )
    // Once a delete started here finishes, the refresh marks the item missing; leave the screen then.
    LaunchedEffect(missing, deletedHere) { if (missing && deletedHere) navigator.back() }
}

@Composable
private fun DetailRow(label: String, value: String, selectable: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.35f))
        if (selectable) {
            SelectionContainer(Modifier.weight(0.65f)) { Text(value, style = MaterialTheme.typography.bodyMedium) }
        } else {
            Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(0.65f))
        }
    }
}

private suspend fun computeFolder(container: com.filepilot.app.AppContainer, item: FileItem): FolderStats = withContext(Dispatchers.IO) {
    var files = 0
    var folders = 0
    var bytes = 0L
    var visited = 0
    val queue = ArrayDeque<FileItem>()
    queue.add(item)
    while (queue.isNotEmpty() && visited < 200_000) {
        val dir = queue.removeFirst()
        val loc = dir.asLocation() ?: continue
        val children = runCatching { container.files.list(loc, showHidden = true) }.getOrDefault(emptyList())
        for (c in children) {
            visited++
            if (c.isDirectory) {
                folders++
                queue.add(c)
            } else {
                files++
                bytes += c.size.coerceAtLeast(0)
            }
        }
    }
    FolderStats(files, folders, bytes, queue.isNotEmpty())
}

/** Image dimensions and media duration, read locally. */
private fun mediaDetails(context: android.content.Context, item: FileItem): List<Pair<String, String>> {
    val out = mutableListOf<Pair<String, String>>()
    try {
        when (item.type) {
            FileType.IMAGE -> {
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(if (item.source == SourceKind.LOCAL) android.net.Uri.fromFile(java.io.File(item.path!!)) else item.uri)
                    ?.use { BitmapFactory.decodeStream(it, null, opts) }
                if (opts.outWidth > 0) out += "Dimensions" to "${opts.outWidth} × ${opts.outHeight}"
            }
            FileType.VIDEO, FileType.AUDIO -> {
                val r = MediaMetadataRetriever()
                try {
                    if (item.source == SourceKind.LOCAL) r.setDataSource(item.path) else r.setDataSource(context, item.uri)
                    r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { out += "Duration" to formatDuration(it) }
                    if (item.type == FileType.VIDEO) {
                        val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                        val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                        if (w != null && h != null) out += "Resolution" to "$w × $h"
                    } else {
                        r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.let { out += "Artist" to it }
                        r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.let { out += "Album" to it }
                    }
                } finally {
                    runCatching { r.release() }
                }
            }
            else -> Unit
        }
    } catch (_: Exception) {
        // Metadata is optional; unreadable files simply show fewer rows.
    }
    return out
}

fun formatDuration(ms: Long): String {
    val total = ms / 1000
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

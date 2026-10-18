package com.webtecit.nayon.feature.downloads

import android.app.Application
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.text.format.Formatter
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Android
import androidx.compose.material.icons.outlined.Audiotrack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn

data class DownloadItem(
    val id: Long,
    val name: String,
    val status: Int,
    val total: Long,
    val done: Long,
    val mime: String?,
    val time: Long,
) {
    val isRunning get() = status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_PAUSED
    val isDone get() = status == DownloadManager.STATUS_SUCCESSFUL
    val isFailed get() = status == DownloadManager.STATUS_FAILED
}

/** Reads this app's downloads from Android's DownloadManager (it only returns our own). */
class DownloadsViewModel(app: Application) : AndroidViewModel(app) {
    private val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    val items: StateFlow<List<DownloadItem>?> = flow {
        while (true) {
            val list = query()
            emit(list)
            delay(if (list.any { it.isRunning }) 600 else 2_000)
        }
    }.flowOn(Dispatchers.IO).stateIn(viewModelScope, SharingStarted.WhileSubscribed(2_000), null)

    private fun query(): List<DownloadItem> = runCatching {
        dm.query(DownloadManager.Query()).use { c -> generateSequence { if (c.moveToNext()) c.toItem() else null }.toList() }
    }.getOrDefault(emptyList()).sortedByDescending { it.time }

    private fun Cursor.toItem() = DownloadItem(
        id = getLong(getColumnIndexOrThrow(DownloadManager.COLUMN_ID)),
        name = getString(getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)).orEmpty(),
        status = getInt(getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
        total = getLong(getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)),
        done = getLong(getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
        mime = getString(getColumnIndexOrThrow(DownloadManager.COLUMN_MEDIA_TYPE)),
        time = getLong(getColumnIndexOrThrow(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP)),
    )

    /** Removes the download and deletes its file. Also cancels a running download. */
    fun remove(id: Long) { runCatching { dm.remove(id) } }

    fun uriFor(id: Long): Uri? = runCatching { dm.getUriForDownloadedFile(id) }.getOrNull()
    fun mimeFor(id: Long): String? = runCatching { dm.getMimeTypeForDownloadedFile(id) }.getOrNull()
}

private enum class Filter { ALL, RUNNING, DONE }

@Composable
fun DownloadsScreen(onBack: () -> Unit, viewModel: DownloadsViewModel = viewModel(factory = NayonViewModelFactory.Factory)) {
    val context = LocalContext.current
    val items by viewModel.items.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf(Filter.ALL) }

    fun open(item: DownloadItem) {
        val uri = viewModel.uriFor(item.id) ?: return
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, viewModel.mimeFor(item.id) ?: item.mime ?: "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(intent) } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, R.string.downloads_no_app, Toast.LENGTH_SHORT).show()
        }
    }

    fun share(item: DownloadItem) {
        val uri = viewModel.uriFor(item.id) ?: return
        val send = Intent(Intent.ACTION_SEND).setType(viewModel.mimeFor(item.id) ?: "*/*")
            .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { context.startActivity(Intent.createChooser(send, item.name)) }
    }

    ScreenScaffold(title = stringResource(R.string.downloads_title), onBack = onBack) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                FilterChip(filter == Filter.ALL, { filter = Filter.ALL }, label = { Text(stringResource(R.string.downloads_all)) })
                FilterChip(filter == Filter.RUNNING, { filter = Filter.RUNNING }, label = { Text(stringResource(R.string.downloads_running)) })
                FilterChip(filter == Filter.DONE, { filter = Filter.DONE }, label = { Text(stringResource(R.string.downloads_done)) })
            }
        }
        val all = items ?: return@ScreenScaffold
        val shown = when (filter) {
            Filter.ALL -> all
            Filter.RUNNING -> all.filter { it.isRunning }
            Filter.DONE -> all.filter { it.isDone }
        }
        if (shown.isEmpty()) {
            item {
                MessageState(Icons.Outlined.Download, stringResource(R.string.downloads_empty_title), stringResource(R.string.downloads_empty_body))
            }
        } else {
            item {
                SettingsGroup {
                    shown.forEachIndexed { i, d ->
                        if (i > 0) GroupDivider()
                        DownloadRow(d, onOpen = { open(d) }, onShare = { share(d) }, onDelete = { viewModel.remove(d.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun DownloadRow(item: DownloadItem, onOpen: () -> Unit, onShare: () -> Unit, onDelete: () -> Unit) {
    val context = LocalContext.current
    val scheme = MaterialTheme.colorScheme
    var menu by remember { mutableStateOf(false) }
    val (icon, tint) = typeIcon(item)
    val size = { b: Long -> if (b > 0) Formatter.formatShortFileSize(context, b) else "" }
    val status = when {
        item.isDone -> listOf(size(item.total), stringResource(R.string.downloads_status_done)).filter { it.isNotEmpty() }.joinToString(" · ")
        item.isFailed -> stringResource(R.string.downloads_status_failed)
        item.status == DownloadManager.STATUS_PAUSED -> stringResource(R.string.downloads_status_waiting)
        else -> if (item.total > 0) "${size(item.done)} / ${size(item.total)}" else stringResource(R.string.downloads_status_starting)
    }
    Row(
        Modifier.fillMaxWidth().clickable(enabled = item.isDone, role = Role.Button, onClick = onOpen)
            .padding(start = Spacing.lg, top = Spacing.md, bottom = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(tint.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint)
        }
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Text(item.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (item.isRunning) {
                if (item.total > 0) {
                    LinearProgressIndicator(progress = { (item.done.toFloat() / item.total).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().height(4.dp).clip(CircleShape))
                } else {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth().height(4.dp).clip(CircleShape))
                }
            }
            Text(status, style = MaterialTheme.typography.bodySmall,
                color = if (item.isFailed) scheme.error else scheme.onSurfaceVariant)
        }
        if (item.isRunning) {
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Close, stringResource(R.string.action_cancel)) }
        } else {
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (item.isDone) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.downloads_open)) },
                            leadingIcon = { Icon(Icons.Outlined.OpenInNew, null) }, onClick = { menu = false; onOpen() })
                        DropdownMenuItem(text = { Text(stringResource(R.string.action_share)) },
                            leadingIcon = { Icon(Icons.Outlined.Share, null) }, onClick = { menu = false; onShare() })
                    }
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_delete)) },
                        leadingIcon = { Icon(Icons.Outlined.Delete, null) }, onClick = { menu = false; onDelete() })
                }
            }
        }
    }
}

private fun typeIcon(item: DownloadItem): Pair<ImageVector, Color> {
    val mime = item.mime.orEmpty()
    val name = item.name.lowercase()
    return when {
        name.endsWith(".apk") || mime == "application/vnd.android.package-archive" -> Icons.Outlined.Android to Color(0xFF16A34A)
        mime.startsWith("image/") -> Icons.Outlined.Image to Color(0xFF7C3AED)
        mime.startsWith("video/") -> Icons.Outlined.Movie to Color(0xFF2563EB)
        mime.startsWith("audio/") -> Icons.Outlined.Audiotrack to Color(0xFF0891B2)
        mime == "application/pdf" || name.endsWith(".pdf") -> Icons.Outlined.PictureAsPdf to Color(0xFFDC2626)
        name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".7z") -> Icons.Outlined.FolderZip to Color(0xFFD97706)
        mime.startsWith("text/") || name.endsWith(".doc") || name.endsWith(".docx") -> Icons.Outlined.Description to Color(0xFF0D9488)
        else -> Icons.Outlined.InsertDriveFile to Color(0xFF64748B)
    }
}

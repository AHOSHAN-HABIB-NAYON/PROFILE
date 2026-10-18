package com.webtecit.nayon.feature.downloads

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.text.format.DateUtils
import android.text.format.Formatter
import android.util.Size
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Android
import androidx.compose.material.icons.outlined.Audiotrack
import androidx.compose.material.icons.outlined.ContentCopy
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
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.downloads.DownloadEngine
import com.webtecit.nayon.data.downloads.DownloadFiles
import com.webtecit.nayon.data.downloads.DownloadRecord
import com.webtecit.nayon.data.downloads.DownloadStatus
import com.webtecit.nayon.data.downloads.LiveProgress
import com.webtecit.nayon.feature.browser.copyText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.withContext
import java.util.Calendar

class DownloadsViewModel(val engine: DownloadEngine) : ViewModel() {
    val records: StateFlow<List<DownloadRecord>?> = engine.records.stateIn(viewModelScope, SharingStarted.WhileSubscribed(3_000), null)
    val live: StateFlow<Map<Long, LiveProgress>> = engine.live
    fun pause(id: Long) = engine.pause(id)
    fun resume(id: Long) = engine.start(id)
    fun delete(id: Long) = engine.delete(id)
}

private enum class Kind(val label: Int) {
    ALL(R.string.downloads_all), VIDEO(R.string.dl_videos), AUDIO(R.string.dl_audio), IMAGE(R.string.dl_images),
    DOCUMENT(R.string.dl_documents), APP(R.string.dl_apps), OTHER(R.string.dl_other),
}

private fun kindOf(r: DownloadRecord): Kind {
    val mime = DownloadFiles.mime(r)
    val name = r.fileName.lowercase()
    return when {
        name.endsWith(".apk") || mime == "application/vnd.android.package-archive" -> Kind.APP
        mime.startsWith("video/") -> Kind.VIDEO
        mime.startsWith("audio/") -> Kind.AUDIO
        mime.startsWith("image/") -> Kind.IMAGE
        mime == "application/pdf" || mime.startsWith("text/") || listOf(".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt")
            .any { name.endsWith(it) } -> Kind.DOCUMENT
        else -> Kind.OTHER
    }
}

@Composable
fun DownloadsScreen(onBack: () -> Unit, viewModel: DownloadsViewModel = viewModel(factory = NayonViewModelFactory.Factory)) {
    val context = LocalContext.current
    val records by viewModel.records.collectAsStateWithLifecycle()
    val live by viewModel.live.collectAsStateWithLifecycle()
    var kind by rememberSaveable { mutableStateOf(Kind.ALL) }
    val storage = remember {
        runCatching {
            val stat = StatFs(Environment.getExternalStorageDirectory().path)
            stat.totalBytes - stat.availableBytes to stat.totalBytes
        }.getOrNull()
    }

    ScreenScaffold(title = stringResource(R.string.downloads_title), onBack = onBack) {
        storage?.let { (used, total) ->
            item {
                Text(
                    stringResource(R.string.dl_storage, Formatter.formatShortFileSize(context, used), Formatter.formatShortFileSize(context, total)),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        val all = records ?: return@ScreenScaffold
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Kind.entries.forEach { k ->
                    val count = if (k == Kind.ALL) all.size else all.count { kindOf(it) == k }
                    if (k == Kind.ALL || count > 0) {
                        FilterChip(kind == k, { kind = k }, label = { Text("${stringResource(k.label)} · $count") })
                    }
                }
            }
        }
        val shown = if (kind == Kind.ALL) all else all.filter { kindOf(it) == kind }
        if (shown.isEmpty()) {
            item { MessageState(Icons.Outlined.Download, stringResource(R.string.downloads_empty_title), stringResource(R.string.downloads_empty_body)) }
            return@ScreenScaffold
        }
        val active = shown.filter { it.status != DownloadStatus.COMPLETED }
        if (active.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.dl_in_progress)) }
            active.forEach { r ->
                item(key = "a${r.id}") {
                    ActiveCard(r, live[r.id], onPause = { viewModel.pause(r.id) }, onResume = { viewModel.resume(r.id) },
                        onCancel = { viewModel.delete(r.id) })
                }
            }
        }
        shown.filter { it.status == DownloadStatus.COMPLETED }
            .groupBy { dayLabelKey(it.finishedAt.takeIf { t -> t > 0 } ?: it.createdAt) }
            .forEach { (key, group) ->
                item(key = "h$key") { SectionHeader(dayLabel(context, key)) }
                item(key = "g$key") {
                    SettingsGroup {
                        group.forEachIndexed { i, r ->
                            if (i > 0) GroupDivider()
                            DoneRow(r, onOpen = { DownloadFiles.open(context, r) }, onShare = { DownloadFiles.share(context, r) },
                                onCopyLink = { copyText(context, r.url) }, onDelete = { viewModel.delete(r.id) })
                        }
                    }
                }
            }
    }
}

private fun dayLabelKey(time: Long): Long = Calendar.getInstance().apply {
    timeInMillis = time; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.timeInMillis

private fun dayLabel(context: android.content.Context, dayStart: Long): String = when {
    DateUtils.isToday(dayStart) -> context.getString(R.string.history_today)
    DateUtils.isToday(dayStart + DateUtils.DAY_IN_MILLIS) -> context.getString(R.string.history_yesterday)
    else -> DateUtils.formatDateTime(context, dayStart, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR)
}

@Composable
private fun ActiveCard(r: DownloadRecord, live: LiveProgress?, onPause: () -> Unit, onResume: () -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val scheme = MaterialTheme.colorScheme
    val running = live != null && (r.status == DownloadStatus.RUNNING || r.status == DownloadStatus.QUEUED)
    val done = live?.downloaded ?: r.downloadedBytes
    val total = (live?.total ?: r.totalBytes).takeIf { it > 0 }
    val fraction = if (total != null) (done.toFloat() / total).coerceIn(0f, 1f) else null
    val (icon, tint) = typeIcon(kindOf(r))
    Surface(shape = MaterialTheme.shapes.extraLarge, color = scheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().animateContentSize()) {
        Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TypeBadge(icon, tint)
                Spacer(Modifier.width(Spacing.md))
                Column(Modifier.weight(1f)) {
                    Text(r.fileName, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(r.sourceHost.ifBlank { "—" }, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, maxLines = 1)
                }
                when {
                    running -> FilledTonalIconButton(onClick = onPause) { Icon(Icons.Filled.Pause, stringResource(R.string.dl_pause)) }
                    r.status == DownloadStatus.FAILED -> FilledTonalIconButton(onClick = onResume) { Icon(Icons.Filled.Refresh, stringResource(R.string.action_retry)) }
                    else -> FilledTonalIconButton(onClick = onResume) { Icon(Icons.Filled.PlayArrow, stringResource(R.string.dl_resume)) }
                }
                IconButton(onClick = onCancel) { Icon(Icons.Filled.Close, stringResource(R.string.action_cancel)) }
            }
            if (fraction != null) {
                LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape))
            } else if (running) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                val sizeText = if (total != null) "${Formatter.formatShortFileSize(context, done)} / ${Formatter.formatShortFileSize(context, total)}"
                else Formatter.formatShortFileSize(context, done)
                Text(sizeText, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                when {
                    running && live != null -> {
                        Icon(Icons.Outlined.Speed, null, tint = scheme.primary, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(Spacing.xs))
                        val speed = "${Formatter.formatShortFileSize(context, live.bytesPerSecond)}/s"
                        val eta = if (total != null && live.bytesPerSecond > 0) " · " + DateUtils.formatElapsedTime((total - done) / live.bytesPerSecond) else ""
                        Text("$speed$eta", style = MaterialTheme.typography.labelMedium, color = scheme.primary, fontWeight = FontWeight.SemiBold)
                        if (live.connections > 1) {
                            Text("  ·  ${stringResource(R.string.dl_connections, live.connections)}", style = MaterialTheme.typography.labelSmall,
                                color = scheme.onSurfaceVariant)
                        }
                    }
                    r.status == DownloadStatus.FAILED -> Text(stringResource(R.string.downloads_status_failed), style = MaterialTheme.typography.labelMedium, color = scheme.error)
                    r.status == DownloadStatus.PAUSED -> Text(stringResource(R.string.dl_paused), style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
                    else -> Text(stringResource(R.string.downloads_status_starting), style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun DoneRow(r: DownloadRecord, onOpen: () -> Unit, onShare: () -> Unit, onCopyLink: () -> Unit, onDelete: () -> Unit) {
    val context = LocalContext.current
    val scheme = MaterialTheme.colorScheme
    var menu by remember { mutableStateOf(false) }
    val kind = kindOf(r)
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen).padding(start = Spacing.lg, top = Spacing.md, bottom = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val thumb by produceState<Bitmap?>(null, r.id) { value = if (kind == Kind.IMAGE || kind == Kind.VIDEO) loadThumbnail(context, r) else null }
        val t = thumb
        if (t != null) {
            Image(t.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)))
        } else {
            val (icon, tint) = typeIcon(kind)
            TypeBadge(icon, tint, size = 52)
        }
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(r.fileName, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(Formatter.formatShortFileSize(context, r.totalBytes.coerceAtLeast(0)), r.sourceHost).filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, maxLines = 1,
            )
        }
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu)) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text(stringResource(R.string.downloads_open)) }, leadingIcon = { Icon(Icons.Outlined.OpenInNew, null) },
                    onClick = { menu = false; onOpen() })
                DropdownMenuItem(text = { Text(stringResource(R.string.action_share)) }, leadingIcon = { Icon(Icons.Outlined.Share, null) },
                    onClick = { menu = false; onShare() })
                if (r.url.startsWith("http")) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.ctx_copy_link)) }, leadingIcon = { Icon(Icons.Outlined.ContentCopy, null) },
                        onClick = { menu = false; onCopyLink() })
                }
                DropdownMenuItem(text = { Text(stringResource(R.string.action_delete)) }, leadingIcon = { Icon(Icons.Outlined.Delete, null) },
                    onClick = { menu = false; onDelete() })
            }
        }
    }
}

@Composable
private fun TypeBadge(icon: ImageVector, tint: Color, size: Int = 44) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size / 4).dp)).background(tint.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size((size / 2).dp))
    }
}

private fun typeIcon(kind: Kind): Pair<ImageVector, Color> = when (kind) {
    Kind.APP -> Icons.Outlined.Android to Color(0xFF16A34A)
    Kind.IMAGE -> Icons.Outlined.Image to Color(0xFF7C3AED)
    Kind.VIDEO -> Icons.Outlined.Movie to Color(0xFF2563EB)
    Kind.AUDIO -> Icons.Outlined.Audiotrack to Color(0xFF0891B2)
    Kind.DOCUMENT -> Icons.Outlined.Description to Color(0xFF0D9488)
    Kind.OTHER, Kind.ALL -> Icons.Outlined.InsertDriveFile to Color(0xFF64748B)
}


private suspend fun loadThumbnail(context: android.content.Context, r: DownloadRecord): Bitmap? = withContext(Dispatchers.IO) {
    val uri = DownloadFiles.contentUri(context, r) ?: return@withContext null
    runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            context.contentResolver.loadThumbnail(uri, Size(160, 160), null)
        } else if (kindOf(r) == Kind.IMAGE) {
            val opts = BitmapFactory.Options().apply { inSampleSize = 8 }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        } else {
            null
        }
    }.getOrNull()
}


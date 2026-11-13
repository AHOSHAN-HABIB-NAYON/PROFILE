package com.webtecit.devicepilot.ui.cleaner

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.storage.StorageManager
import android.provider.Settings
import android.text.format.DateFormat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AudioFile
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.AppCache
import com.webtecit.devicepilot.data.AppSettings
import com.webtecit.devicepilot.data.BigFile
import com.webtecit.devicepilot.data.JunkGroup
import com.webtecit.devicepilot.data.JunkKind
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.ConfirmDialog
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.IconBadge
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.Meter
import com.webtecit.devicepilot.ui.common.PermissionCard
import com.webtecit.devicepilot.ui.common.RestrictedSettingsHelp
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.pressureLevel
import kotlinx.coroutines.launch
import java.io.File
import java.util.Date

private enum class Pending { JUNK, BIG }

@Composable
fun CleanerScreen() {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by c.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())

    var usageAccess by remember { mutableStateOf(c.usage.hasUsageAccess()) }
    var allFiles by remember { mutableStateOf(c.cleaner.hasAllFilesAccess()) }
    var storage by remember { mutableStateOf(c.monitor.storage()) }

    var caches by remember { mutableStateOf<List<AppCache>?>(null) }
    var cacheLoading by remember { mutableStateOf(false) }
    var cacheBefore by remember { mutableStateOf<Long?>(null) }
    var cacheMessage by remember { mutableStateOf<String?>(null) }

    var scanning by remember { mutableStateOf(false) }
    var scanJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    var scanned by remember { androidx.compose.runtime.mutableIntStateOf(0) }
    var junk by remember { mutableStateOf<List<JunkGroup>?>(null) }
    val junkSelected = remember { mutableStateListOf<JunkKind>() }
    var bigFiles by remember { mutableStateOf<List<BigFile>?>(null) }
    val bigSelected = remember { mutableStateListOf<String>() }
    var confirm by remember { mutableStateOf<Pending?>(null) }
    var resultMessage by remember { mutableStateOf<String?>(null) }

    val freedFmt = stringResource(R.string.clean_freed)
    val cacheFreedFmt = stringResource(R.string.clean_cache_freed)

    fun loadCaches() {
        if (!usageAccess || cacheLoading) return
        cacheLoading = true
        scope.launch { caches = c.cleaner.appCaches(); cacheLoading = false }
    }

    val clearAllCache = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val before = cacheBefore
        scope.launch {
            val after = c.cleaner.appCaches()
            caches = after
            if (before != null && after != null) {
                val freed = (before - after.sumOf { it.cacheBytes }).coerceAtLeast(0)
                cacheMessage = String.format(cacheFreedFmt, Formatters.bytes(freed))
            }
            storage = c.monitor.storage()
        }
    }

    val legacyStorage = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        allFiles = c.cleaner.hasAllFilesAccess()
    }

    val pickFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
            scope.launch { c.settings.addScanFolder(uri.toString()) }
        }
    }

    LifecycleResumeEffect(Unit) {
        usageAccess = c.usage.hasUsageAccess()
        allFiles = c.cleaner.hasAllFilesAccess()
        if (caches == null) loadCaches()
        onPauseOrDispose { }
    }

    val fullScan = BuildConfig.FULL && allFiles

    // Scanning runs on a background thread, reports progress and can be cancelled; it also stops
    // automatically when the user leaves this screen (the scope is cancelled).
    fun scan() {
        scanning = true
        scanned = 0
        resultMessage = null
        scanJob = scope.launch {
            try {
                if (fullScan) {
                    val (j, b) = c.cleaner.scanFiles(onProgress = { scanned = it })
                    junk = j
                    bigFiles = b
                    junkSelected.clear(); junkSelected.addAll(j.filter { it.files.isNotEmpty() && it.kind != JunkKind.APK }.map { it.kind })
                } else {
                    var base = 0
                    val found = mutableListOf<BigFile>()
                    for (folder in settings.scanFolders) {
                        val start = base
                        found += c.cleaner.scanTree(Uri.parse(folder), onProgress = { scanned = start + it })
                        base = scanned
                    }
                    bigFiles = found.sortedByDescending { it.size }.take(200)
                }
                bigSelected.clear()
            } finally {
                scanning = false
                scanJob = null
            }
        }
    }

    ScreenList {
        // storage summary
        item {
            val st = storage
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBadge(Icons.Outlined.CleaningServices, size = 40.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.clean_title), style = MaterialTheme.typography.titleMedium)
                        if (st != null) Text(stringResource(R.string.storage_used_of, Formatters.bytes(st.usedBytes), Formatters.bytes(st.totalBytes)),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (st != null) Text("${st.usedPercent}%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                        color = levelColor(pressureLevel(st.pressure)))
                }
                if (st != null) { Spacer(Modifier.height(10.dp)); Meter(st.usedPercent / 100f, levelColor(pressureLevel(st.pressure))) }
            }
        }

        // ---- App cache ----
        item { SectionTitle(stringResource(R.string.clean_cache_section)) }
        if (!usageAccess) {
            item {
                PermissionCard(stringResource(R.string.perm_usage_title), stringResource(R.string.clean_cache_needs_access),
                    stringResource(R.string.perm_grant_in_settings), onClick = { SystemSettings.usageAccess(context) })
            }
            item { RestrictedSettingsHelp() }
        } else item {
            val list = caches
            DpCard {
                if (cacheLoading && list == null) {
                    Text(stringResource(R.string.clean_cache_loading), style = MaterialTheme.typography.bodySmall)
                    LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 6.dp))
                } else if (list == null) {
                    Text(stringResource(R.string.unavailable), style = MaterialTheme.typography.bodySmall)
                } else {
                    val total = list.sumOf { it.cacheBytes }
                    Text(Formatters.bytes(total), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary)
                    Text(stringResource(R.string.clean_cache_total, list.size), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    cacheMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = levelColor(Level.GOOD)) }
                    Spacer(Modifier.height(10.dp))
                    if (BuildConfig.FULL && allFiles && Build.VERSION.SDK_INT >= 30) {
                        Button(onClick = {
                            cacheBefore = total
                            SystemSettings.runCatchingLaunch(context) { clearAllCache.launch(Intent(StorageManager.ACTION_CLEAR_APP_CACHE)) }
                        }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.clean_cache_clear_all)) }
                    } else if (Build.VERSION.SDK_INT >= 25) {
                        Button(onClick = {
                            SystemSettings.open(context, Intent(StorageManager.ACTION_MANAGE_STORAGE), Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS))
                        }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.clean_free_up_space)) }
                    }
                    Spacer(Modifier.height(6.dp))
                    list.take(12).forEach { app ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            AppIcon(app.packageName, 34.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(app.label, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                                Text(Formatters.bytes(app.cacheBytes), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { SystemSettings.appDetails(context, app.packageName) }) {
                                Text(stringResource(R.string.clean_cache_clear_one))
                            }
                        }
                    }
                    SourceNote(stringResource(if (BuildConfig.FULL && allFiles) R.string.clean_cache_note_full else R.string.clean_cache_note))
                }
            }
        }

        // ---- File scan ----
        item { SectionTitle(stringResource(if (fullScan) R.string.clean_junk_section else R.string.clean_big_section)) }
        if (BuildConfig.FULL && !allFiles) item {
            PermissionCard(stringResource(R.string.clean_all_files_title), stringResource(R.string.clean_all_files_text),
                stringResource(R.string.perm_allow), onClick = {
                    if (Build.VERSION.SDK_INT >= 30) {
                        SystemSettings.open(context,
                            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}")),
                            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                    } else legacyStorage.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                })
        }
        if (!fullScan) item {
            DpCard {
                Text(stringResource(R.string.clean_folders_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                settings.scanFolders.forEach { f ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.FolderOpen, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(Uri.decode(f).substringAfterLast(':').ifBlank { "/" }, Modifier.weight(1f), maxLines = 1,
                            overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                        IconButton(onClick = { scope.launch { c.settings.removeScanFolder(f) } }) {
                            Icon(Icons.Outlined.Delete, stringResource(R.string.apk_forget))
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = { pickFolder.launch(null) }) {
                    Icon(Icons.Outlined.CreateNewFolder, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.clean_add_folder))
                }
            }
        }
        item {
            Button(
                onClick = { scan() },
                enabled = !scanning && (fullScan || settings.scanFolders.isNotEmpty()),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Outlined.Search, null); Spacer(Modifier.width(8.dp))
                Text(stringResource(if (scanning) R.string.clean_scanning else R.string.clean_scan))
            }
            if (scanning) {
                LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.clean_scanned, scanned), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { scanJob?.cancel() }) { Text(stringResource(R.string.action_cancel)) }
                }
            }
            resultMessage?.let { Text(it, Modifier.padding(top = 8.dp), color = levelColor(Level.GOOD), style = MaterialTheme.typography.bodyMedium) }
        }

        // junk groups (full edition)
        junk?.let { groups ->
            item {
                DpCard {
                    val selectedBytes = groups.filter { it.kind in junkSelected }.sumOf { it.bytes }
                    groups.forEach { g ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(g.kind in junkSelected, enabled = g.files.isNotEmpty(), onCheckedChange = { on ->
                                if (on) junkSelected.add(g.kind) else junkSelected.remove(g.kind)
                            })
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(junkLabel(g.kind)), style = MaterialTheme.typography.bodyMedium)
                                Text(stringResource(junkHint(g.kind)), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(if (g.kind == JunkKind.EMPTY_FOLDER) "—" else Formatters.bytes(g.bytes), style = MaterialTheme.typography.titleSmall)
                                Text(stringResource(R.string.clean_items, g.files.size), style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { confirm = Pending.JUNK }, enabled = junkSelected.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.clean_junk_button, Formatters.bytes(selectedBytes)))
                    }
                }
            }
            item { SectionTitle(stringResource(R.string.clean_big_section)) }
        }

        // big files
        bigFiles?.let { list ->
            if (list.isEmpty()) item {
                Text(stringResource(R.string.clean_big_none), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                item {
                    val bytes = list.filter { it.path in bigSelected }.sumOf { it.size }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.clean_big_count, list.size), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        FilledTonalButton(onClick = { confirm = Pending.BIG }, enabled = bigSelected.isNotEmpty()) {
                            Text(stringResource(R.string.clean_delete_selected, Formatters.bytes(bytes)))
                        }
                    }
                }
                list.take(100).forEach { f ->
                    item(key = f.path) {
                        BigFileRow(f, f.path in bigSelected) { on -> if (on) bigSelected.add(f.path) else bigSelected.remove(f.path) }
                    }
                }
            }
        }
        item { SourceNote(stringResource(if (BuildConfig.FULL) R.string.clean_note_full else R.string.clean_note_play)) }
    }

    when (confirm) {
        Pending.JUNK -> ConfirmDialog(
            title = stringResource(R.string.clean_confirm_title),
            text = stringResource(R.string.clean_confirm_junk),
            confirm = stringResource(R.string.clean_confirm_button),
            destructive = true,
            onConfirm = {
                confirm = null
                val files = junk.orEmpty().filter { it.kind in junkSelected }.flatMap { it.files }
                scope.launch {
                    val (n, bytes) = c.cleaner.deleteFiles(files)
                    resultMessage = String.format(freedFmt, n, Formatters.bytes(bytes))
                    storage = c.monitor.storage()
                    scan()
                }
            },
            onDismiss = { confirm = null },
        )
        Pending.BIG -> ConfirmDialog(
            title = stringResource(R.string.clean_confirm_title),
            text = stringResource(R.string.clean_confirm_big, bigSelected.size),
            confirm = stringResource(R.string.clean_confirm_button),
            destructive = true,
            onConfirm = {
                confirm = null
                val chosen = bigFiles.orEmpty().filter { it.path in bigSelected }
                scope.launch {
                    var bytes = 0L
                    val deleted = mutableSetOf<String>()
                    chosen.forEach { if (c.cleaner.deleteBig(it)) { deleted += it.path; bytes += it.size } }
                    resultMessage = String.format(freedFmt, deleted.size, Formatters.bytes(bytes))
                    bigFiles = bigFiles.orEmpty().filter { it.path !in deleted }
                    bigSelected.clear()
                    storage = c.monitor.storage()
                }
            },
            onDismiss = { confirm = null },
        )
        null -> Unit
    }
}

@Composable
private fun BigFileRow(f: BigFile, selected: Boolean, onSelect: (Boolean) -> Unit) {
    val context = LocalContext.current
    DpCard(contentPadding = 10.dp, onClick = { onSelect(!selected) }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(selected, onCheckedChange = onSelect)
            IconBadge(fileIcon(f.name), size = 34.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(f.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                Text(listOfNotNull(File(f.path).parent?.let { it.substringAfter("/0/") },
                    f.modified.takeIf { it > 0 }?.let { DateFormat.getMediumDateFormat(context).format(Date(it)) }).joinToString(" · "),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(8.dp))
            Text(Formatters.bytes(f.size), style = MaterialTheme.typography.titleSmall)
        }
    }
}

private fun fileIcon(name: String): ImageVector {
    val n = name.lowercase()
    return when {
        listOf(".mp4", ".mkv", ".avi", ".mov", ".webm", ".3gp").any { n.endsWith(it) } -> Icons.Outlined.Movie
        listOf(".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif").any { n.endsWith(it) } -> Icons.Outlined.Image
        listOf(".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus", ".aac").any { n.endsWith(it) } -> Icons.Outlined.AudioFile
        else -> Icons.Outlined.InsertDriveFile
    }
}

private fun junkLabel(k: JunkKind) = when (k) {
    JunkKind.TEMP -> R.string.junk_temp
    JunkKind.LOG -> R.string.junk_log
    JunkKind.THUMBNAILS -> R.string.junk_thumbs
    JunkKind.APK -> R.string.junk_apk
    JunkKind.EMPTY_FOLDER -> R.string.junk_empty
}

private fun junkHint(k: JunkKind) = when (k) {
    JunkKind.TEMP -> R.string.junk_temp_hint
    JunkKind.LOG -> R.string.junk_log_hint
    JunkKind.THUMBNAILS -> R.string.junk_thumbs_hint
    JunkKind.APK -> R.string.junk_apk_hint
    JunkKind.EMPTY_FOLDER -> R.string.junk_empty_hint
}

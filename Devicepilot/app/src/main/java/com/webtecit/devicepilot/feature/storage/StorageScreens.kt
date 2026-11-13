package com.webtecit.devicepilot.feature.storage

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.EmptyState
import com.webtecit.devicepilot.core.designsystem.ErrorState
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.LocalStatusColors
import com.webtecit.devicepilot.core.designsystem.MetricRing
import com.webtecit.devicepilot.core.designsystem.NavRow
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.PermissionState
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.designsystem.color
import com.webtecit.devicepilot.core.designsystem.toneForUsage
import com.webtecit.devicepilot.core.navigation.Routes
import com.webtecit.devicepilot.core.permissions.PermissionStatus
import com.webtecit.devicepilot.core.permissions.rememberPermissionGroup
import com.webtecit.devicepilot.data.repository.FileClassifier
import com.webtecit.devicepilot.data.repository.MediaAccess
import com.webtecit.devicepilot.domain.model.FileCategory
import com.webtecit.devicepilot.domain.model.FileItem

// ------------------------------------------------------------------------------------ shared bits

fun FileCategory.icon(): ImageVector = when (this) {
    FileCategory.IMAGES -> Icons.Default.Image
    FileCategory.VIDEOS -> Icons.Default.Movie
    FileCategory.AUDIO -> Icons.Default.AudioFile
    FileCategory.DOCUMENTS -> Icons.Default.Description
    FileCategory.DOWNLOADS -> Icons.Default.Download
    FileCategory.APKS -> Icons.Default.Android
    FileCategory.ARCHIVES -> Icons.Default.Archive
    FileCategory.OTHER -> Icons.AutoMirrored.Filled.InsertDriveFile
}

@Composable
fun FileCategory.tint(): Color = when (this) {
    FileCategory.IMAGES -> Brand.Green
    FileCategory.VIDEOS -> MaterialTheme.colorScheme.tertiary
    FileCategory.AUDIO -> Brand.Amber
    FileCategory.DOCUMENTS -> Brand.Teal
    FileCategory.DOWNLOADS -> Brand.Teal
    FileCategory.APKS -> Brand.Green
    FileCategory.ARCHIVES -> Brand.Amber
    FileCategory.OTHER -> MaterialTheme.colorScheme.onSurfaceVariant
}

fun openFile(context: Context, item: FileItem) {
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(item.uri, item.mimeType ?: "*/*")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
        context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "No app can open this file", Toast.LENGTH_SHORT).show()
    } catch (e: SecurityException) {
        Toast.makeText(context, "This file can't be opened", Toast.LENGTH_SHORT).show()
    }
}

@Composable
private fun rememberFolderPicker(viewModel: StorageViewModel) =
    rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri -> uri?.let(viewModel::scanFolder) }

@Composable
private fun MessageEffect(viewModel: StorageViewModel, snackbar: SnackbarHostState) {
    val msg by viewModel.messages.collectAsStateWithLifecycle()
    LaunchedEffect(msg) {
        msg?.let { snackbar.showSnackbar(it); viewModel.messageShown() }
    }
}

/** Media permission gate shared by every storage screen. */
@Composable
private fun MediaGate(viewModel: StorageViewModel, content: @Composable () -> Unit) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val perms = rememberPermissionGroup(viewModel.repo.mediaPermissions()) { viewModel.refresh(force = true) }
    LaunchedEffect(perms.status) { viewModel.refresh() }
    if (ui.access == MediaAccess.NONE && !perms.granted) {
        PermissionState(
            title = "Allow access to your media",
            rationale = "Devicepilot reads photos, videos and audio on this phone to measure them and find large or duplicate files. Nothing is uploaded and nothing is deleted without your confirmation.",
            onGrant = { perms.request() },
            onOpenSettings = if (perms.status == PermissionStatus.PERMANENTLY_DENIED) {
                { SystemIntents.appDetails(context, context.packageName) }
            } else null,
        )
    } else content()
}

// ------------------------------------------------------------------------------------ overview

@Composable
fun StorageScreen(navigate: (String) -> Unit, viewModel: StorageViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val picker = rememberFolderPicker(viewModel)
    val context = LocalContext.current
    MessageEffect(viewModel, snackbar)
    DeleteConsentHandler(viewModel)

    DpScaffold("Storage Analyzer", null, snackbarHostState = snackbar, actions = {
        IconButton(onClick = { viewModel.refresh(force = true) }) { Icon(Icons.Default.Refresh, contentDescription = "Rescan") }
    }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            ui.storage?.let { st ->
                item {
                    DpCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MetricRing(st.usedFraction, size = 112.dp, color = toneForUsage(st.usedFraction).color()) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(Formatters.percent(st.usedFraction * 100), style = MaterialTheme.typography.titleLarge)
                                    Text("used", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Spacer(Modifier.width(Spacing.lg))
                            Column(Modifier.weight(1f)) {
                                Text("Internal storage", style = MaterialTheme.typography.titleMedium)
                                InfoRow("Total", Formatters.bytes(st.totalBytes))
                                InfoRow("Used", Formatters.bytes(st.usedBytes))
                                InfoRow("Free", Formatters.bytes(st.freeBytes))
                            }
                        }
                        OutlinedButton(onClick = { SystemIntents.manageStorage(context) }) { Text("Open system storage") }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    ToolTile(Icons.Default.SdStorage, "Large files", Modifier.weight(1f)) { navigate(Routes.files("LARGE")) }
                    ToolTile(Icons.Default.ContentCopy, "Duplicates", Modifier.weight(1f)) { navigate(Routes.DUPLICATES) }
                    ToolTile(Icons.Default.CleaningServices, "Junk cleaner", Modifier.weight(1f)) { navigate(Routes.JUNK) }
                }
            }
            item {
                MediaGate(viewModel) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                        if (ui.access == MediaAccess.PARTIAL) {
                            DpCard {
                                StatusChip("Limited access", Tone.WARNING)
                                Spacer(Modifier.height(4.dp))
                                NoteText("You allowed only selected photos and videos, so totals below include only those files.")
                            }
                        }
                        if (ui.scanning) LoadingState(ui.progress ?: "Scanning…")
                        ui.error?.let { ErrorState(it) { viewModel.refresh(force = true) } }
                        val stats = ui.stats.filter { it.category in settings.scanCategories }
                        if (ui.media != null) {
                            DpCard {
                                SectionHeader("By category", subtitle = "${ui.allFiles.size} files · ${Formatters.bytes(ui.allFiles.sumOf { it.sizeBytes })}")
                                if (stats.isEmpty()) NoteText("No files found in the selected categories.")
                                stats.forEach { stat ->
                                    NavRow(stat.category.icon(), stat.category.label, "${stat.count} files", tint = stat.category.tint(), trailing = {
                                        Text(Formatters.bytes(stat.bytes), style = MaterialTheme.typography.labelLarge)
                                    }) { navigate(Routes.files(stat.category.name)) }
                                }
                            }
                        }
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("Documents, APKs & folders", subtitle = ui.folder?.let { "Scanned: ${it.rootName} · ${it.scannedFiles} files" })
                    NoteText(
                        if (viewModel.repo.nonMediaVisibleThroughMediaStore)
                            "Documents and APK files are included above. Pick a folder to also find empty folders and temporary files."
                        else
                            "Android 13+ only shares media with apps. To include documents, APKs, temporary files and empty folders, pick a folder (for example a folder inside Download). You choose exactly what Devicepilot can see.",
                    )
                    Spacer(Modifier.height(Spacing.sm))
                    Button(onClick = { picker.launch(null) }) {
                        Icon(Icons.Default.FolderOpen, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(if (ui.folder == null) "Pick a folder to scan" else "Scan another folder")
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("App storage")
                    NoteText("Each app's own data and cache are private. You can review and clear them in the App Manager or system settings.")
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        OutlinedButton(onClick = { navigate(Routes.APPS) }) { Text("App Manager") }
                        OutlinedButton(onClick = { SystemIntents.storage(context) }) { Text("Storage settings") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolTile(icon: ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    com.webtecit.devicepilot.core.designsystem.QuickActionTile(icon, label, MaterialTheme.colorScheme.primary, modifier, onClick)
}

// ------------------------------------------------------------------------------------ file list (large files / category)

enum class SortMode(val label: String) { SIZE("Size"), NAME("Name"), DATE("Date") }

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileListScreen(mode: String, onBack: () -> Unit, viewModel: StorageViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val picker = rememberFolderPicker(viewModel)
    MessageEffect(viewModel, snackbar)
    DeleteConsentHandler(viewModel)

    val isLarge = mode == "LARGE"
    val category = FileCategory.entries.firstOrNull { it.name == mode }
    var sort by rememberSaveable { mutableStateOf(SortMode.SIZE) }
    var filter by rememberSaveable { mutableStateOf<String?>(null) }
    var sortMenu by remember { mutableStateOf(false) }
    val selected = remember { mutableStateListOf<String>() }
    var confirm by remember { mutableStateOf(false) }

    val threshold = settings.largeFileThresholdMb * 1024L * 1024L
    val files = ui.allFiles
        .filter { if (isLarge) it.sizeBytes >= threshold else it.category == category }
        .filter { f -> filter == null || f.category.name == filter }
        .let { list ->
            when (sort) {
                SortMode.SIZE -> list.sortedByDescending { it.sizeBytes }
                SortMode.NAME -> list.sortedBy { it.name.lowercase() }
                SortMode.DATE -> list.sortedByDescending { it.modifiedMillis }
            }
        }
    val selectedItems = files.filter { it.uri.toString() in selected }

    DpScaffold(
        title = if (selected.isNotEmpty()) "${selected.size} selected" else if (isLarge) "Large files" else category?.label ?: "Files",
        onBack = onBack,
        snackbarHostState = snackbar,
        actions = {
            if (selected.isNotEmpty()) {
                IconButton(onClick = { confirm = true }) { Icon(Icons.Default.Delete, contentDescription = "Delete selected", tint = LocalStatusColors.current.error) }
            }
            IconButton(onClick = { sortMenu = true }) { Icon(Icons.Default.Sort, contentDescription = "Sort") }
            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                SortMode.entries.forEach { m ->
                    DropdownMenuItem(text = { Text("Sort by ${m.label}") }, onClick = { sort = m; sortMenu = false })
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
            MediaGate(viewModel) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = Spacing.sm, bottom = Spacing.xxl),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                ) {
                    if (isLarge) {
                        item {
                            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                FilterChip(filter == null, { filter = null }, label = { Text("All") })
                                FileCategory.entries.forEach { c ->
                                    FilterChip(filter == c.name, { filter = if (filter == c.name) null else c.name }, label = { Text(c.label) })
                                }
                            }
                            NoteText("Files of ${settings.largeFileThresholdMb} MB or more. Change the size in Settings › Storage.", Modifier.padding(top = 4.dp))
                        }
                    }
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("${files.size} files · ${Formatters.bytes(files.sumOf { it.sizeBytes })}", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                            if (files.isNotEmpty()) {
                                androidx.compose.material3.TextButton(onClick = {
                                    if (selected.size == files.size) selected.clear()
                                    else { selected.clear(); selected.addAll(files.map { it.uri.toString() }) }
                                }) { Text(if (selected.size == files.size) "Clear selection" else "Select all") }
                            }
                        }
                    }
                    if (ui.scanning) item { LoadingState(ui.progress ?: "Scanning…") }
                    else if (files.isEmpty()) {
                        item {
                            EmptyState(
                                "No files here",
                                if (!viewModel.repo.nonMediaVisibleThroughMediaStore && (category == FileCategory.DOCUMENTS || category == FileCategory.APKS || category == FileCategory.ARCHIVES || category == FileCategory.OTHER))
                                    "On Android 13+ these files are only visible from a folder you pick."
                                else "Nothing matches this view.",
                                actionLabel = "Pick a folder",
                                onAction = { picker.launch(null) },
                            )
                        }
                    }
                    items(files, key = { it.uri.toString() }) { f ->
                        val key = f.uri.toString()
                        FileRow(
                            item = f,
                            checked = key in selected,
                            onCheck = { if (key in selected) selected.remove(key) else selected.add(key) },
                            onOpen = { if (selected.isEmpty()) openFile(context, f) else { if (key in selected) selected.remove(key) else selected.add(key) } },
                        )
                    }
                }
            }
        }
    }
    if (confirm) {
        ConfirmDeleteDialog(selectedItems, onConfirm = {
            viewModel.delete(selectedItems); selected.clear(); confirm = false
        }, onDismiss = { confirm = false })
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileRow(item: FileItem, checked: Boolean, onCheck: () -> Unit, onOpen: () -> Unit) {
    DpCard(contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.sm), modifier = Modifier.combinedClickable(onClick = onOpen, onLongClick = onCheck)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(item.category.icon(), item.category.tint(), 38.dp)
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                Text(
                    "${Formatters.bytes(item.sizeBytes)} · ${item.location.ifBlank { "Internal storage" }}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Checkbox(checked = checked, onCheckedChange = { onCheck() })
        }
    }
}

// ------------------------------------------------------------------------------------ duplicates

@Composable
fun DuplicatesScreen(onBack: () -> Unit, viewModel: StorageViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(viewModel, snackbar)
    DeleteConsentHandler(viewModel)
    val selected = remember { mutableStateListOf<String>() }
    var confirm by remember { mutableStateOf(false) }
    val groups = ui.duplicates
    val allItems = groups.orEmpty().flatMap { it.files }
    val selectedItems = allItems.filter { it.uri.toString() in selected }

    DpScaffold(if (selected.isEmpty()) "Duplicate files" else "${selected.size} selected", onBack, snackbarHostState = snackbar, actions = {
        if (selected.isNotEmpty()) IconButton(onClick = { confirm = true }) { Icon(Icons.Default.Delete, contentDescription = "Delete selected", tint = LocalStatusColors.current.error) }
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
            MediaGate(viewModel) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = Spacing.sm, bottom = Spacing.xxl),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                ) {
                    item {
                        DpCard {
                            Text("Exact duplicates only", style = MaterialTheme.typography.titleSmall)
                            NoteText("Files are compared byte-for-byte (SHA-256), so only true copies are listed. Similar-looking photos are not treated as duplicates.")
                            Spacer(Modifier.height(Spacing.sm))
                            val progress = ui.duplicateProgress
                            if (progress != null) {
                                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                                NoteText("Comparing files… ${(progress * 100).toInt()}%", Modifier.padding(top = 4.dp))
                            } else {
                                Button(onClick = { selected.clear(); viewModel.findDuplicates() }, enabled = ui.media != null && !ui.scanning) {
                                    Text(if (groups == null) "Find duplicates" else "Scan again")
                                }
                            }
                        }
                    }
                    if (groups != null) {
                        item {
                            val recoverable = groups.sumOf { it.recoverableBytes }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("${groups.size} groups · ${Formatters.bytes(recoverable)} recoverable", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                                if (groups.isNotEmpty()) androidx.compose.material3.TextButton(onClick = {
                                    selected.clear()
                                    // Keep the oldest copy of each group; select the rest.
                                    groups.forEach { g -> g.files.drop(1).forEach { selected.add(it.uri.toString()) } }
                                }) { Text("Select extra copies") }
                            }
                        }
                        if (groups.isEmpty()) item { EmptyState("No duplicates found", "Great — there are no identical copies among your scanned files.") }
                        groups.forEach { g ->
                            item(key = g.hash) {
                                DpCard(contentPadding = PaddingValues(Spacing.md)) {
                                    Text("${g.files.size} copies · ${Formatters.bytes(g.sizeBytes)} each", style = MaterialTheme.typography.titleSmall)
                                    g.files.forEachIndexed { i, f ->
                                        val key = f.uri.toString()
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
                                                Text(f.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                                                Text("${f.location} · ${Formatters.date(f.modifiedMillis)}${if (i == 0) " · oldest" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                            }
                                            IconButton(onClick = { openFile(context, f) }) { Icon(Icons.Default.FolderOpen, contentDescription = "Open ${f.name}") }
                                            Checkbox(checked = key in selected, onCheckedChange = { if (key in selected) selected.remove(key) else selected.add(key) })
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (confirm) {
        val wholeGroupSelected = groups.orEmpty().any { g -> g.files.all { it.uri.toString() in selected } }
        ConfirmDeleteDialog(selectedItems, onConfirm = {
            viewModel.delete(selectedItems); selected.clear(); confirm = false
        }, onDismiss = { confirm = false })
        if (wholeGroupSelected) {
            LaunchedEffect(Unit) { snackbar.showSnackbar("Note: every copy of at least one file is selected") }
        }
    }
}

// ------------------------------------------------------------------------------------ junk cleaner

private data class JunkGroup(val title: String, val description: String, val icon: ImageVector, val items: List<FileItem>)

@Composable
fun JunkCleanerScreen(onBack: () -> Unit, navigate: (String) -> Unit, viewModel: StorageViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val picker = rememberFolderPicker(viewModel)
    MessageEffect(viewModel, snackbar)
    DeleteConsentHandler(viewModel)
    LaunchedEffect(Unit) { viewModel.refresh() }
    val selected = remember { mutableStateListOf<String>() }
    var confirm by remember { mutableStateOf(false) }

    val all = ui.allFiles
    val groups = listOf(
        JunkGroup("Old APK files", "Installer files. Once an app is installed its APK is usually no longer needed.", Icons.Default.Android, all.filter { it.category == FileCategory.APKS }),
        JunkGroup("Temporary & log files", "Files ending in .tmp, .log, .bak, .part and similar.", Icons.AutoMirrored.Filled.InsertDriveFile, all.filter { FileClassifier.isTemporary(it.name) }),
        JunkGroup("Empty folders", "Folders with nothing inside, in the folder you picked.", Icons.Default.CreateNewFolder, ui.folder?.emptyFolders.orEmpty()),
    )
    val selectedItems = groups.flatMap { it.items }.filter { it.uri.toString() in selected }

    DpScaffold("Smart Clean", onBack, snackbarHostState = snackbar) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Default.Storage, Brand.Teal)
                        Spacer(Modifier.width(Spacing.md))
                        Column(Modifier.weight(1f)) {
                            Text("Recoverable now", style = MaterialTheme.typography.titleSmall)
                            Text(Formatters.bytes(selectedItems.sumOf { it.sizeBytes }) + " selected", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    if (ui.scanning) {
                        Spacer(Modifier.height(Spacing.sm))
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                        NoteText(ui.progress ?: "Scanning…", Modifier.padding(top = 4.dp))
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        OutlinedButton(onClick = { picker.launch(null) }) { Text(if (ui.folder == null) "Pick a folder" else "Scan another folder") }
                        OutlinedButton(onClick = { viewModel.refresh(force = true) }) { Text("Rescan") }
                    }
                    ui.folder?.let { NoteText("Folder: ${it.rootName} · ${it.scannedFiles} files in ${it.scannedFolders} folders", Modifier.padding(top = 4.dp)) }
                }
            }
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Default.CleaningServices, Brand.Green)
                        Spacer(Modifier.width(Spacing.md))
                        Column(Modifier.weight(1f)) {
                            Text("Devicepilot cache", style = MaterialTheme.typography.titleSmall)
                            NoteText("${Formatters.bytes(ui.ownCacheBytes)} of temporary files created by this app (for example exported reports).")
                        }
                        OutlinedButton(onClick = viewModel::clearOwnCache, enabled = ui.ownCacheBytes > 0) { Text("Clear") }
                    }
                }
            }
            groups.forEach { g -> junkGroup(g, selected, context) }
            item {
                NavRow(Icons.Default.ContentCopy, "Duplicate photos & videos", "Find exact copies by content") { navigate(Routes.DUPLICATES) }
            }
            item {
                DpCard {
                    Text("Other apps' cache", style = MaterialTheme.typography.titleSmall)
                    NoteText("Android does not allow any app to clear other apps' caches. You can clear a specific app's cache from its App info page, or use your phone's built-in storage manager.")
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        OutlinedButton(onClick = { navigate(Routes.APPS) }) { Text("App Manager") }
                        OutlinedButton(onClick = { SystemIntents.manageStorage(context) }) { Text("System cleaner") }
                    }
                }
            }
            item {
                Button(
                    onClick = { confirm = true },
                    enabled = selectedItems.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (selectedItems.isEmpty()) "Select items to clean" else "Clean ${selectedItems.size} items · ${Formatters.bytes(selectedItems.sumOf { it.sizeBytes })}") }
            }
        }
    }
    if (confirm) {
        ConfirmDeleteDialog(selectedItems, onConfirm = {
            viewModel.delete(selectedItems); selected.clear(); confirm = false
        }, onDismiss = { confirm = false })
    }
}

private fun LazyListScope.junkGroup(g: JunkGroup, selected: MutableList<String>, context: Context) {
    item(key = g.title) {
        DpCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBadge(g.icon, MaterialTheme.colorScheme.secondary)
                Spacer(Modifier.width(Spacing.md))
                Column(Modifier.weight(1f)) {
                    Text(g.title, style = MaterialTheme.typography.titleSmall)
                    NoteText("${g.items.size} found · ${Formatters.bytes(g.items.sumOf { it.sizeBytes })}")
                }
                if (g.items.isNotEmpty()) {
                    val allSelected = g.items.all { it.uri.toString() in selected }
                    Checkbox(checked = allSelected, onCheckedChange = {
                        if (allSelected) g.items.forEach { selected.remove(it.uri.toString()) }
                        else g.items.forEach { i -> if (i.uri.toString() !in selected) selected.add(i.uri.toString()) }
                    })
                }
            }
            NoteText(g.description, Modifier.padding(top = 4.dp))
            g.items.take(50).forEach { f ->
                val key = f.uri.toString()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
                        Text(f.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                        Text("${Formatters.bytes(f.sizeBytes)} · ${f.location}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (f.mimeType != android.provider.DocumentsContract.Document.MIME_TYPE_DIR) {
                        IconButton(onClick = { openFile(context, f) }) { Icon(Icons.Default.FolderOpen, contentDescription = "Open ${f.name}") }
                    }
                    Checkbox(checked = key in selected, onCheckedChange = { if (key in selected) selected.remove(key) else selected.add(key) })
                }
            }
            if (g.items.size > 50) NoteText("+ ${g.items.size - 50} more (included when you select the whole group)")
        }
    }
}

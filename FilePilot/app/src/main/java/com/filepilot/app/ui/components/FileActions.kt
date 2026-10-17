package com.filepilot.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.DriveFileMove
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DriveFileRenameOutline
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.SelectAll
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarOutline
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filepilot.app.ClipboardState
import com.filepilot.app.actions.SystemIntents
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.PreviewKind
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.model.previewKind
import com.filepilot.app.core.util.FileNames
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.files.userMessage
import com.filepilot.app.data.OperationStatus
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import java.io.File
import kotlinx.coroutines.launch

/** Which file dialog or sheet is showing. One instance per screen. */
@Stable
class FileActionsState {
    var menuFor by mutableStateOf<FileItem?>(null)
    var renaming by mutableStateOf<FileItem?>(null)
    var deleting by mutableStateOf<List<FileItem>?>(null)
    var compressing by mutableStateOf<List<FileItem>?>(null)
}

@Composable
fun rememberFileActions(): FileActionsState = remember { FileActionsState() }

/** Where a ZIP for [items] should be written: the current folder, or the files' own folder. */
fun compressTarget(items: List<FileItem>, current: Location?): Location? {
    if (current != null) return current
    val parents = items.mapNotNull { if (it.source == SourceKind.LOCAL) it.path?.let { p -> File(p).parent } else null }.distinct()
    return if (parents.size == 1 && items.all { it.source == SourceKind.LOCAL }) Location.Local(parents.first()) else null
}

/**
 * Hosts the per-file action sheet and the rename / delete / compress dialogs.
 * [currentLocation] is the folder on screen, when there is one.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileActionsHost(
    state: FileActionsState,
    currentLocation: Location? = null,
    favoriteIds: Set<String> = emptySet(),
    onDone: () -> Unit = {},
    onRenamed: (FileItem) -> Unit = {},
    onDeleteStarted: () -> Unit = {},
) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    state.menuFor?.let { item ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val close: (() -> Unit) -> Unit = { action ->
            scope.launch { sheetState.hide() }.invokeOnCompletion {
                state.menuFor = null
                action()
            }
        }
        ModalBottomSheet(
            onDismissRequest = { state.menuFor = null },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ) {
            Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 8.dp)) {
                Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    FileThumb(item, size = 48.dp)
                    Column(Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(item.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(item.subtitle(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (item.source == SourceKind.MEDIA) {
                    Text(
                        "Read-only: available through media access",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
                if (item.isDirectory) {
                    SheetAction(Icons.Rounded.FolderOpen, "Open folder") { close { navigator.open(item) } }
                } else {
                    val inApp = item.previewKind() != PreviewKind.EXTERNAL
                    SheetAction(if (inApp) Icons.Rounded.Visibility else Icons.AutoMirrored.Rounded.OpenInNew, if (inApp) "Open" else "Open in another app") {
                        close { navigator.open(item) }
                    }
                    SheetAction(Icons.AutoMirrored.Rounded.OpenInNew, "Open with…") { close { navigator.openExternal(item, chooser = true) } }
                    SheetAction(Icons.Rounded.Share, "Share") {
                        close { SystemIntents.share(context, listOf(item))?.let { container.message(it) } }
                    }
                }
                val fav = item.id in favoriteIds
                SheetAction(if (fav) Icons.Rounded.Star else Icons.Rounded.StarOutline, if (fav) "Remove from favorites" else "Add to favorites") {
                    close {
                        scope.launch {
                            val added = container.store.toggleFavorite(item)
                            container.message(if (added) "Added to favorites" else "Removed from favorites")
                        }
                    }
                }
                SheetAction(Icons.Rounded.ContentCopy, "Copy") {
                    close {
                        container.setClipboard(ClipboardState(listOf(item), move = false))
                        container.message("Copied. Open a folder and tap Paste.")
                    }
                }
                if (item.source != SourceKind.MEDIA && item.canDelete) {
                    SheetAction(Icons.AutoMirrored.Rounded.DriveFileMove, "Move") {
                        close {
                            container.setClipboard(ClipboardState(listOf(item), move = true))
                            container.message("Ready to move. Open a folder and tap Move here.")
                        }
                    }
                }
                if (item.source != SourceKind.MEDIA && item.canRename) {
                    SheetAction(Icons.Rounded.DriveFileRenameOutline, "Rename") { close { state.renaming = item } }
                }
                if (item.source != SourceKind.MEDIA && compressTarget(listOf(item), currentLocation) != null) {
                    SheetAction(Icons.Rounded.FolderZip, "Compress to ZIP") { close { state.compressing = listOf(item) } }
                }
                if (item.previewKind() == PreviewKind.ARCHIVE) {
                    SheetAction(Icons.Rounded.Unarchive, "Browse & extract") { close { navigator.open(item) } }
                }
                SheetAction(Icons.Rounded.Info, "Details") { close { navigator.details(item) } }
                if (item.source != SourceKind.MEDIA && item.canDelete) {
                    SheetAction(Icons.Rounded.Delete, "Delete", tint = MaterialTheme.colorScheme.error) {
                        close { state.deleting = listOf(item) }
                    }
                }
            }
        }
    }

    state.renaming?.let { item ->
        NameDialog(
            title = if (item.isDirectory) "Rename folder" else "Rename file",
            initial = item.name,
            confirmLabel = "Rename",
            selectBaseName = !item.isDirectory,
            onDismiss = { state.renaming = null },
            onConfirm = { newName ->
                state.renaming = null
                scope.launch {
                    try {
                        val renamed = container.files.rename(item, newName)
                        container.store.replaceItem(item.id, renamed)
                        container.store.addHistory("Rename", "${item.name} → ${renamed.name}", OperationStatus.SUCCESS, 1, 0)
                        container.operations.notifyChanged()
                        container.message("Renamed to ${renamed.name}")
                        onRenamed(renamed)
                        onDone()
                    } catch (e: Exception) {
                        container.store.addHistory("Rename", e.userMessage(), OperationStatus.FAILED, 1, 0)
                        container.message(e.userMessage())
                    }
                }
            },
        )
    }

    state.deleting?.let { items ->
        DeleteDialog(
            items = items,
            onDismiss = { state.deleting = null },
            onConfirm = {
                state.deleting = null
                if (!container.operations.delete(items)) {
                    container.message("Another operation is still running")
                } else {
                    onDeleteStarted()
                }
                onDone()
            },
        )
    }

    state.compressing?.let { items ->
        val defaultName = if (items.size == 1) items.first().name.substringBeforeLast('.', items.first().name) else "Archive"
        NameDialog(
            title = "Compress to ZIP",
            initial = "$defaultName.zip",
            confirmLabel = "Compress",
            selectBaseName = true,
            onDismiss = { state.compressing = null },
            onConfirm = { name ->
                state.compressing = null
                val target = compressTarget(items, currentLocation)
                if (target == null) {
                    container.message("Open the folder that contains these files to compress them")
                } else if (!container.operations.compress(items, target, name)) {
                    container.message("Another operation is still running")
                }
                onDone()
            },
        )
    }
}

@Composable
fun SheetAction(icon: ImageVector, label: String, tint: Color = MaterialTheme.colorScheme.onSurface, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 22.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = if (tint == MaterialTheme.colorScheme.onSurface) MaterialTheme.colorScheme.onSurfaceVariant else tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(18.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = tint)
    }
}

/** Text input dialog with validation; selects the name without its extension for quick edits. */
@Composable
fun NameDialog(
    title: String,
    initial: String,
    confirmLabel: String,
    selectBaseName: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val end = if (selectBaseName) initial.lastIndexOf('.').takeIf { it > 0 } ?: initial.length else initial.length
    var value by remember { mutableStateOf(TextFieldValue(initial, TextRange(0, end))) }
    var touched by remember { mutableStateOf(false) }
    val error = FileNames.validate(value.text)
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = {
                    value = it
                    touched = true
                },
                label = { Text("Name") },
                singleLine = true,
                isError = touched && error != null,
                supportingText = { if (touched && error != null) Text(error) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (error == null) onConfirm(value.text.trim()) }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(value.text.trim()) }, enabled = error == null) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun DeleteDialog(items: List<FileItem>, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    val folders = items.count { it.isDirectory }
    val title = if (items.size == 1) "Delete “${items.first().name}”?" else "Delete ${items.size} items?"
    val detail = buildString {
        append("This permanently removes ")
        append(if (items.size == 1) "this ${if (folders == 1) "folder and everything inside it" else "file"}" else "the selected items")
        if (items.size > 1 && folders > 0) append(", including everything inside $folders folder${if (folders > 1) "s" else ""}")
        append(" from your device. It can't be undone.")
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Rounded.Delete, null, tint = MaterialTheme.colorScheme.error) },
        title = { Text(title, maxLines = 3, overflow = TextOverflow.Ellipsis) },
        text = { Text(detail) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Delete", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Contextual top bar shown while items are selected. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectionTopBar(count: Int, total: Int, onClose: () -> Unit, onSelectAll: () -> Unit, onClearAll: () -> Unit) {
    TopAppBar(
        title = { Text("$count selected", style = MaterialTheme.typography.titleLarge) },
        navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.Rounded.Close, "Cancel selection") } },
        actions = {
            if (count < total) {
                TextButton(onClick = onSelectAll) { Text("Select all") }
            } else {
                TextButton(onClick = onClearAll) { Text("Deselect all") }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    )
}

/** Bottom actions for the current multi-selection. */
@Composable
fun SelectionActionBar(
    visible: Boolean,
    selected: List<FileItem>,
    favoriteIds: Set<String>,
    actions: FileActionsState,
    currentLocation: Location?,
    onClear: () -> Unit,
    onSelectAll: () -> Unit,
) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val busy by container.operations.progress.collectAsState()
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically { it } + fadeIn(),
        exit = slideOutVertically { it } + fadeOut(),
    ) {
        val anyMedia = selected.any { it.source == SourceKind.MEDIA }
        val canModify = !anyMedia && selected.all { it.canDelete }
        BottomAppBar(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                BarAction(Icons.Rounded.ContentCopy, "Copy") {
                    container.setClipboard(ClipboardState(selected, move = false))
                    container.message("${Format.items(selected.size)} copied. Open a folder and tap Paste.")
                    onClear()
                }
                BarAction(Icons.AutoMirrored.Rounded.DriveFileMove, "Move", enabled = canModify) {
                    container.setClipboard(ClipboardState(selected, move = true))
                    container.message("Ready to move ${Format.items(selected.size)}. Open a folder and tap Move here.")
                    onClear()
                }
                BarAction(Icons.Rounded.Share, "Share") {
                    SystemIntents.share(context, selected)?.let { container.message(it) }
                }
                BarAction(Icons.Rounded.Delete, "Delete", enabled = canModify && busy == null) {
                    actions.deleting = selected
                }
                Box {
                    var open by remember { mutableStateOf(false) }
                    BarAction(Icons.Rounded.MoreVert, "More") { open = true }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        DropdownMenuItem(
                            text = { Text("Select all") },
                            leadingIcon = { Icon(Icons.Rounded.SelectAll, null) },
                            onClick = {
                                open = false
                                onSelectAll()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Add to favorites") },
                            leadingIcon = { Icon(Icons.Rounded.StarOutline, null) },
                            onClick = {
                                open = false
                                scope.launch {
                                    selected.filter { it.id !in favoriteIds }.forEach { container.store.toggleFavorite(it) }
                                    container.message("Added to favorites")
                                }
                                onClear()
                            },
                        )
                        if (!anyMedia && compressTarget(selected, currentLocation) != null) {
                            DropdownMenuItem(
                                text = { Text("Compress to ZIP") },
                                leadingIcon = { Icon(Icons.Rounded.FolderZip, null) },
                                onClick = {
                                    open = false
                                    actions.compressing = selected
                                },
                            )
                        }
                        if (selected.size == 1) {
                            DropdownMenuItem(
                                text = { Text("Details") },
                                leadingIcon = { Icon(Icons.Rounded.Info, null) },
                                onClick = {
                                    open = false
                                    val item = selected.first()
                                    onClear()
                                    navigator.details(item)
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BarAction(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Column(
        Modifier
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val c = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
        Icon(icon, contentDescription = label, tint = c, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(2.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = c)
    }
}

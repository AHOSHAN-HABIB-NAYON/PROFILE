@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.browser

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Compare
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DriveFileRenameOutline
import androidx.compose.material.icons.rounded.FolderOff
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.NoteAdd
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material.icons.rounded.SelectAll
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.ViewList
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemContentType
import androidx.paging.compose.itemKey
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.copyText
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.NameDialog
import com.webtecit.filepilot.core.operations.ClipMode
import com.webtecit.filepilot.core.preferences.ViewMode
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.feature.details.DetailsSheet
import kotlinx.coroutines.flow.first

private sealed interface BrowserDialog {
    data object NewFolder : BrowserDialog
    data object NewFile : BrowserDialog
    data object Sort : BrowserDialog
    data class Rename(val item: FileItem) : BrowserDialog
    data class Delete(val items: List<FileItem>) : BrowserDialog
    data class BatchRename(val items: List<FileItem>) : BrowserDialog
    data class Details(val id: String) : BrowserDialog
    data class Actions(val item: FileItem) : BrowserDialog
}

@Composable
fun BrowserScreen(
    locationId: String,
    startSearch: Boolean = false,
    onClose: () -> Unit,
    onCompare: (String, String) -> Unit,
    onEdit: (String) -> Unit = {},
    onRunSite: (String, String) -> Unit = { _, _ -> },
    onGrantAccess: () -> Unit,
    viewModel: BrowserViewModel = hiltViewModel(),
) {
    LaunchedEffect(locationId) {
        viewModel.start(locationId)
        if (startSearch) viewModel.openSearch()
    }
    val gate = com.webtecit.filepilot.core.permissions.rememberAccessGate()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val items = viewModel.items.collectAsLazyPagingItems()
    val listState = rememberLazyListState()
    val gridState = rememberLazyGridState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    var dialog by remember { mutableStateOf<BrowserDialog?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var createMenuOpen by remember { mutableStateOf(false) }
    val grid = state.prefs.viewMode == ViewMode.GRID

    EventHandler(viewModel.events, snackbar)

    fun firstVisible(): Int = if (grid) gridState.firstVisibleItemIndex else listState.firstVisibleItemIndex

    // Restore the remembered scroll position whenever another folder is shown.
    LaunchedEffect(state.currentId) {
        val id = state.currentId ?: return@LaunchedEffect
        val target = viewModel.savedScroll(id)
        snapshotFlow { !state.loading && items.itemCount == state.visibleCount }.first { it }
        val index = target.coerceAtMost((items.itemCount - 1).coerceAtLeast(0))
        if (grid) gridState.scrollToItem(index) else listState.scrollToItem(index)
    }

    BackHandler {
        when {
            state.selectionMode -> viewModel.clearSelection()
            state.searchActive -> viewModel.closeSearch()
            !viewModel.goUp(firstVisible()) -> onClose()
        }
    }

    fun onItemClick(item: FileItem) {
        when {
            state.selectionMode -> viewModel.toggleSelection(item)
            item.isDirectory -> viewModel.openFolder(item, firstVisible())
            opensInEditor(item) -> onEdit(item.id)
            else -> viewModel.openFile(item, chooser = false)
        }
    }

    fun onAction(item: FileItem, action: ItemAction) {
        dialog = null
        when (action) {
            ItemAction.OPEN -> onItemClick(item)
            ItemAction.EDIT -> onEdit(item.id)
            ItemAction.RUN -> if (item.isDirectory) onRunSite(item.id, "index.html")
                else java.io.File(item.id).parentFile?.let { onRunSite(it.absolutePath, item.name) }
            ItemAction.OPEN_WITH -> viewModel.openFile(item, chooser = true)
            ItemAction.SHARE -> viewModel.share(listOf(item))
            ItemAction.COPY -> viewModel.putOnClipboard(listOf(item), ClipMode.COPY)
            ItemAction.MOVE -> viewModel.putOnClipboard(listOf(item), ClipMode.CUT)
            ItemAction.RENAME -> dialog = BrowserDialog.Rename(item)
            ItemAction.FAVORITE, ItemAction.UNFAVORITE -> viewModel.toggleFavorite(listOf(item))
            ItemAction.COPY_PATH -> {
                copyText(context, "Path", viewModel.displayPath(item.id))
                Toast.makeText(context, "Path copied", Toast.LENGTH_SHORT).show()
            }
            ItemAction.DETAILS -> dialog = BrowserDialog.Details(item.id)
            ItemAction.DELETE -> dialog = BrowserDialog.Delete(listOf(item))
        }
    }

    Scaffold(
        topBar = {
            when {
                state.selectionMode -> SelectionTopBar(
                    count = state.selection.size,
                    onClose = viewModel::clearSelection,
                    onSelectAll = viewModel::selectAll,
                    menu = { dismiss ->
                        val selected = viewModel.selectedItems()
                        if (selected.size == 1) {
                            DropdownMenuItem(
                                text = { Text("Rename") },
                                leadingIcon = { Icon(Icons.Rounded.DriveFileRenameOutline, null) },
                                onClick = { dismiss(); dialog = BrowserDialog.Rename(selected[0]) },
                            )
                            DropdownMenuItem(
                                text = { Text("Details") },
                                leadingIcon = { Icon(Icons.Rounded.Info, null) },
                                onClick = { dismiss(); dialog = BrowserDialog.Details(selected[0].id) },
                            )
                        }
                        if (selected.size > 1) {
                            DropdownMenuItem(
                                text = { Text("Batch rename") },
                                leadingIcon = { Icon(Icons.Rounded.DriveFileRenameOutline, null) },
                                onClick = { dismiss(); dialog = BrowserDialog.BatchRename(selected) },
                            )
                        }
                        if (selected.size == 2 && selected.none { it.isDirectory }) {
                            DropdownMenuItem(
                                text = { Text("Compare files") },
                                leadingIcon = { Icon(Icons.Rounded.Compare, null) },
                                onClick = {
                                    dismiss()
                                    viewModel.clearSelection()
                                    onCompare(selected[0].id, selected[1].id)
                                },
                            )
                        }
                        val allFav = selected.isNotEmpty() && selected.all { it.id in state.favoriteIds }
                        DropdownMenuItem(
                            text = { Text(if (allFav) "Remove from favorites" else "Add to favorites") },
                            leadingIcon = { Icon(Icons.Rounded.Star, null) },
                            onClick = { dismiss(); viewModel.toggleFavorite(selected) },
                        )
                    },
                )
                state.searchActive -> SearchTopBar(
                    query = state.query,
                    onQuery = viewModel::setQuery,
                    onClose = viewModel::closeSearch,
                )
                else -> TopAppBar(
                    title = {
                        Column {
                            Text(state.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (!state.loading && state.error == null) {
                                Text(
                                    "${Formatters.count(state.folderCount, "folder")} · ${Formatters.count(state.fileCount, "file")}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Close folder") }
                    },
                    actions = {
                        IconButton(onClick = viewModel::openSearch) { Icon(Icons.Rounded.Search, contentDescription = "Search") }
                        IconButton(onClick = { viewModel.setViewMode(if (grid) ViewMode.LIST else ViewMode.GRID) }) {
                            Icon(
                                if (grid) Icons.Rounded.ViewList else Icons.Rounded.GridView,
                                contentDescription = if (grid) "Show as list" else "Show as grid",
                            )
                        }
                        Box {
                            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Rounded.MoreVert, contentDescription = "More options") }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                DropdownMenuItem(
                                    text = { Text("Sort") },
                                    leadingIcon = { Icon(Icons.AutoMirrored.Rounded.Sort, null) },
                                    onClick = { menuOpen = false; dialog = BrowserDialog.Sort },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (state.prefs.showHidden) "Hide hidden files" else "Show hidden files") },
                                    leadingIcon = {
                                        Icon(if (state.prefs.showHidden) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, null)
                                    },
                                    onClick = { menuOpen = false; viewModel.setShowHidden(!state.prefs.showHidden) },
                                )
                                DropdownMenuItem(
                                    text = { Text("Select all") },
                                    leadingIcon = { Icon(Icons.Rounded.SelectAll, null) },
                                    enabled = state.visibleCount > 0,
                                    onClick = { menuOpen = false; viewModel.selectAll() },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (state.bookmarked) "Remove bookmark" else "Bookmark this folder") },
                                    leadingIcon = {
                                        Icon(if (state.bookmarked) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder, null)
                                    },
                                    onClick = { menuOpen = false; viewModel.toggleBookmark() },
                                )
                                DropdownMenuItem(
                                    text = { Text("Folder details") },
                                    leadingIcon = { Icon(Icons.Rounded.Info, null) },
                                    enabled = state.currentId != null,
                                    onClick = { menuOpen = false; state.currentId?.let { dialog = BrowserDialog.Details(it) } },
                                )
                                DropdownMenuItem(
                                    text = { Text("Refresh") },
                                    leadingIcon = { Icon(Icons.Rounded.Refresh, null) },
                                    onClick = { menuOpen = false; viewModel.refresh() },
                                )
                            }
                        }
                    },
                )
            }
        },
        bottomBar = {
            val clip = state.clip
            when {
                state.selectionMode -> SelectionBar(
                    count = state.selection.size,
                    onCopy = { viewModel.putOnClipboard(viewModel.selectedItems(), ClipMode.COPY) },
                    onCut = { viewModel.putOnClipboard(viewModel.selectedItems(), ClipMode.CUT) },
                    onShare = { viewModel.share(viewModel.selectedItems()) },
                    onDelete = { dialog = BrowserDialog.Delete(viewModel.selectedItems()) },
                )
                clip != null && state.error == null && !state.virtual -> PasteBar(clip, onPaste = viewModel::paste, onCancel = viewModel::clearClipboard)
            }
        },
        floatingActionButton = {
            if (!state.selectionMode && !state.searchActive && state.clip == null && state.error == null && !state.loading && !state.virtual) {
                Box {
                    FloatingActionButton(
                        onClick = { createMenuOpen = true },
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.testTag("create_fab"),
                    ) { Icon(Icons.Rounded.Add, contentDescription = "Create") }
                    DropdownMenu(expanded = createMenuOpen, onDismissRequest = { createMenuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("New folder") },
                            leadingIcon = { Icon(Icons.Rounded.CreateNewFolder, null) },
                            onClick = { createMenuOpen = false; dialog = BrowserDialog.NewFolder },
                        )
                        DropdownMenuItem(
                            text = { Text("New file") },
                            leadingIcon = { Icon(Icons.Rounded.NoteAdd, null) },
                            onClick = { createMenuOpen = false; dialog = BrowserDialog.NewFile },
                        )
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.searchActive) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    FilterChip(
                        selected = state.deepSearch,
                        onClick = { viewModel.setDeepSearch(!state.deepSearch) },
                        label = { Text("Include subfolders") },
                    )
                }
                if (state.deepSearchRunning) LinearProgressIndicator(Modifier.fillMaxWidth())
            } else {
                Breadcrumbs(state.crumbs, onCrumb = { viewModel.openCrumb(it, firstVisible()) })
            }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp))

            PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                val error = state.error
                when {
                    error != null -> EmptyState(
                        icon = if (error.needsAccess) Icons.Rounded.Lock else Icons.Rounded.FolderOff,
                        title = if (error.needsAccess) "Storage access needed" else "Can't open this folder",
                        message = error.message,
                        actionLabel = if (error.needsAccess) "Grant access" else "Try again",
                        onAction = if (error.needsAccess) ({ gate { viewModel.refresh() } }) else viewModel::refresh,
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                    )
                    !state.loading && state.visibleCount == 0 -> EmptyState(
                        icon = if (state.searchActive) Icons.Rounded.SearchOff else Icons.Rounded.CreateNewFolder,
                        title = when {
                            state.searchActive -> "No matches"
                            state.virtual -> "Nothing here yet"
                            else -> "This folder is empty"
                        },
                        message = when {
                            state.searchActive && state.query.isBlank() -> "Type a name to search this folder."
                            state.searchActive && !state.deepSearch -> "Nothing here matches \"${state.query}\". Include subfolders to search deeper."
                            state.searchActive -> "Nothing in this folder or its subfolders matches \"${state.query}\"."
                            state.virtual -> "No files of this type were found on your storage."
                            else -> "Create a folder or paste files here."
                        },
                        actionLabel = if (state.searchActive || state.virtual) null else "New folder",
                        onAction = if (state.searchActive || state.virtual) null else ({ dialog = BrowserDialog.NewFolder }),
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                    )
                    grid -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(108.dp),
                        state = gridState,
                        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 96.dp),
                        modifier = Modifier.fillMaxSize().testTag("file_grid"),
                    ) {
                        items(
                            count = items.itemCount,
                            key = items.itemKey { it.id },
                            contentType = items.itemContentType { "file" },
                        ) { index ->
                            val item = items[index]
                            if (item == null) {
                                Box(Modifier.height(150.dp))
                            } else {
                                FileGridCell(
                                    item = item,
                                    selected = item.id in state.selection,
                                    showExtension = state.prefs.showExtensions,
                                    onClick = { onItemClick(item) },
                                    onLongClick = { viewModel.toggleSelection(item) },
                                )
                            }
                        }
                    }
                    else -> LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(bottom = 96.dp),
                        modifier = Modifier.fillMaxSize().testTag("file_list"),
                    ) {
                        items(
                            count = items.itemCount,
                            key = items.itemKey { it.id },
                            contentType = items.itemContentType { "file" },
                        ) { index ->
                            val item = items[index]
                            if (item == null) {
                                PlaceholderRow()
                            } else {
                                FileRow(
                                    item = item,
                                    selected = item.id in state.selection,
                                    selectionMode = state.selectionMode,
                                    showExtension = state.prefs.showExtensions,
                                    favorite = item.id in state.favoriteIds,
                                    onClick = { onItemClick(item) },
                                    onLongClick = { viewModel.toggleSelection(item) },
                                    onMore = { dialog = BrowserDialog.Actions(item) },
                                    subtitleOverride = if (state.showingDeepResults || state.virtual) {
                                        "${item.subtitle()} · ${viewModel.parentPathOf(item)}"
                                    } else null,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    state.pendingPaste?.let { pending -> ConflictDialog(pending, onResolve = viewModel::resolvePaste) }

    when (val d = dialog) {
        null -> Unit
        BrowserDialog.NewFolder -> NameDialog(
            title = "New folder",
            initial = "",
            confirmLabel = "Create",
            validate = { viewModel.validateName(it) },
            onConfirm = { dialog = null; viewModel.createFolder(it) },
            onDismiss = { dialog = null },
        )
        BrowserDialog.NewFile -> NameDialog(
            title = "New file",
            initial = "",
            confirmLabel = "Create",
            label = "File name, e.g. notes.txt",
            validate = { viewModel.validateName(it) },
            onConfirm = { dialog = null; viewModel.createFile(it) },
            onDismiss = { dialog = null },
        )
        BrowserDialog.Sort -> SortDialog(
            current = state.prefs.sortOrder,
            onApply = { dialog = null; viewModel.setSortOrder(it) },
            onDismiss = { dialog = null },
        )
        is BrowserDialog.Rename -> NameDialog(
            title = "Rename",
            initial = d.item.name,
            confirmLabel = "Rename",
            validate = { viewModel.validateName(it, currentName = d.item.name) },
            onConfirm = { dialog = null; if (it != d.item.name) viewModel.rename(d.item, it) },
            onDismiss = { dialog = null },
        )
        is BrowserDialog.Delete -> if (viewModel.usesRecycleBin(d.items)) {
            val names = d.items
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text(if (names.size == 1) "Delete \"${names[0].name}\"?" else "Delete ${names.size} items?") },
                text = { Text("Items go to the Recycle Bin and can be restored for 30 days.") },
                confirmButton = {
                    androidx.compose.material3.TextButton(onClick = { dialog = null; viewModel.delete(d.items) }) { Text("Move to Recycle Bin") }
                },
                dismissButton = {
                    Row {
                        androidx.compose.material3.TextButton(onClick = { dialog = null; viewModel.delete(d.items, permanently = true) }) {
                            Text("Delete permanently", color = MaterialTheme.colorScheme.error)
                        }
                        androidx.compose.material3.TextButton(onClick = { dialog = null }) { Text("Cancel") }
                    }
                },
            )
        } else {
            val names = d.items
            val title = if (names.size == 1) "Delete \"${names[0].name}\"?" else "Delete ${names.size} items?"
            val folders = names.count { it.isDirectory }
            ConfirmDialog(
                title = title,
                message = buildString {
                    append(if (names.size == 1) "This item will be deleted permanently." else "These items will be deleted permanently.")
                    if (folders > 0) append(" Everything inside the selected folders is deleted too.")
                    append(" This can't be undone.")
                },
                confirmLabel = "Delete permanently",
                destructive = true,
                onConfirm = { dialog = null; viewModel.delete(d.items) },
                onDismiss = { dialog = null },
            )
        }
        is BrowserDialog.BatchRename -> BatchRenameDialog(
            count = d.items.size,
            preview = { rule -> viewModel.batchRenamePreview(d.items, rule) },
            onApply = { rule -> dialog = null; viewModel.batchRename(d.items, rule) },
            onDismiss = { dialog = null },
        )
        is BrowserDialog.Details -> DetailsSheet(id = d.id, onDismiss = { dialog = null })
        is BrowserDialog.Actions -> ItemActionsSheet(
            item = d.item,
            favorite = d.item.id in state.favoriteIds,
            onAction = { action -> onAction(d.item, action) },
            onDismiss = { dialog = null },
        )
    }
}

@Composable
private fun SelectionTopBar(
    count: Int,
    onClose: () -> Unit,
    onSelectAll: () -> Unit,
    menu: @Composable (dismiss: () -> Unit) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    TopAppBar(
        title = { Text("$count selected") },
        navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.Rounded.Close, contentDescription = "Clear selection") } },
        actions = {
            IconButton(onClick = onSelectAll) { Icon(Icons.Rounded.SelectAll, contentDescription = "Select all") }
            Box {
                IconButton(onClick = { open = true }) { Icon(Icons.Rounded.MoreVert, contentDescription = "More actions") }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) { menu { open = false } }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    )
}

@Composable
private fun SearchTopBar(query: String, onQuery: (String) -> Unit, onClose: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    TopAppBar(
        title = {
            TextField(
                value = query,
                onValueChange = onQuery,
                placeholder = { Text("Search this folder") },
                singleLine = true,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                modifier = Modifier.fillMaxWidth().focusRequester(focus).testTag("search_field"),
            )
        },
        navigationIcon = {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Close search") }
        },
        actions = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQuery("") }) { Icon(Icons.Rounded.Close, contentDescription = "Clear search") }
            }
        },
    )
}

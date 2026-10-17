package com.filepilot.app.ui.browse

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.FolderOff
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.core.util.Format
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.ErrorState
import com.filepilot.app.ui.components.FileActionsHost
import com.filepilot.app.ui.components.FileListContent
import com.filepilot.app.ui.components.LoadingState
import com.filepilot.app.ui.components.NameDialog
import com.filepilot.app.ui.components.SelectionActionBar
import com.filepilot.app.ui.components.SelectionTopBar
import com.filepilot.app.ui.components.SortSheet
import com.filepilot.app.ui.components.rememberFileActions
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.appViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val vm = appViewModel { c, s -> BrowserViewModel(c, s) }
    val state by vm.state.collectAsStateWithLifecycle()
    val items by vm.items.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val clipboard by container.clipboard.collectAsStateWithLifecycle()
    val busy by container.operations.progress.collectAsStateWithLifecycle()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val favoriteIds = remember(favorites) { favorites.mapTo(HashSet()) { it.id } }
    val actions = rememberFileActions()
    val scope = rememberCoroutineScope()
    var showSort by remember { mutableStateOf(false) }
    var newFolder by remember { mutableStateOf(false) }
    var filtering by rememberSaveable { mutableStateOf(false) }
    val selection = vm.selection

    BackHandler(enabled = selection.active || filtering || state.canGoBack) {
        when {
            selection.active -> selection.clear()
            filtering -> {
                filtering = false
                vm.setFilter("")
            }
            else -> vm.goBack()
        }
    }

    val title = state.crumbs.lastOrNull()?.label ?: "Folder"
    Scaffold(
        topBar = {
            AnimatedContent(selection.active, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "topbar") { selecting ->
                if (selecting) {
                    SelectionTopBar(
                        count = selection.count,
                        total = items.size,
                        onClose = selection::clear,
                        onSelectAll = { selection.selectAll(items) },
                        onClearAll = selection::clear,
                    )
                } else if (filtering) {
                    FilterBar(filter, onChange = vm::setFilter, onClose = {
                        filtering = false
                        vm.setFilter("")
                    })
                } else {
                    BackTopBar(
                        title = title,
                        subtitle = if (!state.loading && state.error == null) Format.items(state.raw.size) else null,
                        onBack = { if (!vm.goBack()) navigator.back() },
                        actions = {
                            IconButton(onClick = vm::goForward, enabled = state.canGoForward) {
                                Icon(Icons.AutoMirrored.Rounded.ArrowForward, "Forward")
                            }
                            IconButton(onClick = { filtering = true }) { Icon(Icons.Rounded.FilterList, "Filter this folder") }
                            IconButton(onClick = { showSort = true }) { Icon(Icons.AutoMirrored.Rounded.Sort, "Sort and view") }
                        },
                    )
                }
            }
        },
        bottomBar = {
            val selected = selection.selectedFrom(items)
            if (selection.active) {
                SelectionActionBar(
                    visible = true,
                    selected = selected,
                    favoriteIds = favoriteIds,
                    actions = actions,
                    currentLocation = state.location,
                    onClear = selection::clear,
                    onSelectAll = { selection.selectAll(items) },
                )
            } else {
                AnimatedVisibility(
                    visible = clipboard != null,
                    enter = slideInVertically { it } + fadeIn(),
                    exit = slideOutVertically { it } + fadeOut(),
                ) {
                    val clip = clipboard
                    if (clip != null) {
                        PasteBar(
                            text = "${if (clip.move) "Move" else "Copy"} ${Format.items(clip.items.size)} here",
                            enabled = state.canWrite && busy == null && state.error == null,
                            disabledReason = if (!state.canWrite) "This folder is read-only" else null,
                            onPaste = vm::paste,
                            onCancel = { container.setClipboard(null) },
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (!selection.active && clipboard == null && state.canWrite && state.error == null) {
                ExtendedFloatingActionButton(
                    onClick = { newFolder = true },
                    icon = { Icon(Icons.Rounded.CreateNewFolder, null) },
                    text = { Text("New folder") },
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Breadcrumbs(state.crumbs, onClick = vm::openCrumb)
            PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                when {
                    state.loading -> LoadingState()
                    state.error != null -> ErrorState(
                        message = state.error!!,
                        onRetry = vm::refresh,
                        extraLabel = "Storage access",
                        onExtra = { navigator.go(com.filepilot.app.ui.navigation.Routes.PERMISSIONS) },
                    )
                    items.isEmpty() && filter.isNotBlank() -> EmptyState(
                        Icons.Rounded.SearchOff, "No matches", "Nothing in this folder matches “$filter”.",
                    )
                    items.isEmpty() -> EmptyState(
                        Icons.Rounded.FolderOff,
                        "This folder is empty",
                        if (state.canWrite) "Create a folder or paste files here." else "There's nothing to show here.",
                    )
                    else -> {
                        val key = state.location?.encode() ?: ""
                        val (index, offset) = remember(key) { vm.scrollFor(key) }
                        val listState = remember(key) { LazyListState(index, offset) }
                        val gridState = remember(key) { LazyGridState(index, offset) }
                        DisposableEffect(key, settings.viewMode) {
                            onDispose {
                                val grid = settings.viewMode == com.filepilot.app.core.model.ViewMode.GRID
                                vm.saveScroll(
                                    key,
                                    if (grid) gridState.firstVisibleItemIndex else listState.firstVisibleItemIndex,
                                    if (grid) gridState.firstVisibleItemScrollOffset else listState.firstVisibleItemScrollOffset,
                                )
                            }
                        }
                        FileListContent(
                            items = items,
                            viewMode = settings.viewMode,
                            selection = selection,
                            showExtensions = settings.showExtensions,
                            favoriteIds = favoriteIds,
                            onOpen = { item ->
                                val loc = item.asLocation()
                                if (loc != null) vm.open(loc, item.name) else navigator.open(item, items)
                            },
                            onMore = { actions.menuFor = it },
                            listState = listState,
                            gridState = gridState,
                        )
                    }
                }
            }
        }
    }

    FileActionsHost(actions, currentLocation = state.location, favoriteIds = favoriteIds, onDone = selection::clear)

    if (showSort) {
        SortSheet(
            sort = settings.sort,
            viewMode = settings.viewMode,
            showHidden = settings.showHidden,
            onSort = { scope.launch { container.store.setSort(it) } },
            onViewMode = { scope.launch { container.store.setViewMode(it) } },
            onShowHidden = { scope.launch { container.store.setShowHidden(it) } },
            onDismiss = { showSort = false },
        )
    }
    if (newFolder) {
        NameDialog(
            title = "New folder",
            initial = "New folder",
            confirmLabel = "Create",
            selectBaseName = false,
            onDismiss = { newFolder = false },
            onConfirm = {
                newFolder = false
                vm.createFolder(it)
            },
        )
    }
}

@Composable
private fun Breadcrumbs(crumbs: List<Crumb>, onClick: (Crumb) -> Unit) {
    if (crumbs.isEmpty()) return
    val listState = rememberLazyListState()
    LaunchedEffect(crumbs.size) { listState.animateScrollToItem((crumbs.size - 1).coerceAtLeast(0)) }
    LazyRow(
        state = listState,
        contentPadding = PaddingValues(horizontal = 12.dp),
        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        itemsIndexed(crumbs, key = { i, c -> "$i:${c.label}" }) { i, crumb ->
            val last = i == crumbs.lastIndex
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    crumb.label,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (last) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .clip(MaterialTheme.shapes.small)
                        .clickable(enabled = !last) { onClick(crumb) }
                        .padding(horizontal = 6.dp, vertical = 6.dp),
                )
                if (!last) {
                    Icon(
                        Icons.AutoMirrored.Rounded.KeyboardArrowRight, null,
                        tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterBar(value: String, onChange: (String) -> Unit, onClose: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Surface(color = MaterialTheme.colorScheme.surface) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Close filter") }
            TextField(
                value = value,
                onValueChange = onChange,
                placeholder = { Text("Filter this folder") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                colors = TextFieldDefaults.colors(
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                ),
                shape = MaterialTheme.shapes.extraLarge,
                trailingIcon = {
                    if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Rounded.Close, "Clear") }
                },
                modifier = Modifier.weight(1f).padding(end = 12.dp).focusRequester(focus),
            )
        }
    }
}

@Composable
private fun PasteBar(text: String, enabled: Boolean, disabledReason: String?, onPaste: () -> Unit, onCancel: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 2.dp) {
        Row(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(36.dp).clip(MaterialTheme.shapes.small).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.ContentPaste, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp)) }
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(text, style = MaterialTheme.typography.bodyLarge)
                if (!enabled && disabledReason != null) {
                    Text(disabledReason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            TextButton(onClick = onCancel) { Text("Cancel") }
            Button(onClick = onPaste, enabled = enabled) { Text("Paste") }
        }
    }
}

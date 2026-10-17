package com.filepilot.app.ui.category

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.filepilot.app.AppContainer
import com.filepilot.app.core.model.FileCategory
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SortField
import com.filepilot.app.core.model.SortOrder
import com.filepilot.app.core.model.sortedWith
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.AppSettings
import com.filepilot.app.data.files.CategoryResult
import com.filepilot.app.permissions.rememberAccessRequester
import com.filepilot.app.ui.components.AccessNotice
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.FileActionsHost
import com.filepilot.app.ui.components.FileListContent
import com.filepilot.app.ui.components.LoadingState
import com.filepilot.app.ui.components.SelectionActionBar
import com.filepilot.app.ui.components.SelectionTopBar
import com.filepilot.app.ui.components.SortSheet
import com.filepilot.app.ui.components.rememberFileActions
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Selection
import com.filepilot.app.ui.navigation.appViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Size thresholds offered on the Large files screen. */
val largeThresholds = listOf(50L shl 20, 100L shl 20, 500L shl 20, 1L shl 30)

class CategoryViewModel(private val container: AppContainer, saved: SavedStateHandle) : ViewModel() {
    val category: FileCategory = runCatching { FileCategory.valueOf(saved.get<String>("cat") ?: "") }.getOrDefault(FileCategory.IMAGES)

    private val _result = MutableStateFlow<CategoryResult?>(null)
    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()
    private val _threshold = MutableStateFlow(100L shl 20)
    val threshold: StateFlow<Long> = _threshold.asStateFlow()
    val result: StateFlow<CategoryResult?> = _result.asStateFlow()
    val selection = Selection()
    private var job: Job? = null

    val settings: StateFlow<AppSettings> = container.store.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings(onboardingDone = true))

    /** Categories have their own natural order: largest first for Large files, newest first otherwise. */
    private val _sort = MutableStateFlow(
        if (category == FileCategory.LARGE) SortOrder(SortField.SIZE, false) else SortOrder(SortField.DATE, false),
    )
    val sort: StateFlow<SortOrder> = _sort.asStateFlow()

    val items: StateFlow<List<FileItem>> = combine(_result, _sort, settings) { r, s, st ->
        (r?.items ?: emptyList()).filter { st.showHidden || !it.isHidden }.sortedWith(s, foldersFirst = false)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        load()
        viewModelScope.launch { container.operations.version.drop(1).collect { load(quiet = true) } }
        viewModelScope.launch { container.access.drop(1).collect { load(quiet = true) } }
    }

    fun setSort(order: SortOrder) {
        _sort.value = order
    }

    fun setThreshold(bytes: Long) {
        _threshold.value = bytes
        load()
    }

    fun load(pull: Boolean = false, quiet: Boolean = false) {
        job?.cancel()
        if (pull) _refreshing.value = true else if (!quiet) _loading.value = true
        job = viewModelScope.launch {
            val r = runCatching {
                container.files.media.category(category, container.access.value, _threshold.value)
            }.getOrElse { CategoryResult(emptyList(), false, false) }
            selection.retain(r.items)
            _result.value = r
            _loading.value = false
            _refreshing.value = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val vm = appViewModel { c, s -> CategoryViewModel(c, s) }
    val items by vm.items.collectAsStateWithLifecycle()
    val result by vm.result.collectAsStateWithLifecycle()
    val loading by vm.loading.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val sort by vm.sort.collectAsStateWithLifecycle()
    val threshold by vm.threshold.collectAsStateWithLifecycle()
    val access by container.access.collectAsStateWithLifecycle()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val favoriteIds = remember(favorites) { favorites.mapTo(HashSet()) { it.id } }
    val actions = rememberFileActions()
    val scope = rememberCoroutineScope()
    val requester = rememberAccessRequester()
    var showSort by remember { mutableStateOf(false) }
    val selection = vm.selection
    val cat = vm.category

    BackHandler(enabled = selection.active) { selection.clear() }

    val mediaMissing = when (cat) {
        FileCategory.IMAGES -> !access.images
        FileCategory.VIDEOS -> !access.video
        FileCategory.AUDIO -> !access.audio
        else -> false
    }
    val totalSize = remember(items) { items.sumOf { it.size.coerceAtLeast(0) } }

    Scaffold(
        topBar = {
            AnimatedContent(selection.active, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "bar") { sel ->
                if (sel) {
                    SelectionTopBar(selection.count, items.size, selection::clear, { selection.selectAll(items) }, selection::clear)
                } else {
                    BackTopBar(
                        title = cat.title,
                        subtitle = if (!loading && items.isNotEmpty()) "${Format.items(items.size)} · ${Format.size(totalSize)}" else null,
                        onBack = navigator::back,
                        actions = {
                            IconButton(onClick = { showSort = true }) { Icon(Icons.AutoMirrored.Rounded.Sort, "Sort and view") }
                        },
                    )
                }
            }
        },
        bottomBar = {
            if (selection.active) {
                SelectionActionBar(
                    visible = true,
                    selected = selection.selectedFrom(items),
                    favoriteIds = favoriteIds,
                    actions = actions,
                    currentLocation = null,
                    onClear = selection::clear,
                    onSelectAll = { selection.selectAll(items) },
                )
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (cat == FileCategory.LARGE) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(largeThresholds) { t ->
                        FilterChip(selected = t == threshold, onClick = { vm.setThreshold(t) }, label = { Text("Over ${Format.size(t)}") })
                    }
                }
            }
            val r = result
            if (r != null && r.limitedToMedia && !loading) {
                Text(
                    "Showing photos, videos and audio only. Allow full access to include every file type.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                )
            }
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = { vm.load(pull = true) }, modifier = Modifier.fillMaxSize()) {
                when {
                    loading -> LoadingState()
                    mediaMissing -> Column {
                        AccessNotice(
                            title = "Allow access to ${cat.title.lowercase()}",
                            message = "FilePilot needs read access to your media library to list ${cat.title.lowercase()}. Nothing is uploaded.",
                            actionLabel = "Allow access",
                            onAction = requester::requestMediaAccess,
                        )
                    }
                    r != null && r.needsFullAccess -> EmptyState(
                        icon = Icons.Rounded.Inbox,
                        title = "Needs full file access",
                        message = "Android only shares ${cat.title.lowercase()} with file managers that have full file access. You can also add a folder to browse it directly.",
                        actionLabel = "Allow full access",
                        onAction = requester::requestFullAccess,
                        secondaryLabel = "Pick a folder",
                        onSecondary = { requester.pickFolder() },
                    )
                    items.isEmpty() -> EmptyState(
                        icon = Icons.Rounded.Inbox,
                        title = "No ${cat.title.lowercase()} found",
                        message = when (cat) {
                            FileCategory.LARGE -> "No files are larger than ${Format.size(threshold)}."
                            FileCategory.RECENT -> "No files were added or changed in the last 30 days."
                            else -> "Files appear here once Android has indexed them."
                        },
                    )
                    else -> FileListContent(
                        items = items,
                        viewMode = settings.viewMode,
                        selection = selection,
                        showExtensions = settings.showExtensions,
                        favoriteIds = favoriteIds,
                        onOpen = { navigator.open(it, items) },
                        onMore = { actions.menuFor = it },
                        supporting = if (cat == FileCategory.LARGE || cat == FileCategory.RECENT || cat == FileCategory.DOWNLOADS) {
                            { item -> "${Format.size(item.size)} · ${Format.date(item.lastModified)} · ${item.path?.substringBeforeLast('/')?.substringAfterLast('/') ?: "Media library"}" }
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }

    FileActionsHost(actions, currentLocation = null, favoriteIds = favoriteIds, onDone = selection::clear)

    if (showSort) {
        SortSheet(
            sort = sort,
            viewMode = settings.viewMode,
            showHidden = null,
            onSort = vm::setSort,
            onViewMode = { scope.launch { container.store.setViewMode(it) } },
            onShowHidden = null,
            onDismiss = { showSort = false },
        )
    }
}

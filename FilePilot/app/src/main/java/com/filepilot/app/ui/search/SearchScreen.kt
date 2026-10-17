package com.filepilot.app.ui.search

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.automirrored.rounded.ManageSearch
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.filepilot.app.AppContainer
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.ViewMode
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.AppSettings
import com.filepilot.app.data.files.SearchFilter
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.FileActionsHost
import com.filepilot.app.ui.components.FileListContent
import com.filepilot.app.ui.components.SectionHeader
import com.filepilot.app.ui.components.SelectionActionBar
import com.filepilot.app.ui.components.rememberFileActions
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Selection
import com.filepilot.app.ui.navigation.appViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SearchUi(
    val results: List<FileItem> = emptyList(),
    val searching: Boolean = false,
    val searched: Boolean = false,
    val note: String? = null,
)

class SearchViewModel(private val container: AppContainer, saved: SavedStateHandle) : ViewModel() {
    private val _query = MutableStateFlow(saved.get<String>("q") ?: "")
    val query: StateFlow<String> = _query.asStateFlow()
    private val _filter = MutableStateFlow(SearchFilter.ALL)
    val filter: StateFlow<SearchFilter> = _filter.asStateFlow()
    private val _ui = MutableStateFlow(SearchUi())
    val ui: StateFlow<SearchUi> = _ui.asStateFlow()
    val selection = Selection()
    private var job: Job? = null

    val history: StateFlow<List<String>> = container.store.searchHistory.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val settings: StateFlow<AppSettings> = container.store.settings.stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings(onboardingDone = true))

    init {
        if (_query.value.isNotBlank()) search(debounce = false, remember = true)
    }

    fun setQuery(q: String) {
        _query.value = q
        search(debounce = true)
    }

    fun setFilter(f: SearchFilter) {
        _filter.value = f
        search(debounce = false)
    }

    fun submit() = search(debounce = false, remember = true)

    fun rememberQuery() {
        viewModelScope.launch { container.store.addSearch(_query.value) }
    }

    private fun search(debounce: Boolean, remember: Boolean = false) {
        job?.cancel()
        val q = _query.value.trim()
        selection.clear()
        if (q.isEmpty()) {
            _ui.value = SearchUi()
            return
        }
        job = viewModelScope.launch {
            if (debounce) delay(300)
            _ui.value = _ui.value.copy(searching = true)
            if (remember) container.store.addSearch(q)
            val access = container.access.value
            val indexed = container.files.media.search(q, _filter.value, access)
            val picked = searchPickedFolders(q, _filter.value)
            val merged = (indexed.items + picked).distinctBy { it.id }
            val note = when {
                indexed.needsFullAccess && picked.isEmpty() -> "Allow storage access to search your device."
                indexed.limitedToMedia -> "Searching photos, videos, audio and picked folders. Allow full access to search everything."
                else -> null
            }
            _ui.value = SearchUi(merged, searching = false, searched = true, note = note)
        }
    }

    /** Walks picked folders (bounded), since they are not part of the system index. */
    private suspend fun searchPickedFolders(q: String, filter: SearchFilter): List<FileItem> {
        val folders = container.store.pickedFolders.first()
        if (folders.isEmpty()) return emptyList()
        val out = mutableListOf<FileItem>()
        var visited = 0
        for (folder in folders) {
            val queue = ArrayDeque<Location>()
            queue.add(container.files.saf.rootLocation(folder.treeUri, folder.name))
            while (queue.isNotEmpty() && visited < MAX_NODES && out.size < 300) {
                val loc = queue.removeFirst()
                val children = runCatching { container.files.list(loc, showHidden = false) }.getOrDefault(emptyList())
                for (child in children) {
                    visited++
                    if (child.name.contains(q, ignoreCase = true) && filter.matches(child) && (filter == SearchFilter.ALL || !child.isDirectory)) out += child
                    child.asLocation()?.let { queue.add(it) }
                }
            }
        }
        return out
    }

    fun clearHistory() {
        viewModelScope.launch { container.store.clearSearchHistory() }
    }

    private companion object {
        const val MAX_NODES = 5000
    }
}

@Composable
fun SearchScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val vm = appViewModel { c, s -> SearchViewModel(c, s) }
    val query by vm.query.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val ui by vm.ui.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val favoriteIds = remember(favorites) { favorites.mapTo(HashSet()) { it.id } }
    val actions = rememberFileActions()
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = remember { FocusRequester() }
    val selection = vm.selection
    LaunchedEffect(Unit) { if (query.isEmpty()) focus.requestFocus() }
    BackHandler(enabled = selection.active) { selection.clear() }

    Scaffold(
        topBar = {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Column(Modifier.statusBarsPadding()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = navigator::back) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
                        TextField(
                            value = query,
                            onValueChange = vm::setQuery,
                            placeholder = { Text("Name or extension, e.g. invoice or .pdf") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(onSearch = {
                                keyboard?.hide()
                                vm.submit()
                            }),
                            trailingIcon = {
                                if (query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Rounded.Close, "Clear search") }
                            },
                            shape = MaterialTheme.shapes.extraLarge,
                            colors = TextFieldDefaults.colors(
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent,
                                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                            ),
                            modifier = Modifier.weight(1f).padding(end = 12.dp).focusRequester(focus),
                        )
                    }
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(SearchFilter.entries) { f ->
                            FilterChip(selected = f == filter, onClick = { vm.setFilter(f) }, label = { Text(f.label) })
                        }
                    }
                    if (ui.searching) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
        },
        bottomBar = {
            if (selection.active) {
                SelectionActionBar(true, selection.selectedFrom(ui.results), favoriteIds, actions, null, selection::clear) {
                    selection.selectAll(ui.results)
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when {
                query.isBlank() -> {
                    if (history.isEmpty()) {
                        EmptyState(
                            Icons.AutoMirrored.Rounded.ManageSearch,
                            "Search your files",
                            "Find files by name or extension. Use the chips to narrow results to a category.",
                        )
                    } else {
                        LazyColumn {
                            item {
                                SectionHeader("Recent searches") {
                                    TextButton(onClick = vm::clearHistory) { Text("Clear") }
                                }
                            }
                            items(history) { h ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { vm.setQuery(h); vm.submit() }.padding(horizontal = 20.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(Icons.Rounded.History, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                                    Text(h, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 16.dp))
                                }
                            }
                        }
                    }
                }
                ui.searched && ui.results.isEmpty() && !ui.searching -> EmptyState(
                    Icons.Rounded.SearchOff,
                    "No results for “$query”",
                    ui.note ?: "Try a shorter name, another category, or check the spelling.",
                )
                else -> {
                    ui.note?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
                    }
                    if (ui.searched) {
                        Text(
                            Format.items(ui.results.size),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                        )
                    }
                    FileListContent(
                        items = ui.results,
                        viewMode = ViewMode.LIST,
                        selection = selection,
                        showExtensions = settings.showExtensions,
                        favoriteIds = favoriteIds,
                        onOpen = {
                            vm.rememberQuery()
                            navigator.open(it, ui.results)
                        },
                        onMore = { actions.menuFor = it },
                        supporting = { item ->
                            val where = item.path?.substringBeforeLast('/')?.substringAfterLast('/') ?: if (item.treeUri != null) "Picked folder" else "Media library"
                            if (item.isDirectory) "Folder · $where" else "${Format.size(item.size)} · $where"
                        },
                    )
                }
            }
        }
    }
    FileActionsHost(actions, favoriteIds = favoriteIds, onDone = selection::clear)
}

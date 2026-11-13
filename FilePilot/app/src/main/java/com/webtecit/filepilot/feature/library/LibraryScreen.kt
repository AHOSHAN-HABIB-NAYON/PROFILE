@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.data.FileOpener
import com.webtecit.filepilot.data.LibraryEntry
import com.webtecit.filepilot.data.LibraryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val library: LibraryRepository,
    private val opener: FileOpener,
    private val fileSystems: FileSystems,
) : ViewModel() {
    val favorites = library.favorites.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val bookmarks = library.bookmarks.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val recents = library.recents.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun open(entry: LibraryEntry) {
        viewModelScope.launch { _events.send(opener.openId(entry.id)) }
    }

    fun location(entry: LibraryEntry): String = runCatching {
        val fs = fileSystems.of(entry.id)
        fs.parentId(entry.id)?.let { fs.displayPath(it) } ?: fs.displayPath(entry.id)
    }.getOrDefault("")

    fun remove(tab: Int, entry: LibraryEntry) {
        viewModelScope.launch {
            when (tab) {
                0 -> library.removeFavorite(entry.id)
                1 -> library.removeBookmark(entry.id)
                else -> library.removeRecent(entry.id)
            }
        }
    }

    fun clearRecents() {
        viewModelScope.launch { library.clearRecents() }
    }
}

@Composable
fun LibraryScreen(onOpenFolder: (String) -> Unit, viewModel: LibraryViewModel = hiltViewModel()) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var confirmClear by remember { mutableStateOf(false) }
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val bookmarks by viewModel.bookmarks.collectAsStateWithLifecycle()
    val recents by viewModel.recents.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    val tabs = listOf("Favorites", "Bookmarks", "Recent")
    val entries = when (tab) {
        0 -> favorites
        1 -> bookmarks
        else -> recents
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Library") },
                actions = {
                    if (tab == 2 && recents.isNotEmpty()) {
                        IconButton(onClick = { confirmClear = true }) {
                            Icon(Icons.Rounded.DeleteSweep, contentDescription = "Clear recent history")
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryTabRow(selectedTabIndex = tab) {
                tabs.forEachIndexed { i, label -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label) }) }
            }
            if (entries.isEmpty()) {
                when (tab) {
                    0 -> EmptyState(Icons.Rounded.StarBorder, "No favorites yet", "Open a file's menu and choose \"Add to favorites\" to find it here quickly.")
                    1 -> EmptyState(Icons.Rounded.Bookmark, "No bookmarks yet", "In any folder, open the menu and choose \"Bookmark this folder\".")
                    else -> EmptyState(Icons.Rounded.History, "No recent files", "Files you open in FilePilot appear here.")
                }
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
                    items(entries, key = { it.id }) { entry ->
                        val style = kindStyle(FileTypes.kindOf(entry.name, entry.isDirectory))
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.open(entry) }
                                .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            IconTile(style.icon, style.tint)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(entry.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    if (tab == 2) Formatters.date(entry.time) else viewModel.location(entry),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            IconButton(onClick = { viewModel.remove(tab, entry) }) {
                                Icon(Icons.Rounded.Close, contentDescription = "Remove ${entry.name} from ${tabs[tab]}")
                            }
                        }
                    }
                }
            }
        }
    }

    if (confirmClear) {
        ConfirmDialog(
            title = "Clear recent history?",
            message = "The list of recently opened files is cleared. The files themselves are not changed.",
            confirmLabel = "Clear history",
            onConfirm = { viewModel.clearRecents(); confirmClear = false },
            onDismiss = { confirmClear = false },
        )
    }
}

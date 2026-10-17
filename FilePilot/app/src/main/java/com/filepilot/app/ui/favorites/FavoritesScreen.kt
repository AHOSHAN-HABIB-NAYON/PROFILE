package com.filepilot.app.ui.favorites

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.core.model.SortOrder
import com.filepilot.app.core.model.sortedWith
import com.filepilot.app.data.AppSettings
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.FileActionsHost
import com.filepilot.app.ui.components.FileListContent
import com.filepilot.app.ui.components.SelectionTopBar
import com.filepilot.app.ui.components.SortSheet
import com.filepilot.app.ui.components.rememberFileActions
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Selection
import kotlinx.coroutines.launch

/** Favorites are stored on this device. Items that no longer exist are marked and can be removed. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val settings by container.store.settings.collectAsStateWithLifecycle(AppSettings(onboardingDone = true))
    val version by container.operations.version.collectAsStateWithLifecycle()
    var missing by remember { mutableStateOf<Set<String>>(emptySet()) }
    var sort by remember { mutableStateOf<SortOrder?>(null) }
    var showSort by remember { mutableStateOf(false) }
    val selection = remember { Selection() }
    val actions = rememberFileActions()

    LaunchedEffect(favorites, version) {
        missing = favorites.filterNot { container.files.exists(it) }.mapTo(HashSet()) { it.id }
    }
    BackHandler(enabled = selection.active) { selection.clear() }
    val items = remember(favorites, sort) { sort?.let { favorites.sortedWith(it) } ?: favorites }
    val ids = remember(favorites) { favorites.mapTo(HashSet()) { it.id } }

    Scaffold(
        topBar = {
            AnimatedContent(selection.active, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "bar") { sel ->
                if (sel) {
                    SelectionTopBar(selection.count, items.size, selection::clear, { selection.selectAll(items) }, selection::clear)
                } else {
                    TopAppBar(
                        title = { Text("Favorites", style = MaterialTheme.typography.titleLarge) },
                        actions = {
                            if (favorites.isNotEmpty()) {
                                IconButton(onClick = { showSort = true }) { Icon(Icons.AutoMirrored.Rounded.Sort, "Sort and view") }
                            }
                        },
                    )
                }
            }
        },
        bottomBar = {
            if (selection.active) {
                BottomAppBar {
                    Text("${selection.count} selected", modifier = Modifier.weight(1f).padding(start = 16.dp))
                    TextButton(onClick = selection::clear) { Text("Cancel") }
                    Button(onClick = {
                        val ids = selection.ids
                        scope.launch { container.store.removeFavorites(ids) }
                        selection.clear()
                        container.message("Removed from favorites")
                    }) { Text("Remove") }
                }
            }
        },
    ) { padding ->
        if (favorites.isEmpty()) {
            EmptyState(
                Icons.Rounded.StarOutline,
                "No favorites yet",
                "Tap ⋮ next to any file or folder and choose “Add to favorites” to keep it one tap away.",
                modifier = Modifier.padding(padding),
            )
        } else {
            FileListContent(
                items = items,
                viewMode = settings.viewMode,
                selection = selection,
                showExtensions = settings.showExtensions,
                favoriteIds = emptySet(),
                onOpen = { item ->
                    if (item.id in missing) {
                        container.message("This item was moved or deleted. Long-press to remove it.")
                    } else {
                        navigator.open(item, items)
                    }
                },
                onMore = { actions.menuFor = it },
                modifier = Modifier.padding(padding).fillMaxSize(),
                supporting = { item -> if (item.id in missing) "Not found — moved or deleted" else null },
            )
        }
    }
    FileActionsHost(actions, favoriteIds = ids)
    if (showSort) {
        SortSheet(
            sort = sort ?: settings.sort,
            viewMode = settings.viewMode,
            showHidden = null,
            onSort = { sort = it },
            onViewMode = { scope.launch { container.store.setViewMode(it) } },
            onShowHidden = null,
            onDismiss = { showSort = false },
        )
    }
}

package com.filepilot.app.ui.recent

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.NewReleases
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.core.model.FileCategory
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.AppSettings
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.FileActionsHost
import com.filepilot.app.ui.components.FileListContent
import com.filepilot.app.ui.components.LoadingState
import com.filepilot.app.ui.components.SelectionActionBar
import com.filepilot.app.ui.components.rememberFileActions
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes
import com.filepilot.app.ui.navigation.Selection
import com.filepilot.app.core.model.ViewMode
import kotlinx.coroutines.launch

/**
 * Two views: files opened in FilePilot (recorded locally) and files recently added to
 * the device according to the system media index.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecentScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(0) }
    val recents by container.store.recents.collectAsStateWithLifecycle(emptyList())
    val settings by container.store.settings.collectAsStateWithLifecycle(AppSettings(onboardingDone = true))
    val access by container.access.collectAsStateWithLifecycle()
    val version by container.operations.version.collectAsStateWithLifecycle()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val favoriteIds = remember(favorites) { favorites.mapTo(HashSet()) { it.id } }
    var deviceItems by remember { mutableStateOf<List<FileItem>?>(null) }
    var confirmClear by remember { mutableStateOf(false) }
    val selection = remember { Selection() }
    val actions = rememberFileActions()

    LaunchedEffect(tab, access, version) {
        if (tab == 1) {
            deviceItems = runCatching { container.files.media.category(FileCategory.RECENT, access, 0).items }.getOrDefault(emptyList())
        }
    }
    LaunchedEffect(tab) { selection.clear() }
    BackHandler(enabled = selection.active) { selection.clear() }

    val opened = remember(recents) { recents.map { it.item } }
    val openedAt = remember(recents) { recents.associate { it.item.id to it.openedAt } }
    val visible = if (tab == 0) opened else deviceItems.orEmpty()

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Recent", style = MaterialTheme.typography.titleLarge) },
                    actions = {
                        if (tab == 0 && recents.isNotEmpty()) {
                            IconButton(onClick = { confirmClear = true }) { Icon(Icons.Rounded.DeleteSweep, "Clear recent files list") }
                        }
                    },
                )
                PrimaryTabRow(selectedTabIndex = tab) {
                    Tab(tab == 0, onClick = { tab = 0 }, text = { Text("Opened") })
                    Tab(tab == 1, onClick = { tab = 1 }, text = { Text("New on device") })
                }
            }
        },
        bottomBar = {
            if (selection.active) {
                SelectionActionBar(true, selection.selectedFrom(visible), favoriteIds, actions, null, selection::clear) { selection.selectAll(visible) }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding).fillMaxSize()
        when {
            tab == 0 && opened.isEmpty() -> EmptyState(
                Icons.Rounded.History, "Nothing opened yet",
                "Files you open in FilePilot appear here. This list stays on your device.",
                modifier = modifier,
            )
            tab == 1 && deviceItems == null -> LoadingState(modifier)
            tab == 1 && deviceItems!!.isEmpty() -> EmptyState(
                Icons.Rounded.NewReleases, "No new files",
                if (!access.hasAnyAccess) "Allow storage access to see files added to your device recently." else "No files were added or changed in the last 30 days.",
                modifier = modifier,
                actionLabel = if (!access.hasAnyAccess) "Storage access" else null,
                onAction = if (!access.hasAnyAccess) ({ navigator.go(Routes.PERMISSIONS) }) else null,
            )
            else -> FileListContent(
                items = visible,
                viewMode = if (tab == 0) ViewMode.LIST else settings.viewMode,
                selection = selection,
                showExtensions = settings.showExtensions,
                favoriteIds = favoriteIds,
                onOpen = { navigator.open(it, visible) },
                onMore = { actions.menuFor = it },
                modifier = modifier,
                supporting = { item ->
                    val at = openedAt[item.id]
                    if (tab == 0 && at != null) "Opened ${Format.dateTime(at)}" else null
                },
            )
        }
    }
    FileActionsHost(actions, favoriteIds = favoriteIds, onDone = selection::clear)

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear recent files?") },
            text = { Text("This only clears FilePilot's list. No files are deleted.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    scope.launch { container.store.clearRecents() }
                }) { Text("Clear list") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
}

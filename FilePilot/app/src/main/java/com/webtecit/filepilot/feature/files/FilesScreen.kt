@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.files

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.SectionHeader
import com.webtecit.filepilot.core.permissions.AccessLevel
import com.webtecit.filepilot.core.preferences.StartLocation
import com.webtecit.filepilot.data.SafRoot
import com.webtecit.filepilot.feature.home.StorageCard

@Composable
fun FilesScreen(
    onOpenFolder: (String) -> Unit,
    onGrantAccess: () -> Unit,
    viewModel: FilesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var removeRoot by remember { mutableStateOf<SafRoot?>(null) }
    var autoOpened by rememberSaveable { mutableStateOf(false) }
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    val gate = com.webtecit.filepilot.core.permissions.rememberAccessGate()
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    // "Open Files tab in: Internal storage" — open it once; going back shows this overview.
    LaunchedEffect(state.startLocation, state.access) {
        if (!autoOpened && state.startLocation == StartLocation.INTERNAL && state.access == AccessLevel.FULL) {
            autoOpened = true
            onOpenFolder(viewModel.primaryRoot())
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) viewModel.addRoot(uri)
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Files") }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        androidx.compose.material3.pulltorefresh.PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.access == AccessLevel.LIMITED) {
                    item(key = "limited") {
                        AppCard(onClick = { gate { viewModel.refresh() } }) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconTile(Icons.Rounded.Warning, MaterialTheme.colorScheme.error)
                                Spacer(Modifier.width(14.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("Limited access", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        "Only folders you add below can be opened. Tap to allow access to all files.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
                item(key = "storage") { SectionHeader("Storage") }
                items(state.volumes, key = { "v:" + it.rootId }) { v -> StorageCard(v, onClick = { gate { onOpenFolder(v.rootId) } }) }
    
                item(key = "granted") { SectionHeader("Granted folders and drives") }
                if (state.safRoots.isEmpty()) {
                    item(key = "granted_empty") {
                        Text(
                            "Add an SD card, a USB drive or any folder through Android's folder picker. " +
                                "This works even without access to all files.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 4.dp),
                        )
                    }
                }
                items(state.safRoots, key = { "s:" + it.treeUri }) { root ->
                    AppCard(onClick = { onOpenFolder(root.rootId) }, contentPadding = PaddingValues(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconTile(Icons.Rounded.FolderOpen, MaterialTheme.colorScheme.tertiary)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(root.label, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    if (root.accessible) "Access granted" else "Access lost. Remove it and add it again.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (root.accessible) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                                )
                            }
                            IconButton(onClick = { removeRoot = root }) {
                                Icon(Icons.Rounded.Close, contentDescription = "Remove ${root.label}")
                            }
                        }
                    }
                }
                item(key = "add") {
                    OutlinedButton(onClick = { picker.launch(null) }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Rounded.Add, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Add SD card, USB drive or folder")
                    }
                }
                if (state.bookmarks.isNotEmpty()) {
                    item(key = "bookmarks") { SectionHeader("Bookmarks") }
                    items(state.bookmarks, key = { "b:" + it.id }) { b ->
                        AppCard(onClick = { viewModel.open(b.id) }, contentPadding = PaddingValues(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconTile(Icons.Rounded.Bookmark, MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(14.dp))
                                Text(b.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                IconButton(onClick = { viewModel.removeBookmark(b) }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Remove bookmark ${b.name}")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    removeRoot?.let { root ->
        ConfirmDialog(
            title = "Remove \"${root.label}\"?",
            message = "FilePilot will no longer have access to this folder. Its files stay where they are.",
            confirmLabel = "Remove access",
            onConfirm = { viewModel.removeRoot(root); removeRoot = null },
            onDismiss = { removeRoot = null },
        )
    }
}

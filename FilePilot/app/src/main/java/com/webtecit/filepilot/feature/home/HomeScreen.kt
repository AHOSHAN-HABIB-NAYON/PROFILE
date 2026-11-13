package com.webtecit.filepilot.feature.home

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.SectionHeader
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.permissions.AccessLevel
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.data.LibraryEntry

@Composable
fun HomeScreen(
    onOpenFolder: (String) -> Unit,
    onGrantAccess: () -> Unit,
    onOpenFiles: () -> Unit,
    onOpenLibrary: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header") {
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppLogo(44.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("FilePilot", style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "Coding Pro · Manage everything",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (state.loaded && state.access == AccessLevel.LIMITED) {
                item(key = "access") {
                    AppCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconTile(Icons.Rounded.LockOpen, MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Allow storage access", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "Browse and manage all your folders. Without it, you can still open folders you choose.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Row {
                            Button(onClick = onGrantAccess) { Text("Grant access") }
                            Spacer(Modifier.width(8.dp))
                            TextButton(onClick = onOpenFiles) { Text("Choose a folder") }
                        }
                    }
                }
            }
            item(key = "storage_header") { SectionHeader("Storage") }
            items(state.volumes, key = { "vol:" + it.rootId }) { volume ->
                StorageCard(volume, onClick = { onOpenFolder(volume.rootId) })
            }
            items(state.safRoots, key = { "saf:" + it.treeUri }) { root ->
                AppCard(onClick = { onOpenFolder(root.rootId) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconTile(Icons.Rounded.FolderOpen, MaterialTheme.colorScheme.tertiary)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(root.label, style = MaterialTheme.typography.titleMedium)
                            Text(
                                if (root.accessible) "Granted folder" else "Access lost — open Files to grant it again",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            if (state.quickFolders.isNotEmpty()) {
                item(key = "quick_header") { SectionHeader("Quick access") }
                items(state.quickFolders.chunked(3), key = { row -> "quick:" + row.first().id }) { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { folder -> QuickTile(folder, Modifier.weight(1f)) { onOpenFolder(folder.id) } }
                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            if (state.favorites.isNotEmpty()) {
                item(key = "fav_header") { SectionHeader("Favorites", actionLabel = "See all", onAction = onOpenLibrary) }
                item(key = "favorites") {
                    AppCard(contentPadding = PaddingValues(vertical = 4.dp)) {
                        state.favorites.take(5).forEach { EntryRow(it) { viewModel.open(it.id) } }
                    }
                }
            }
            if (state.recents.isNotEmpty()) {
                item(key = "recent_header") { SectionHeader("Recent files", actionLabel = "See all", onAction = onOpenLibrary) }
                item(key = "recents") {
                    AppCard(contentPadding = PaddingValues(vertical = 4.dp)) {
                        state.recents.take(5).forEach { EntryRow(it, showTime = true) { viewModel.open(it.id) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickTile(folder: QuickFolder, modifier: Modifier, onClick: () -> Unit) {
    val (icon, tint) = when (folder.type) {
        QuickFolderType.DOWNLOADS -> Icons.Rounded.Download to MaterialTheme.colorScheme.primary
        QuickFolderType.CAMERA -> Icons.Rounded.CameraAlt to Color(0xFFDB2777)
        QuickFolderType.PICTURES -> Icons.Rounded.Image to Color(0xFF7C3AED)
        QuickFolderType.DOCUMENTS -> Icons.Rounded.Description to Color(0xFF2563EB)
        QuickFolderType.MUSIC -> Icons.Rounded.MusicNote to Color(0xFFEA580C)
        QuickFolderType.MOVIES -> Icons.Rounded.Movie to Color(0xFFDC2626)
    }
    AppCard(onClick = onClick, modifier = modifier, contentPadding = PaddingValues(12.dp)) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            IconTile(icon, tint, size = 40.dp)
            Spacer(Modifier.height(8.dp))
            Text(folder.label, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun EntryRow(entry: LibraryEntry, showTime: Boolean = false, onClick: () -> Unit) {
    val kind = FileTypes.kindOf(entry.name, entry.isDirectory)
    val style = kindStyle(kind)
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(if (kind == FileKind.FOLDER) Icons.Rounded.Folder else style.icon, style.tint, size = 40.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (showTime) {
                Text(
                    Formatters.date(entry.time),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Icon(
            Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

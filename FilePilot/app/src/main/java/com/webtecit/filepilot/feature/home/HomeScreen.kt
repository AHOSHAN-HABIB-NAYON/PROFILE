package com.webtecit.filepilot.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.R
import com.webtecit.filepilot.brand.Brand
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.ProgressRing
import com.webtecit.filepilot.core.designsystem.SectionHeader
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.permissions.rememberAccessGate
import com.webtecit.filepilot.core.storage.Category
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.StorageVolumeInfo
import com.webtecit.filepilot.core.storage.VolumeType
import com.webtecit.filepilot.data.LibraryEntry
import com.webtecit.filepilot.feature.tools.Tool
import com.webtecit.filepilot.feature.tools.ToolGrid

@Composable
fun HomeScreen(
    onOpenFolder: (String) -> Unit,
    onSearch: (String) -> Unit,
    onTool: (Tool) -> Unit,
    onOpenLibrary: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val gate = rememberAccessGate()
    val context = LocalContext.current
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    val open: (String) -> Unit = { id -> gate { onOpenFolder(id) } }
    val primary = state.volumes.firstOrNull { it.type == VolumeType.INTERNAL }

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
                    Column(Modifier.weight(1f)) {
                        Text(Brand.APP_NAME, style = MaterialTheme.typography.headlineSmall)
                        Text("Manage everything. Edit anything.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { primary?.let { v -> gate { onSearch(v.rootId) } } }) {
                        Icon(Icons.Rounded.Search, contentDescription = "Search files")
                    }
                }
            }
            if (primary != null) {
                item(key = "hero") { HeroStorage(primary, onBrowse = { open(primary.rootId) }, onAnalyze = { gate { onTool(Tool.ANALYZER) } }) }
            }
            items(state.volumes.filter { it.type != VolumeType.INTERNAL }, key = { "vol:" + it.rootId }) { v ->
                StorageCard(v, onClick = { open(v.rootId) })
            }
            items(state.safRoots, key = { "saf:" + it.treeUri }) { root ->
                AppCard(onClick = { onOpenFolder(root.rootId) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconTile(Icons.Rounded.FolderOpen, MaterialTheme.colorScheme.tertiary)
                        Spacer(Modifier.width(14.dp))
                        Text(root.label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    }
                }
            }
            item(key = "cat_header") { SectionHeader("Categories") }
            item(key = "categories") {
                val summaries = state.categories.associateBy { it.category }
                val tiles = listOf(
                    CategoryTile("Images", Icons.Rounded.Image, FileKind.IMAGE, Category.IMAGES.id, summaries[Category.IMAGES]?.let { it.count to it.bytes }),
                    CategoryTile("Videos", Icons.Rounded.Movie, FileKind.VIDEO, Category.VIDEOS.id, summaries[Category.VIDEOS]?.let { it.count to it.bytes }),
                    CategoryTile("Audio", Icons.Rounded.MusicNote, FileKind.AUDIO, Category.AUDIO.id, summaries[Category.AUDIO]?.let { it.count to it.bytes }),
                    CategoryTile("Documents", Icons.Rounded.Description, FileKind.DOCUMENT, Category.DOCUMENTS.id, summaries[Category.DOCUMENTS]?.let { it.count to it.bytes }),
                    CategoryTile("APKs", Icons.Rounded.Android, FileKind.APK, Category.APKS.id, summaries[Category.APKS]?.let { it.count to it.bytes }),
                    CategoryTile("Archives", Icons.Rounded.FolderZip, FileKind.ARCHIVE, Category.ARCHIVES.id, summaries[Category.ARCHIVES]?.let { it.count to it.bytes }),
                    CategoryTile("Downloads", Icons.Rounded.Download, FileKind.FOLDER, state.downloadsId, null),
                    CategoryTile("Recent", Icons.Rounded.History, FileKind.CODE, Category.RECENT.id, null),
                )
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    tiles.chunked(4).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { t -> CategoryCell(t, Modifier.weight(1f)) { if (t.id.isNotEmpty()) open(t.id) } }
                        }
                    }
                }
            }
            item(key = "tools_header") { SectionHeader("Tools") }
            item(key = "tools") { ToolGrid(Tool.entries, onTool = { t -> gate { onTool(t) } }) }
            if (state.quickFolders.isNotEmpty()) {
                item(key = "quick_header") { SectionHeader("Quick access") }
                items(state.quickFolders.chunked(3), key = { row -> "quick:" + row.first().id }) { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { folder -> QuickTile(folder, Modifier.weight(1f)) { open(folder.id) } }
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
                item(key = "recent_header") { SectionHeader("Recently opened", actionLabel = "See all", onAction = onOpenLibrary) }
                item(key = "recents") {
                    AppCard(contentPadding = PaddingValues(vertical = 4.dp)) {
                        state.recents.take(5).forEach { EntryRow(it, showTime = true) { viewModel.open(it.id) } }
                    }
                }
            }
            item(key = "developer") {
                Row(
                    Modifier.fillMaxWidth().clip(CircleShape).clickable { Brand.openUrl(context, Brand.WEBSITE) }
                        .padding(vertical = 8.dp, horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Image(
                        painterResource(R.drawable.developer_photo), contentDescription = "Developer",
                        contentScale = ContentScale.Crop, modifier = Modifier.size(28.dp).clip(CircleShape),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "by ${Brand.DEVELOPER} · webtecit.com",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroStorage(volume: StorageVolumeInfo, onBrowse: () -> Unit, onAnalyze: () -> Unit) {
    val primary = MaterialTheme.colorScheme.primary
    Surface(
        onClick = onBrowse,
        shape = MaterialTheme.shapes.extraLarge,
        color = Color.Transparent,
        modifier = Modifier.fillMaxWidth().testTag("storage_card"),
    ) {
        Row(
            Modifier.background(Brush.linearGradient(listOf(primary, primary.copy(alpha = 0.78f).compositeOverDark()))).padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProgressRing(
                volume.usedFraction, Color.White, size = 96.dp, thickness = 10.dp, trackColor = Color.White.copy(alpha = 0.25f),
            ) {
                Text(Formatters.percent(volume.usedFraction), style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text("used", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
            }
            Spacer(Modifier.width(18.dp))
            Column(Modifier.weight(1f)) {
                Text(volume.label, style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text(
                    "${Formatters.size(volume.usedBytes)} of ${Formatters.size(volume.totalBytes)}",
                    style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.9f),
                )
                Text("${Formatters.size(volume.freeBytes)} free", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                Spacer(Modifier.height(10.dp))
                FilledTonalButton(onClick = onAnalyze, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)) {
                    Text("Analyze storage")
                }
            }
        }
    }
}

private fun Color.compositeOverDark(): Color = Color(red * 0.55f, green * 0.55f, blue * 0.75f, 1f)

private data class CategoryTile(val label: String, val icon: ImageVector, val kind: FileKind, val id: String, val stats: Pair<Int, Long>?)

@Composable
private fun CategoryCell(tile: CategoryTile, modifier: Modifier, onClick: () -> Unit) {
    val tint = if (tile.label == "Downloads") MaterialTheme.colorScheme.primary
    else if (tile.label == "Recent") MaterialTheme.colorScheme.tertiary else kindStyle(tile.kind).tint
    Column(
        modifier.clip(MaterialTheme.shapes.medium).clickable(onClick = onClick).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        IconTile(tile.icon, tint, size = 52.dp)
        Spacer(Modifier.height(6.dp))
        Text(tile.label, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            tile.stats?.let { Formatters.size(it.second) } ?: " ",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(if (kind == FileKind.FOLDER) Icons.Rounded.Folder else style.icon, style.tint, size = 40.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (showTime) Text(Formatters.date(entry.time), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

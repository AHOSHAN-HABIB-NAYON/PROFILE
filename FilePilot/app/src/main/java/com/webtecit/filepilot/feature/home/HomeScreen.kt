package com.webtecit.filepilot.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.ui.graphics.vector.ImageVector
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
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.foundation.border
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
    onSearch: () -> Unit,
    onTool: (Tool) -> Unit,
    onOpenLibrary: () -> Unit,
    onOpenFiles: () -> Unit = {},
    onOpenTools: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val gate = rememberAccessGate()
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    val open: (String) -> Unit = { id -> gate { onOpenFolder(id) } }
    val primary = state.volumes.firstOrNull { it.type == VolumeType.INTERNAL }
    val dark = com.webtecit.filepilot.core.designsystem.LocalDarkTheme.current

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }, containerColor = MaterialTheme.colorScheme.background) { padding ->
        Box(Modifier.fillMaxSize()) {
            // Soft decorative glow at the top of Home.
            androidx.compose.foundation.Canvas(Modifier.fillMaxWidth().height(260.dp)) {
                drawCircle(
                    Brush.radialGradient(listOf(Color(0xFF3D6BFF).copy(alpha = if (dark) 0.20f else 0.12f), Color.Transparent),
                        center = androidx.compose.ui.geometry.Offset(size.width * 0.95f, 0f), radius = size.width * 0.7f),
                    radius = size.width * 0.7f, center = androidx.compose.ui.geometry.Offset(size.width * 0.95f, 0f),
                )
            }
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item(key = "header") {
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = RoundedCornerShape(16.dp), shadowElevation = 4.dp, color = Color.Transparent) { AppLogo(44.dp) }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(Brand.APP_NAME, style = MaterialTheme.typography.headlineSmall)
                            Text("Manage everything. Edit anything.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Surface(
                            onClick = { viewModel.toggleTheme(dark) },
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.surfaceContainerLowest,
                            shadowElevation = 4.dp,
                            modifier = Modifier.size(42.dp).testTag("theme_toggle"),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    if (dark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                    contentDescription = if (dark) "Switch to light mode" else "Switch to dark mode",
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }
                }
                item(key = "search") {
                    Surface(
                        onClick = { gate { onSearch() } },
                        shape = RoundedCornerShape(26.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        shadowElevation = 3.dp,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)),
                        modifier = Modifier.fillMaxWidth().testTag("smart_search"),
                    ) {
                        Row(Modifier.padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.AutoAwesome, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Search anything", style = MaterialTheme.typography.titleMedium)
                                Text("Try \"large videos from last week\"", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Box(Modifier.width(1.dp).height(30.dp).background(MaterialTheme.colorScheme.outlineVariant))
                            Spacer(Modifier.width(14.dp))
                            Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.onSurface)
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
                item(key = "cat_header") { HomeHeader(Icons.Rounded.GridView, "Categories", "View all", onOpenFiles) }
                item(key = "categories") {
                    val summaries = state.categories.associateBy { it.category }
                    fun stats(c: Category) = summaries[c]?.let { it.count to it.bytes }
                    val tiles = listOf(
                        CategoryTile("Images", Icons.Rounded.Image, Color(0xFFE11D74), Category.IMAGES.id, stats(Category.IMAGES)),
                        CategoryTile("Videos", Icons.Rounded.Movie, Color(0xFFDC2626), Category.VIDEOS.id, stats(Category.VIDEOS)),
                        CategoryTile("Audio", Icons.Rounded.MusicNote, Color(0xFFEA580C), Category.AUDIO.id, stats(Category.AUDIO)),
                        CategoryTile("Documents", Icons.Rounded.Description, Color(0xFF2563EB), Category.DOCUMENTS.id, stats(Category.DOCUMENTS)),
                        CategoryTile("APKs", Icons.Rounded.Android, Color(0xFF16A34A), Category.APKS.id, stats(Category.APKS)),
                        CategoryTile("Archives", Icons.Rounded.FolderZip, Color(0xFF9333EA), Category.ARCHIVES.id, stats(Category.ARCHIVES)),
                        CategoryTile("Downloads", Icons.Rounded.Download, Color(0xFF0284C7), state.downloadsId, null),
                        CategoryTile("Recent", Icons.Rounded.History, Color(0xFF0D9488), Category.RECENT.id, null),
                    )
                    UniformGrid(tiles, columns = 4) { t, m -> CategoryCell(t, m) { if (t.id.isNotEmpty()) open(t.id) } }
                }
                item(key = "tools_header") { HomeHeader(Icons.Rounded.Build, "Tools", "More tools", onOpenTools) }
                item(key = "tools") {
                    val tools: List<Tool?> = listOf(Tool.CLEANER, Tool.ANALYZER, Tool.SECURE_FOLDER, null)
                    UniformGrid(tools, columns = 4) { t, m ->
                        if (t != null) ToolCell(t.label, t.icon, Color(t.tint), m) { gate { onTool(t) } }
                        else ToolCell("More Tools", Icons.Rounded.Apps, Color(0xFF6366F1), m, onOpenTools)
                    }
                }
                if (state.quickFolders.isNotEmpty()) {
                    item(key = "quick_header") { HomeHeader(Icons.Rounded.Folder, "Quick access", null, null) }
                    item(key = "quick") {
                        UniformGrid(state.quickFolders, columns = 3) { f, m -> QuickTile(f, m) { open(f.id) } }
                    }
                }
                if (state.favorites.isNotEmpty()) {
                    item(key = "fav_header") { HomeHeader(Icons.Rounded.Star, "Favorites", "See all", onOpenLibrary) }
                    item(key = "favorites") {
                        AppCard(contentPadding = PaddingValues(vertical = 4.dp)) {
                            state.favorites.take(5).forEach { EntryRow(it) { viewModel.open(it.id) } }
                        }
                    }
                }
                if (state.recents.isNotEmpty()) {
                    item(key = "recent_header") { HomeHeader(Icons.Rounded.History, "Recently opened", "See all", onOpenLibrary) }
                    item(key = "recents") {
                        AppCard(contentPadding = PaddingValues(vertical = 4.dp)) {
                            state.recents.take(5).forEach { EntryRow(it, showTime = true) { viewModel.open(it.id) } }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHeader(icon: ImageVector, title: String, action: String?, onAction: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) {
            Row(
                Modifier.clip(CircleShape).clickable(onClick = onAction).padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(action, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(4.dp))
                Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/** Lays items out in equal columns; every cell gets the same width and height. */
@Composable
private fun <T> UniformGrid(items: List<T>, columns: Int, cell: @Composable (T, Modifier) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.chunked(columns).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { cell(it, Modifier.weight(1f)) }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun ToolCell(label: String, icon: ImageVector, tint: Color, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 2.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
        modifier = modifier.height(92.dp),
    ) {
        Column(Modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(30.dp))
            Spacer(Modifier.height(8.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun HeroStorage(volume: StorageVolumeInfo, onBrowse: () -> Unit, onAnalyze: () -> Unit) {
    Surface(
        onClick = onBrowse,
        shape = RoundedCornerShape(30.dp),
        color = Color.Transparent,
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth().testTag("storage_card"),
    ) {
        Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFF3B7BFF), Color(0xFF1D4FE0), Color(0xFF1539B8))))) {
            // Decorative wave and folder.
            androidx.compose.foundation.Canvas(Modifier.matchParentSize()) {
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(0f, size.height * 0.78f)
                    cubicTo(size.width * 0.3f, size.height * 0.62f, size.width * 0.6f, size.height * 1.02f, size.width, size.height * 0.70f)
                    lineTo(size.width, size.height); lineTo(0f, size.height); close()
                }
                drawPath(path, Color.White.copy(alpha = 0.08f))
            }
            Icon(
                Icons.Rounded.Folder, null, tint = Color.White.copy(alpha = 0.18f),
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 14.dp, bottom = 52.dp).size(64.dp),
            )
            Row(Modifier.padding(horizontal = 18.dp, vertical = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                ProgressRing(
                    volume.usedFraction, Color.White, size = 100.dp, thickness = 10.dp, trackColor = Color.White.copy(alpha = 0.22f),
                ) {
                    Text(Formatters.percent(volume.usedFraction), style = MaterialTheme.typography.headlineSmall, color = Color.White)
                    Text("used", style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.85f))
                }
                Spacer(Modifier.width(14.dp))
                Box(Modifier.width(1.dp).height(96.dp).background(Color.White.copy(alpha = 0.25f)))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Storage, null, tint = Color.White, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(volume.label, style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("${Formatters.size(volume.usedBytes)} of ${Formatters.size(volume.totalBytes)}", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.92f))
                    Spacer(Modifier.height(8.dp))
                    Row(
                        Modifier.clip(CircleShape).background(Color(0xFF34D399).copy(alpha = 0.9f)).padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.Check, null, tint = Color(0xFF064E3B), modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("${Formatters.size(volume.freeBytes)} free", style = MaterialTheme.typography.labelMedium, color = Color(0xFF064E3B))
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.clip(CircleShape).background(Color.White).clickable(onClick = onAnalyze).padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.BarChart, null, tint = Color(0xFF1539B8), modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Analyze storage", style = MaterialTheme.typography.labelLarge, color = Color(0xFF0B1B3F))
                        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Color(0xFF0B1B3F), modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

private data class CategoryTile(val label: String, val icon: ImageVector, val tint: Color, val id: String, val stats: Pair<Int, Long>?)

@Composable
private fun CategoryCell(tile: CategoryTile, modifier: Modifier, onClick: () -> Unit) {
    val dark = com.webtecit.filepilot.core.designsystem.LocalDarkTheme.current
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = tile.tint.copy(alpha = if (dark) 0.16f else 0.09f),
        border = androidx.compose.foundation.BorderStroke(1.dp, tile.tint.copy(alpha = 0.12f)),
        modifier = modifier.height(100.dp),
    ) {
        Column(Modifier.fillMaxSize().padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(tile.icon, null, tint = tile.tint, modifier = Modifier.size(32.dp))
            Spacer(Modifier.height(8.dp))
            Text(tile.label, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            // Always reserve the size line, so every tile has the same layout.
            Text(
                tile.stats?.let { Formatters.size(it.second) } ?: " ",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
            )
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
    AppCard(onClick = onClick, modifier = modifier.height(96.dp), contentPadding = PaddingValues(10.dp)) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
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

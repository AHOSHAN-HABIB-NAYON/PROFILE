@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.home

import com.webtecit.filepilot.core.designsystem.EqualGrid
import com.webtecit.filepilot.core.designsystem.GridBox
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.designsystem.enterAnimation
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material.icons.rounded.PieChart
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Code
import androidx.compose.ui.text.font.FontWeight
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
            androidx.compose.material3.pulltorefresh.PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    item(key = "header") {
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp).enterAnimation(0), verticalAlignment = Alignment.CenterVertically) {
                            Surface(shape = RoundedCornerShape(13.dp), shadowElevation = 3.dp, color = Color.Transparent) { AppLogo(40.dp) }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(Brand.APP_NAME, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                Text("Files & developer tools", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            val spin by animateFloatAsState(if (dark) 180f else 0f, tween(450), label = "themeSpin")
                            Surface(
                                onClick = { viewModel.toggleTheme(dark) },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surfaceContainerLowest,
                                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                                modifier = Modifier.size(40.dp).testTag("theme_toggle"),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        if (dark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                        contentDescription = if (dark) "Switch to light mode" else "Switch to dark mode",
                                        tint = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.size(22.dp).graphicsLayer { rotationZ = spin },
                                    )
                                }
                            }
                        }
                    }
                    item(key = "search") {
                        Surface(
                            onClick = { gate { onSearch() } },
                            shape = RoundedCornerShape(14.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerLowest,
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                            modifier = Modifier.fillMaxWidth().height(48.dp).enterAnimation(1).testTag("smart_search"),
                        ) {
                            Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    "Search files, e.g. \"videos over 100 MB\"",
                                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                    if (primary != null) {
                        item(key = "hero") {
                            Box(Modifier.enterAnimation(2)) {
                                HeroStorage(primary, onBrowse = { open(primary.rootId) }, onAnalyze = { gate { onTool(Tool.ANALYZER) } })
                            }
                        }
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
                    item(key = "cat_header") { HomeHeader("Categories", "View all", onOpenFiles) }
                    item(key = "categories") {
                        val summaries = state.categories.associateBy { it.category }
                        fun stats(c: Category) = summaries[c]?.let { it.count to it.bytes }
                        val tiles = listOf(
                            CategoryTile("Images", Icons.Rounded.Image, Palette.Blue, Category.IMAGES.id, stats(Category.IMAGES)),
                            CategoryTile("Videos", Icons.Rounded.Movie, Palette.Pink, Category.VIDEOS.id, stats(Category.VIDEOS)),
                            CategoryTile("Audio", Icons.Rounded.MusicNote, Palette.Orange, Category.AUDIO.id, stats(Category.AUDIO)),
                            CategoryTile("Docs", Icons.Rounded.Description, Palette.Green, Category.DOCUMENTS.id, stats(Category.DOCUMENTS)),
                            CategoryTile("APKs", Icons.Rounded.Android, Palette.Purple, Category.APKS.id, stats(Category.APKS)),
                            CategoryTile("Archives", Icons.Rounded.FolderZip, Palette.Cyan, Category.ARCHIVES.id, stats(Category.ARCHIVES)),
                            CategoryTile("Recent", Icons.Rounded.History, Palette.Slate, Category.RECENT.id, null),
                            CategoryTile("Downloads", Icons.Rounded.Download, Palette.Blue, state.downloadsId, null),
                        )
                        EqualGrid(tiles, columns = 4) { t, m ->
                            GridBox(t.label, t.icon, t.tint, m, subtitle = t.stats?.let { "%,d".format(it.first) } ?: " ") { if (t.id.isNotEmpty()) open(t.id) }
                        }
                    }
                    item(key = "tools_header") { HomeHeader("Tools", "More tools", onOpenTools) }
                    item(key = "tools") {
                        val tools = listOf(
                            Triple(Tool.CLEANER, "Cleaner", Icons.Rounded.CleaningServices to Palette.Green),
                            Triple(Tool.ANALYZER, "Analyzer", Icons.Rounded.PieChart to Palette.Blue),
                            Triple(Tool.SECURE_FOLDER, "Secure", Icons.Rounded.Lock to Palette.Purple),
                            Triple(Tool.CODE_STUDIO, "Code Studio", Icons.Rounded.Code to Palette.Orange),
                        )
                        EqualGrid(tools, columns = 4) { (tool, label, look), m ->
                            GridBox(label, look.first, look.second, m) { gate { onTool(tool) } }
                        }
                    }
                    if (state.quickFolders.isNotEmpty()) {
                        item(key = "quick_header") { HomeHeader("Quick access", null, null) }
                        item(key = "quick") {
                            EqualGrid(state.quickFolders, columns = 3) { f, m -> QuickTile(f, m) { open(f.id) } }
                        }
                    }
                    if (state.favorites.isNotEmpty()) {
                        item(key = "fav_header") { HomeHeader("Favorites", "See all", onOpenLibrary) }
                        item(key = "favorites") {
                            AppCard(contentPadding = PaddingValues(vertical = 4.dp)) {
                                state.favorites.take(5).forEach { EntryRow(it) { viewModel.open(it.id) } }
                            }
                        }
                    }
                    if (state.recents.isNotEmpty()) {
                        item(key = "recent_header") { HomeHeader("Recently opened", "See all", onOpenLibrary) }
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
}

@Composable
private fun HomeHeader(title: String, action: String?, onAction: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().padding(top = 6.dp, start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) {
            Text(
                action, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clip(CircleShape).clickable(onClick = onAction).padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun HeroStorage(volume: StorageVolumeInfo, onBrowse: () -> Unit, onAnalyze: () -> Unit) {
    val animations = com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled.current
    // The bar fills from empty when Home opens.
    val fill = remember { androidx.compose.animation.core.Animatable(if (animations) 0f else volume.usedFraction.toFloat()) }
    LaunchedEffect(volume.usedFraction) {
        fill.animateTo(volume.usedFraction.toFloat(), tween(if (animations) 1100 else 0, easing = androidx.compose.animation.core.FastOutSlowInEasing))
    }
    Surface(
        onClick = onBrowse,
        shape = RoundedCornerShape(22.dp),
        color = Color.Transparent,
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth().testTag("storage_card"),
    ) {
        Column(Modifier.background(Brush.linearGradient(listOf(Color(0xFF3B7BFF), Palette.Navy))).padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(volume.label, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(Formatters.size(volume.usedBytes), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White)
                        Spacer(Modifier.width(6.dp))
                        Text("of ${Formatters.size(volume.totalBytes)}", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f), modifier = Modifier.padding(bottom = 2.dp))
                    }
                }
                Icon(Icons.Rounded.Storage, null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(30.dp))
            }
            Spacer(Modifier.height(10.dp))
            Box(Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f))) {
                Box(Modifier.fillMaxWidth(fill.value.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(Color.White))
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${Formatters.size(volume.freeBytes)} free", style = MaterialTheme.typography.labelMedium, color = Color.White,
                    modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.18f)).padding(horizontal = 10.dp, vertical = 5.dp),
                )
                Spacer(Modifier.weight(1f))
                Row(
                    Modifier.clip(CircleShape).background(Color.White).clickable(onClick = onAnalyze).padding(start = 12.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Analyze", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = Palette.Navy)
                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Palette.Navy, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

private data class CategoryTile(val label: String, val icon: ImageVector, val tint: Color, val id: String, val stats: Pair<Int, Long>?)

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
    GridBox(folder.label, icon, tint, modifier, onClick = onClick)
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

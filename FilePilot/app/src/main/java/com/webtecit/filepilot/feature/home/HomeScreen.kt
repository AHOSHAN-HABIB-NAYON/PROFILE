@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.home

import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Compress
import androidx.compose.foundation.interaction.collectIsPressedAsState
import com.webtecit.filepilot.core.storage.CategorySummary
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.IconButton
import androidx.compose.foundation.lazy.items
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
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.LightMode
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.foundation.border
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
import com.webtecit.filepilot.feature.tools.iconRes
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
                onRefresh = { viewModel.refresh(byUser = true) },
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().testTag("home_list"),
                    contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    item(key = "header") {
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp).enterAnimation(0), verticalAlignment = Alignment.CenterVertically) {
                            Surface(shape = RoundedCornerShape(13.dp), shadowElevation = 4.dp, color = Color.Transparent) { AppLogo(42.dp) }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                val (hello, emoji) = greeting()
                                Text("$hello $emoji", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(Brand.APP_NAME, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            }
                            val spin by animateFloatAsState(if (dark) 180f else 0f, tween(450), label = "themeSpin")
                            Surface(
                                onClick = { viewModel.toggleTheme(dark) },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surfaceContainerLowest,
                                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                                modifier = Modifier.size(42.dp).testTag("theme_toggle"),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        if (dark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                        contentDescription = if (dark) "Switch to light mode" else "Switch to dark mode",
                                        tint = if (dark) Color(0xFFFFD08A) else MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.size(22.dp).graphicsLayer { rotationZ = spin },
                                    )
                                }
                            }
                        }
                    }
                    item(key = "search") {
                        Surface(
                            onClick = { gate { onSearch() } },
                            shape = RoundedCornerShape(15.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerLowest,
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                            modifier = Modifier.fillMaxWidth().height(48.dp).enterAnimation(1).testTag("smart_search"),
                        ) {
                            Row(Modifier.padding(start = 14.dp, end = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    "Search files, e.g. \"big videos\"",
                                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                                )
                                Surface(
                                    onClick = { onTool(Tool.QR_SCAN) },
                                    shape = RoundedCornerShape(10.dp),
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                                    modifier = Modifier.size(34.dp),
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Rounded.QrCodeScanner, "Scan QR code", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                    }
                                }
                            }
                        }
                    }
                    if (primary != null) {
                        item(key = "hero") {
                            Box(Modifier.enterAnimation(2)) {
                                HeroStorage(primary, state.categories, onBrowse = { open(primary.rootId) }, onAnalyze = { gate { onTool(Tool.FOLDER_SIZE) } })
                            }
                        }
                    }
                    items(state.tasks, key = { "task:" + it.id }) { task ->
                        TaskCard(task, onStop = { viewModel.stopTask(task.id) })
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
                        val used = (primary?.usedBytes ?: 0L).coerceAtLeast(1L)
                        val tiles = listOf(
                            CategoryTile("Images", Icons.Rounded.Image, Palette.Blue, Category.IMAGES.id, summaries[Category.IMAGES], R.drawable.ic_cat_images),
                            CategoryTile("Videos", Icons.Rounded.Movie, Palette.Pink, Category.VIDEOS.id, summaries[Category.VIDEOS], R.drawable.ic_cat_videos),
                            CategoryTile("Audio", Icons.Rounded.MusicNote, Palette.Orange, Category.AUDIO.id, summaries[Category.AUDIO], R.drawable.ic_cat_audio),
                            CategoryTile("Docs", Icons.Rounded.Description, Palette.Green, Category.DOCUMENTS.id, summaries[Category.DOCUMENTS], R.drawable.ic_cat_docs),
                            CategoryTile("APKs", Icons.Rounded.Android, Palette.Purple, Category.APKS.id, summaries[Category.APKS], R.drawable.ic_cat_apks),
                            CategoryTile("Archives", Icons.Rounded.FolderZip, Palette.Cyan, Category.ARCHIVES.id, summaries[Category.ARCHIVES], R.drawable.ic_cat_archives),
                            CategoryTile("Code", Icons.Rounded.Code, Palette.Slate, Category.CODE.id, summaries[Category.CODE], R.drawable.ic_cat_code),
                            CategoryTile("Downloads", Icons.Rounded.Download, Palette.Blue, state.downloadsId, summaries[Category.DOWNLOADS], R.drawable.ic_cat_downloads),
                        )
                        EqualGrid(tiles, columns = 4) { t, m ->
                            RingBox(
                                t.label, t.icon, t.tint,
                                fraction = t.summary?.let { (it.bytes.toFloat() / used).coerceIn(0f, 1f) },
                                subtitle = t.summary?.let { Formatters.size(it.bytes) } ?: "—",
                                modifier = m,
                                iconRes = t.iconRes,
                            ) { if (t.id.isNotEmpty()) open(t.id) }
                        }
                    }
                    item(key = "tools_header") { HomeHeader("Quick tools", "All tools", onOpenTools) }
                    item(key = "tools") {
                        val tools = listOf(
                            Tool.CLEANER to "Cleaner", Tool.CODE_STUDIO to "Code", Tool.WHATSAPP_MEDIA to "WhatsApp", Tool.LARGE_FILES to "Large files",
                            Tool.RECYCLE_BIN to "Recycle Bin", Tool.SECURE_FOLDER to "Secure", Tool.QR_SCAN to "QR scan", Tool.STITCH to "Long shot",
                        )
                        EqualGrid(tools, columns = 4) { (tool, label), m ->
                            GridBox(label, tool.icon, Color(tool.tint), m.testTag("qt_${tool.name}"), iconRes = tool.iconRes) { gate { onTool(tool) } }
                        }
                    }
                    item(key = "recent_header") { HomeHeader("Recent files", if (state.recents.isNotEmpty()) "See all" else null, onOpenLibrary) }
                    if (state.recents.isEmpty()) {
                        item(key = "recents_empty") {
                            AppCard(modifier = Modifier.enterAnimation(3)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    IconTile(Icons.Rounded.History, Palette.Slate, size = 38.dp)
                                    Spacer(Modifier.width(12.dp))
                                    Text(
                                        "Files you open will appear here.",
                                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    } else {
                        item(key = "recents") {
                            AppCard(contentPadding = PaddingValues(vertical = 4.dp), modifier = Modifier.enterAnimation(3)) {
                                state.recents.take(4).forEach { EntryRow(it, showTime = true) { viewModel.open(it.id) } }
                            }
                        }
                    }
                    if (state.favorites.isNotEmpty()) {
                        item(key = "fav_header") { HomeHeader("Favorites", "See all", onOpenLibrary) }
                        item(key = "favorites") {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                state.favorites.take(3).forEach { f -> FavoriteCard(f, Modifier.weight(1f)) { viewModel.open(f.id) } }
                                repeat(3 - state.favorites.take(3).size) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                    }
                    item(key = "quick_header") { HomeHeader("Quick access", null, null) }
                    item(key = "quick") {
                        val order = listOf(QuickFolderType.DOWNLOADS, QuickFolderType.CAMERA, QuickFolderType.DOCUMENTS, QuickFolderType.PICTURES, QuickFolderType.MUSIC, QuickFolderType.MOVIES)
                        val folders = state.quickFolders.sortedBy { order.indexOf(it.type) }.take(3)
                        val cards: List<QuickCard> = folders.map { QuickCard(it.label, quickIcon(it.type), "${"%,d".format(it.count)} items") { open(it.id) } } +
                            QuickCard("Favorites", com.webtecit.filepilot.R.drawable.ic_qa_favorites, "${state.favorites.size} items", onOpenLibrary)
                        EqualGrid(cards, columns = 4) { c, m -> QuickAccessCard(c, m) }
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

/** "Good morning" and friends, by the phone's clock. */
private fun greeting(): Pair<String, String> =
    when (java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)) {
        in 5..11 -> "Good morning" to "☀️"
        in 12..16 -> "Good afternoon" to "🌤️"
        in 17..20 -> "Good evening" to "👋"
        else -> "Good night" to "🌙"
    }

@Composable
private fun animatedFraction(target: Float, durationMs: Int = 1100): Float {
    val animations = com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled.current
    val value = remember { androidx.compose.animation.core.Animatable(if (animations) 0f else target) }
    LaunchedEffect(target) {
        value.animateTo(target, tween(if (animations) durationMs else 0, easing = androidx.compose.animation.core.FastOutSlowInEasing))
    }
    return value.value
}

@Composable
private fun HeroStorage(volume: StorageVolumeInfo, categories: List<CategorySummary>, onBrowse: () -> Unit, onAnalyze: () -> Unit) {
    val used = animatedFraction(volume.usedFraction.toFloat())
    val total = volume.totalBytes.coerceAtLeast(1L).toFloat()
    val byCat = categories.associateBy { it.category }
    // Coloured parts of the bar: what the main file types take.
    val parts = listOf(
        Triple("Videos", Color(0xFFFF8FB1), byCat[Category.VIDEOS]?.bytes ?: 0L),
        Triple("Images", Color.White, byCat[Category.IMAGES]?.bytes ?: 0L),
        Triple("Audio", Color(0xFFFFD08A), byCat[Category.AUDIO]?.bytes ?: 0L),
        Triple("Apps", Color(0xFFB9A6FF), byCat[Category.APKS]?.bytes ?: 0L),
    )
    val grow = animatedFraction(1f, 1300)
    Surface(
        onClick = onBrowse,
        shape = RoundedCornerShape(22.dp),
        color = Color.Transparent,
        shadowElevation = 5.dp,
        modifier = Modifier.fillMaxWidth().testTag("storage_card"),
    ) {
        Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFF3B7BFF), Palette.Navy)))) {
            androidx.compose.foundation.Canvas(Modifier.matchParentSize()) {
                drawCircle(Color.White.copy(alpha = 0.08f), radius = size.minDimension * 0.55f, center = androidx.compose.ui.geometry.Offset(size.width * 0.95f, -size.height * 0.05f))
            }
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(volume.label, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(Formatters.size(volume.usedBytes), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = Color.White)
                            Spacer(Modifier.width(6.dp))
                            Text("of ${Formatters.size(volume.totalBytes)}", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f), modifier = Modifier.padding(bottom = 3.dp))
                        }
                    }
                    Box(Modifier.size(60.dp), contentAlignment = Alignment.Center) {
                        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
                            val stroke = 6.dp.toPx()
                            val inset = stroke / 2
                            val arc = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke)
                            val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
                            drawArc(Color.White.copy(alpha = 0.22f), 0f, 360f, false, topLeft, arc, style = androidx.compose.ui.graphics.drawscope.Stroke(stroke))
                            drawArc(Color.White, -90f, 360f * used, false, topLeft, arc, style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round))
                        }
                        Text("${(used * 100).toInt()}%", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f))) {
                    parts.forEach { (_, color, bytes) ->
                        val w = (bytes / total * grow).coerceIn(0f, 1f)
                        if (w > 0.002f) Box(Modifier.fillMaxHeight().weight(w).background(color))
                    }
                    val rest = 1f - parts.sumOf { it.third.toDouble() }.toFloat() / total * grow
                    if (rest > 0.001f) Spacer(Modifier.weight(rest))
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    parts.forEach { (label, color, _) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(color))
                            Spacer(Modifier.width(4.dp))
                            Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.9f))
                        }
                    }
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
                        Text("Folder size", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = Palette.Navy)
                        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Palette.Navy, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

private data class CategoryTile(val label: String, val icon: ImageVector, val tint: Color, val id: String, val summary: CategorySummary?, val iconRes: Int)

/** A category box: icon inside a ring that fills with the share of used space this type takes. */
@Composable
private fun RingBox(label: String, icon: ImageVector, tint: Color, fraction: Float?, subtitle: String, modifier: Modifier, iconRes: Int? = null, onClick: () -> Unit) {
    val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f, label = "press")
    // Small shares still show a visible sliver.
    val sweep = animatedFraction(fraction?.let { if (it > 0f) it.coerceAtLeast(0.03f) else 0f } ?: 0f, 1200)
    val track = tint.copy(alpha = 0.14f)
    Surface(
        onClick = onClick,
        interactionSource = interaction,
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        shadowElevation = 1.dp,
        modifier = modifier.height(112.dp).graphicsLayer { scaleX = scale; scaleY = scale },
    ) {
        Column(Modifier.fillMaxSize().padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
                    val stroke = 3.5.dp.toPx()
                    val inset = stroke / 2
                    val arc = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke)
                    val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
                    drawArc(track, 0f, 360f, false, topLeft, arc, style = androidx.compose.ui.graphics.drawscope.Stroke(stroke))
                    if (sweep > 0f) {
                        drawArc(tint, -90f, 360f * sweep, false, topLeft, arc, style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round))
                    }
                }
                if (iconRes != null) {
                    androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(iconRes), null, modifier = Modifier.size(36.dp))
                } else {
                    Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

/** A running background job (zip, scan, copy) with its progress and a stop button. */
@Composable
private fun TaskCard(task: com.webtecit.filepilot.core.tasks.BgTask, onStop: () -> Unit) {
    AppCard(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp), modifier = Modifier.enterAnimation(0)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconTile(Icons.Rounded.Sync, Palette.Blue, size = 38.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(task.title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    val p = task.progress
                    if (p != null) {
                        Text("${(p * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
                Spacer(Modifier.height(6.dp))
                val progress = task.progress
                if (progress != null) {
                    androidx.compose.material3.LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().clip(CircleShape))
                } else {
                    androidx.compose.material3.LinearProgressIndicator(modifier = Modifier.fillMaxWidth().clip(CircleShape))
                }
            }
            IconButton(onClick = onStop) { Icon(Icons.Rounded.Close, contentDescription = "Stop ${task.title}") }
        }
    }
}

private class QuickCard(val label: String, val iconRes: Int, val subtitle: String, val onClick: () -> Unit)

private fun quickIcon(type: QuickFolderType): Int = when (type) {
    QuickFolderType.DOWNLOADS -> com.webtecit.filepilot.R.drawable.ic_qa_download
    QuickFolderType.CAMERA -> com.webtecit.filepilot.R.drawable.ic_qa_camera
    QuickFolderType.PICTURES -> com.webtecit.filepilot.R.drawable.ic_qa_pictures
    QuickFolderType.DOCUMENTS -> com.webtecit.filepilot.R.drawable.ic_qa_documents
    QuickFolderType.MUSIC -> com.webtecit.filepilot.R.drawable.ic_qa_music
    QuickFolderType.MOVIES -> com.webtecit.filepilot.R.drawable.ic_qa_movies
}

@Composable
private fun QuickAccessCard(card: QuickCard, modifier: Modifier) {
    Surface(
        onClick = card.onClick,
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        modifier = modifier.height(100.dp),
    ) {
        Column(Modifier.fillMaxSize().padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(card.iconRes), null, modifier = Modifier.size(38.dp))
            Spacer(Modifier.height(6.dp))
            Text(card.label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(card.subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
private fun FavoriteCard(entry: LibraryEntry, modifier: Modifier, onClick: () -> Unit) {
    val style = kindStyle(FileTypes.kindOf(entry.name, entry.isDirectory))
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        modifier = modifier.height(96.dp),
    ) {
        Column(Modifier.fillMaxSize().padding(12.dp)) {
            com.webtecit.filepilot.core.designsystem.GradientIcon(if (entry.isDirectory) Icons.Rounded.Folder else style.icon, if (entry.isDirectory) Palette.Orange else style.tint, size = 36.dp)
            Spacer(Modifier.weight(1f))
            Text(entry.name, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (entry.isDirectory) "Folder" else "File", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun QuickChip(folder: QuickFolder, onClick: () -> Unit) {
    val (icon, tint) = when (folder.type) {
        QuickFolderType.DOWNLOADS -> Icons.Rounded.Download to Palette.Blue
        QuickFolderType.CAMERA -> Icons.Rounded.CameraAlt to Palette.Pink
        QuickFolderType.PICTURES -> Icons.Rounded.Image to Palette.Purple
        QuickFolderType.DOCUMENTS -> Icons.Rounded.Description to Palette.Green
        QuickFolderType.MUSIC -> Icons.Rounded.MusicNote to Palette.Orange
        QuickFolderType.MOVIES -> Icons.Rounded.Movie to Palette.Red
    }
    QuickChipView(folder.label, icon, tint, onClick)
}

@Composable
private fun QuickChipView(label: String, icon: ImageVector, tint: Color, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
    ) {
        Row(Modifier.height(38.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
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

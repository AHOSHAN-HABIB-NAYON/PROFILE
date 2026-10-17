package com.filepilot.app.ui.home

import android.os.Build
import android.provider.DocumentsContract
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Sd
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SdStorage
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.R
import com.filepilot.app.core.model.FileCategory
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.storage.VolumeInfo
import com.filepilot.app.permissions.AccessState
import com.filepilot.app.permissions.rememberAccessRequester
import com.filepilot.app.ui.components.AccessNotice
import com.filepilot.app.ui.components.FileThumb
import com.filepilot.app.ui.components.SectionHeader
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes
import com.filepilot.app.ui.navigation.appViewModel

data class CategoryCard(val category: FileCategory, val icon: ImageVector, val color: Color, val label: String)

val homeCategories = listOf(
    CategoryCard(FileCategory.RECENT, Icons.Rounded.Schedule, Color(0xFF6366F1), "Recent"),
    CategoryCard(FileCategory.IMAGES, Icons.Rounded.Image, Color(0xFF10B981), "Images"),
    CategoryCard(FileCategory.VIDEOS, Icons.Rounded.Movie, Color(0xFFF43F5E), "Videos"),
    CategoryCard(FileCategory.AUDIO, Icons.Rounded.MusicNote, Color(0xFFF59E0B), "Audio"),
    CategoryCard(FileCategory.DOCUMENTS, Icons.Rounded.Description, Color(0xFF3B82F6), "Documents"),
    CategoryCard(FileCategory.DOWNLOADS, Icons.Rounded.Download, Color(0xFF0EA5E9), "Downloads"),
    CategoryCard(FileCategory.APKS, Icons.Rounded.Android, Color(0xFF65A30D), "APKs"),
    CategoryCard(FileCategory.ARCHIVES, Icons.Rounded.FolderZip, Color(0xFF8B5CF6), "Archives"),
    CategoryCard(FileCategory.FAVORITES, Icons.Rounded.Star, Color(0xFFEAB308), "Favorites"),
    CategoryCard(FileCategory.LARGE, Icons.Rounded.SdStorage, Color(0xFFEC4899), "Large files"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val vm = appViewModel { c, _ -> HomeViewModel(c) }
    val volumes by vm.volumes.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val access by container.access.collectAsStateWithLifecycle()
    val recents by container.store.recents.collectAsStateWithLifecycle(emptyList())
    val requester = rememberAccessRequester()

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding()) {
        HomeHeader(
            onSearch = { query -> navigator.go(Routes.search(query)) },
            onSettings = { navigator.switchTab(Routes.SETTINGS) },
        )
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                container.refreshAccess()
                vm.load(manual = true)
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    StorageCard(
                        volumes = volumes,
                        access = access,
                        onOpenVolume = { v -> openVolume(v, access, navigator::openFolder, requester::pickFolder, onNeedAccess = { navigator.go(Routes.PERMISSIONS) }) },
                    )
                }
                if (!access.hasAnyAccess) {
                    item {
                        AccessNotice(
                            title = "FilePilot can't see your files yet",
                            message = "Allow storage access to browse and manage files, or pick a single folder.",
                            actionLabel = "Review access options",
                            onAction = { navigator.go(Routes.PERMISSIONS) },
                        )
                    }
                }
                item { SectionHeader("Categories") }
                item { CategoryGrid(onClick = { navigator.category(it) }) }
                if (recents.isNotEmpty()) {
                    item {
                        SectionHeader("Recently opened") {
                            Text(
                                "See all",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { navigator.switchTab(Routes.RECENT) }.padding(8.dp),
                            )
                        }
                    }
                    item {
                        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(recents.take(10), key = { it.item.id }) { entry ->
                                Column(
                                    Modifier
                                        .width(92.dp)
                                        .clip(MaterialTheme.shapes.medium)
                                        .clickable { navigator.open(entry.item) }
                                        .padding(6.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    FileThumb(entry.item, size = 64.dp, corner = 16.dp)
                                    Spacer(Modifier.height(6.dp))
                                    Text(entry.item.name, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
                item { SectionHeader("Tools") }
                item {
                    ToolRow(Icons.Rounded.CleaningServices, "Storage cleanup", "Large files, duplicates and empty folders") { navigator.go(Routes.CLEANUP) }
                    ToolRow(Icons.Rounded.History, "Operation history", "Completed and failed file tasks") { navigator.go(Routes.HISTORY) }
                    ToolRow(Icons.Rounded.Security, "Storage access", if (access.fullAccess) "Full access allowed" else "Review what FilePilot can reach") {
                        navigator.go(Routes.PERMISSIONS)
                    }
                }
            }
        }
    }
}

/** Opens a storage volume the best way the current access allows. */
private fun openVolume(
    v: VolumeInfo,
    access: AccessState,
    openFolder: (Location) -> Unit,
    pickFolder: (android.net.Uri?) -> Unit,
    onNeedAccess: () -> Unit,
) {
    val path = v.path
    val legacyReadable = Build.VERSION.SDK_INT < Build.VERSION_CODES.R && access.images
    when {
        path != null && (access.fullAccess || legacyReadable) -> openFolder(Location.Local(path))
        v.isRemovable -> {
            // Without full access, the SD card is reachable through the system folder picker.
            val initial = v.volume?.uuid?.let { uuid ->
                DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "$uuid:")
            }
            pickFolder(initial)
        }
        else -> onNeedAccess()
    }
}

@Composable
private fun HomeHeader(onSearch: (String) -> Unit, onSettings: () -> Unit) {
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    Row(
        Modifier.fillMaxWidth().height(64.dp).padding(start = 16.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AnimatedContent(
            targetState = searching,
            transitionSpec = {
                (fadeIn(tween(200)) + expandHorizontally(tween(260, easing = FastOutSlowInEasing), expandFrom = Alignment.End))
                    .togetherWith(fadeOut(tween(150)) + shrinkHorizontally(tween(220), shrinkTowards = Alignment.End))
            },
            label = "search",
            modifier = Modifier.weight(1f),
        ) { open ->
            if (open) {
                val focus = remember { FocusRequester() }
                LaunchedEffect(Unit) { focus.requestFocus() }
                TextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search files by name or extension") },
                    leadingIcon = { Icon(Icons.Rounded.Search, null) },
                    trailingIcon = {
                        IconButton(onClick = {
                            searching = false
                            query = ""
                        }) { Icon(Icons.Rounded.Close, "Close search") }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(50),
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = {
                        onSearch(query)
                        searching = false
                    }),
                    modifier = Modifier.fillMaxWidth().padding(end = 8.dp).focusRequester(focus),
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.ic_logo_mark), contentDescription = null, modifier = Modifier.size(32.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("FilePilot", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1f))
                    IconButton(onClick = { searching = true }) { Icon(Icons.Rounded.Search, "Search") }
                }
            }
        }
        if (!searching) {
            IconButton(onClick = onSettings) { Icon(Icons.Rounded.Settings, "Settings") }
        }
    }
}

@Composable
private fun StorageCard(volumes: List<VolumeInfo>, access: AccessState, onOpenVolume: (VolumeInfo) -> Unit) {
    val primary = volumes.firstOrNull { it.isPrimary }
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Storage", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (primary != null && primary.hasStats) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(Format.size(primary.usedBytes), style = MaterialTheme.typography.headlineSmall)
                            Text(
                                "  used of ${Format.size(primary.totalBytes)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(bottom = 3.dp),
                            )
                        }
                    } else {
                        Text("Storage details unavailable", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (primary != null && primary.hasStats) {
                    Text(
                        Format.percent(primary.usedBytes, primary.totalBytes),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            if (primary != null && primary.hasStats) {
                Spacer(Modifier.height(12.dp))
                UsageBar(primary.usedFraction)
                Spacer(Modifier.height(8.dp))
                Row {
                    Legend(MaterialTheme.colorScheme.primary, "Used ${Format.size(primary.usedBytes)}")
                    Spacer(Modifier.width(16.dp))
                    Legend(MaterialTheme.colorScheme.surfaceContainerHighest, "Free ${Format.size(primary.freeBytes)}")
                }
            }
            Spacer(Modifier.height(10.dp))
            volumes.forEach { v -> VolumeRow(v, access, onClick = { onOpenVolume(v) }) }
        }
    }
}

@Composable
private fun UsageBar(fraction: Float) {
    var target by remember { mutableStateOf(0f) }
    LaunchedEffect(fraction) { target = fraction }
    val animated by animateFloatAsState(target, tween(900, easing = FastOutSlowInEasing), label = "usage")
    LinearProgressIndicator(
        progress = { animated },
        modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)),
        trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
        strokeCap = StrokeCap.Round,
        gapSize = 0.dp,
        drawStopIndicator = {},
    )
}

@Composable
private fun Legend(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun VolumeRow(v: VolumeInfo, access: AccessState, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(if (v.isRemovable) Icons.Rounded.Sd else Icons.Rounded.Storage, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(v.label, style = MaterialTheme.typography.bodyLarge)
            val sub = when {
                v.hasStats -> "${Format.size(v.freeBytes)} free of ${Format.size(v.totalBytes)}" + if (v.readOnly) " · read-only" else ""
                else -> "Capacity unavailable"
            }
            val needsGrant = !access.fullAccess && !(Build.VERSION.SDK_INT < Build.VERSION_CODES.R && access.images)
            Text(
                if (needsGrant) "$sub · tap to grant access" else sub,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CategoryGrid(onClick: (FileCategory) -> Unit) {
    Column(Modifier.padding(horizontal = 12.dp)) {
        homeCategories.chunked(5).forEach { row ->
            Row(Modifier.fillMaxWidth()) {
                row.forEach { card ->
                    CategoryTile(card, Modifier.weight(1f)) { onClick(card.category) }
                }
                repeat(5 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun CategoryTile(card: CategoryCard, modifier: Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.92f else 1f, label = "tile")
    Column(
        modifier
            .scale(scale)
            .clip(MaterialTheme.shapes.medium)
            .clickable(interactionSource = interaction, indication = androidx.compose.material3.ripple(), onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(15.dp))
                .background(card.color.copy(alpha = 0.12f))
                .border(1.dp, card.color.copy(alpha = 0.14f), RoundedCornerShape(15.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(card.icon, null, tint = card.color, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(card.label, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun ToolRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.secondaryContainer),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(20.dp)) }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@file:OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.browser

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DriveFileRenameOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.OpenInBrowser
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.FileThumb
import com.webtecit.filepilot.core.operations.ClipMode
import com.webtecit.filepilot.core.operations.FileClip
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileKind


/** Second line of a row: "1.2 MB · 13 Nov 2026" for files, the date for folders. */
fun FileItem.subtitle(): String =
    if (isDirectory) Formatters.shortDate(lastModified)
    else "${Formatters.size(size)} · ${Formatters.shortDate(lastModified)}"

@Composable
fun FileRow(
    item: FileItem,
    selected: Boolean,
    selectionMode: Boolean,
    showExtension: Boolean,
    favorite: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
    subtitleOverride: String? = null,
) {
    val haptics = LocalHapticFeedback.current
    val background = if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surface
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(background)
            .combinedClickable(
                onClick = onClick,
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLongClick()
                },
            )
            .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp)
            .testTag("file_row"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.animation.AnimatedVisibility(
            visible = selectionMode,
            enter = androidx.compose.animation.expandHorizontally() + androidx.compose.animation.fadeIn(),
            exit = androidx.compose.animation.shrinkHorizontally() + androidx.compose.animation.fadeOut(),
        ) {
            Row {
                SelectTick(selected, Modifier.testTag("select_tick"))
                Spacer(Modifier.width(12.dp))
            }
        }
        FileThumb(item)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    item.displayName(showExtension),
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (favorite) {
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        Icons.Rounded.Star,
                        contentDescription = "Favorite",
                        tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
            Text(
                subtitleOverride ?: item.subtitle(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!selectionMode) {
            IconButton(onClick = onMore) {
                Icon(Icons.Rounded.MoreVert, contentDescription = "More actions for ${item.name}")
            }
        } else {
            Spacer(Modifier.width(12.dp))
        }
    }
}

@Composable
fun FileGridCell(
    item: FileItem,
    selected: Boolean,
    showExtension: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = modifier
            .padding(4.dp)
            .clip(shape)
            .background(
                if (selected) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceContainerLow,
            )
            .border(
                1.dp,
                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                shape,
            )
            .combinedClickable(
                onClick = onClick,
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLongClick()
                },
            )
            .padding(10.dp)
            .testTag("file_cell"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1.15f), contentAlignment = Alignment.Center) {
            FileThumb(item, size = 64.dp)
            if (selected) SelectTick(true, Modifier.align(Alignment.TopStart))
        }
        Spacer(Modifier.height(6.dp))
        Text(
            item.displayName(showExtension),
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            if (item.isDirectory) "Folder" else Formatters.size(item.size),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

@Composable
fun PlaceholderRow(modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
        )
        Spacer(Modifier.width(14.dp))
        Column {
            Box(Modifier.width(160.dp).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh))
            Spacer(Modifier.height(8.dp))
            Box(Modifier.width(96.dp).height(10.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surfaceContainer))
        }
    }
}

@Composable
fun Breadcrumbs(crumbs: List<Crumb>, onCrumb: (Int) -> Unit, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    LaunchedEffect(crumbs.size) { if (crumbs.isNotEmpty()) listState.animateScrollToItem(crumbs.lastIndex) }
    LazyRow(
        state = listState,
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        itemsIndexed(crumbs, key = { _, c -> c.id }) { index, crumb ->
            val last = index == crumbs.lastIndex
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    crumb.label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (last) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (last) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(enabled = !last) { onCrumb(index) }
                        .padding(horizontal = 6.dp, vertical = 8.dp),
                )
                if (!last) {
                    Icon(
                        Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.outline,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

@Composable
fun PasteBar(clip: FileClip, onPaste: () -> Unit, onCancel: () -> Unit, onView: () -> Unit = {}, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 0.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (clip.mode == ClipMode.COPY) Icons.Rounded.ContentCopy else Icons.Rounded.ContentCut,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f).clickable(onClick = onView)) {
                Text(
                    if (clip.mode == ClipMode.COPY) "Copy ${Formatters.count(clip.items.size, "item")}"
                    else "Move ${Formatters.count(clip.items.size, "item")}",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    "Tap to review · copy more to add",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onCancel) { Icon(Icons.Rounded.Close, contentDescription = "Cancel paste") }
            Button(onClick = onPaste) {
                Icon(Icons.Rounded.ContentPaste, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Paste here")
            }
        }
    }
}

/** Bottom bar shown while items are selected. */
@Composable
fun SelectionBar(
    count: Int,
    onCopy: () -> Unit,
    onCut: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = modifier.fillMaxWidth()) {
        Row(
            Modifier.navigationBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            BarAction(Icons.Rounded.ContentCopy, "Copy", count > 0, onCopy)
            BarAction(Icons.Rounded.ContentCut, "Move", count > 0, onCut)
            BarAction(Icons.Rounded.Share, "Share", count > 0, onShare)
            BarAction(Icons.Rounded.Delete, "Delete", count > 0, onDelete)
        }
    }
}

@Composable
private fun BarAction(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    TextButton(onClick = onClick, enabled = enabled) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null)
            Spacer(Modifier.height(2.dp))
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

enum class ItemAction(val label: String, val icon: ImageVector) {
    OPEN("Open", Icons.Rounded.OpenInBrowser),
    EDIT("Edit in Code Studio", Icons.Rounded.Code),
    RUN("Run website", Icons.Rounded.PlayArrow),
    OPEN_WITH("Open with", Icons.AutoMirrored.Rounded.OpenInNew),
    SHARE("Share", Icons.Rounded.Share),
    COPY("Copy", Icons.Rounded.ContentCopy),
    MOVE("Move", Icons.Rounded.ContentCut),
    RENAME("Rename", Icons.Rounded.DriveFileRenameOutline),
    FAVORITE("Add to favorites", Icons.Rounded.StarBorder),
    UNFAVORITE("Remove from favorites", Icons.Rounded.Star),
    COPY_PATH("Copy path", Icons.Rounded.Link),
    TOOL_APK("APK information", Icons.Rounded.Info),
    TOOL_SQLITE("Open in SQLite viewer", Icons.Rounded.Info),
    TOOL_ARCHIVE("Open archive", Icons.Rounded.Info),
    TOOL_FONT("Font preview", Icons.Rounded.Info),
    TOOL_PDF("Open in PDF viewer", Icons.Rounded.Info),
    COMPRESS_PDF("Compress PDF", Icons.Rounded.Info),
    TOOL_HEX("HEX editor", Icons.Rounded.Info),
    ZIP("Create archive", Icons.Rounded.ContentCopy),
    COPY_TO("Copy to…", Icons.Rounded.ContentCopy),
    MOVE_TO("Move to…", Icons.Rounded.ContentCut),
    SPLIT("Split into parts", Icons.Rounded.ContentCut),
    MERGE_PARTS("Join split parts", Icons.Rounded.ContentPaste),
    SEARCH_TEXT("Search text in this folder", Icons.Rounded.Info),
    VAULT("Move to Secure Folder", Icons.Rounded.Star),
    DETAILS("Details", Icons.Rounded.Info),
    DELETE("Delete", Icons.Rounded.Delete),
}

@Composable
fun ItemActionsSheet(
    item: FileItem,
    favorite: Boolean,
    onAction: (ItemAction) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val actions = buildList {
        add(ItemAction.OPEN)
        val local = item.id.startsWith("/")
        if (!item.isDirectory && item.size <= 8_000_000 && (item.kind == FileKind.CODE || item.kind == FileKind.TEXT || item.extension.isEmpty())) add(ItemAction.EDIT)
        if (local && (item.extension == "html" || item.extension == "htm" ||
                (item.isDirectory && java.io.File(item.id, "index.html").isFile))) add(ItemAction.RUN)
        if (!item.isDirectory) {
            add(ItemAction.OPEN_WITH)
            add(ItemAction.SHARE)
        }
        add(ItemAction.COPY)
        add(ItemAction.MOVE)
        add(ItemAction.RENAME)
        add(if (favorite) ItemAction.UNFAVORITE else ItemAction.FAVORITE)
        add(ItemAction.COPY_PATH)
        if (local) {
            when {
                item.kind == FileKind.APK -> add(ItemAction.TOOL_APK)
                item.kind == FileKind.DATABASE -> add(ItemAction.TOOL_SQLITE)
                item.kind == FileKind.ARCHIVE -> add(ItemAction.TOOL_ARCHIVE)
                item.kind == FileKind.FONT -> add(ItemAction.TOOL_FONT)
            }
            if (!item.isDirectory) add(ItemAction.TOOL_HEX)
            add(ItemAction.ZIP)
            add(ItemAction.COPY_TO)
            add(ItemAction.MOVE_TO)
            if (!item.isDirectory && item.size > 10_000_000) add(ItemAction.SPLIT)
            if (item.extension.matches(Regex("\\d{3}"))) add(ItemAction.MERGE_PARTS)
            if (item.isDirectory) add(ItemAction.SEARCH_TEXT)
        }
        if (item.kind == FileKind.PDF) { add(ItemAction.TOOL_PDF); add(ItemAction.COMPRESS_PDF) }
        if (!item.isDirectory) add(ItemAction.VAULT)
        add(ItemAction.DETAILS)
        add(ItemAction.DELETE)
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Row(Modifier.padding(horizontal = 24.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            FileThumb(item, size = 48.dp)
            Spacer(Modifier.width(14.dp))
            Column {
                Text(item.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(item.subtitle(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(8.dp))
        actions.forEach { action ->
            val destructive = action == ItemAction.DELETE
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onAction(action) }
                    .padding(horizontal = 24.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    action.icon,
                    contentDescription = null,
                    tint = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(20.dp))
                Text(
                    action.label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        Spacer(Modifier.navigationBarsPadding().height(12.dp))
    }
}

/** Code and text files open in the built-in editor; everything else in other apps. */
fun opensInEditor(item: FileItem): Boolean =
    !item.isDirectory && item.size <= 8_000_000 && (item.kind == FileKind.CODE || item.kind == FileKind.TEXT)


/** Round tick shown on the left of a file while selecting. */
@Composable
fun SelectTick(selected: Boolean, modifier: Modifier = Modifier) {
    val primary = MaterialTheme.colorScheme.primary
    Box(
        modifier
            .size(24.dp)
            .clip(androidx.compose.foundation.shape.CircleShape)
            .background(if (selected) primary else Color.Transparent)
            .border(2.dp, if (selected) primary else MaterialTheme.colorScheme.outline, androidx.compose.foundation.shape.CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) Icon(Icons.Rounded.Check, contentDescription = "Selected", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
    }
}

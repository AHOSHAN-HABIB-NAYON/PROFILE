@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DriveFileMove
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.CallSplit
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Compress
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.FontDownload
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.InstallMobile
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.automirrored.rounded.CallMerge
import androidx.compose.material.icons.rounded.OpenInBrowser
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.designsystem.FileThumb
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileKind

/** How an action looks in the sheet: label, symbol and colour. */
private data class ActionLook(val label: String, val icon: ImageVector, val tint: Color)

private fun look(action: ItemAction, item: FileItem): ActionLook = when (action) {
    ItemAction.OPEN -> when {
        item.isDirectory -> ActionLook("Open", Icons.Rounded.FolderOpen, Palette.Blue)
        item.kind == FileKind.AUDIO || item.kind == FileKind.VIDEO -> ActionLook("Play", Icons.Rounded.PlayArrow, Palette.Blue)
        item.kind == FileKind.APK -> ActionLook("Install", Icons.Rounded.InstallMobile, Palette.Blue)
        item.kind == FileKind.IMAGE -> ActionLook("View", Icons.Rounded.Image, Palette.Blue)
        else -> ActionLook("Open", Icons.Rounded.OpenInBrowser, Palette.Blue)
    }
    ItemAction.EDIT -> ActionLook("Edit in Code Studio", Icons.Rounded.Code, Palette.Slate)
    ItemAction.RUN -> ActionLook("Run website", Icons.Rounded.Language, Palette.Orange)
    ItemAction.OPEN_WITH -> ActionLook("Open with another app", Icons.AutoMirrored.Rounded.OpenInNew, Palette.Green)
    ItemAction.SHARE -> ActionLook("Share", Icons.Rounded.Share, Palette.Green)
    ItemAction.COPY -> ActionLook("Copy", Icons.Rounded.ContentCopy, Palette.Blue)
    ItemAction.MOVE -> ActionLook("Cut", Icons.Rounded.ContentCut, Palette.Orange)
    ItemAction.RENAME -> ActionLook("Rename", Icons.Rounded.Edit, Palette.Purple)
    ItemAction.FAVORITE -> ActionLook("Add to favorites", Icons.Rounded.StarBorder, Palette.Orange)
    ItemAction.UNFAVORITE -> ActionLook("Remove from favorites", Icons.Rounded.Star, Palette.Orange)
    ItemAction.COPY_PATH -> ActionLook("Copy path", Icons.Rounded.Link, Palette.Slate)
    ItemAction.TOOL_APK -> ActionLook("App info & permissions", Icons.Rounded.Info, Palette.Green)
    ItemAction.TOOL_SQLITE -> ActionLook("Open in SQLite viewer", Icons.Rounded.Storage, Palette.Cyan)
    ItemAction.TOOL_ARCHIVE -> ActionLook("Open archive", Icons.Rounded.FolderZip, Palette.Cyan)
    ItemAction.TOOL_FONT -> ActionLook("Font preview", Icons.Rounded.FontDownload, Palette.Purple)
    ItemAction.TOOL_PDF -> ActionLook("Open in PDF viewer", Icons.Rounded.PictureAsPdf, Palette.Red)
    ItemAction.COMPRESS_PDF -> ActionLook("Compress PDF", Icons.Rounded.Compress, Palette.Red)
    ItemAction.TOOL_HEX -> ActionLook("HEX editor", Icons.Rounded.DataObject, Palette.Slate)
    ItemAction.ZIP -> ActionLook("Compress to ZIP", Icons.Rounded.FolderZip, Palette.Cyan)
    ItemAction.COPY_TO -> ActionLook("Copy to…", Icons.Rounded.ContentCopy, Palette.Blue)
    ItemAction.MOVE_TO -> ActionLook("Move to…", Icons.Rounded.DriveFileMove, Palette.Orange)
    ItemAction.SPLIT -> ActionLook("Split into parts", Icons.AutoMirrored.Rounded.CallSplit, Palette.Purple)
    ItemAction.MERGE_PARTS -> ActionLook("Join split parts", Icons.AutoMirrored.Rounded.CallMerge, Palette.Purple)
    ItemAction.SEARCH_TEXT -> ActionLook("Search text in this folder", Icons.Rounded.Search, Palette.Blue)
    ItemAction.VAULT -> ActionLook("Move to Secure Folder", Icons.Rounded.Lock, Palette.Slate)
    ItemAction.DETAILS -> ActionLook("Details", Icons.Rounded.Info, Palette.Slate)
    ItemAction.DELETE -> ActionLook("Delete", Icons.Rounded.Delete, Palette.Red)
    ItemAction.SHOW_IN_FOLDER -> ActionLook("Show in folder", Icons.Rounded.FolderOpen, Palette.Orange)
}

/**
 * Everything you can do with one file or folder: a header, four big quick actions that suit the
 * file type, then the rest in groups (tools for this type, organize, more).
 */
@Composable
fun ItemActionsSheet(
    item: FileItem,
    favorite: Boolean,
    onAction: (ItemAction) -> Unit,
    onDismiss: () -> Unit,
    /** When set, only these actions are offered (screens outside the file browser handle fewer). */
    allowed: Set<ItemAction>? = null,
) {
    fun ok(a: ItemAction) = allowed == null || a in allowed
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val local = item.id.startsWith("/")

    val quick = buildList {
        add(ItemAction.OPEN)
        if (item.isDirectory) add(ItemAction.ZIP.takeIf { local } ?: ItemAction.COPY) else add(ItemAction.SHARE)
        add(if (ok(ItemAction.RENAME)) ItemAction.RENAME else ItemAction.SHOW_IN_FOLDER)
        add(ItemAction.DELETE)
    }.filter(::ok)
    val tools = buildList {
        if (!item.isDirectory && item.size <= 8_000_000 && (item.kind == FileKind.CODE || item.kind == FileKind.TEXT || item.extension.isEmpty())) add(ItemAction.EDIT)
        if (local && (item.extension == "html" || item.extension == "htm" || (item.isDirectory && java.io.File(item.id, "index.html").isFile))) add(ItemAction.RUN)
        if (local) when (item.kind) {
            FileKind.APK -> add(ItemAction.TOOL_APK)
            FileKind.DATABASE -> add(ItemAction.TOOL_SQLITE)
            FileKind.ARCHIVE -> add(ItemAction.TOOL_ARCHIVE)
            FileKind.FONT -> add(ItemAction.TOOL_FONT)
            else -> Unit
        }
        if (item.kind == FileKind.PDF) { add(ItemAction.TOOL_PDF); add(ItemAction.COMPRESS_PDF) }
        if (local && !item.isDirectory && item.size > 10_000_000) add(ItemAction.SPLIT)
        if (local && item.extension.matches(Regex("\\d{3}"))) add(ItemAction.MERGE_PARTS)
        if (local && item.isDirectory) add(ItemAction.SEARCH_TEXT)
    }.filter(::ok)
    val organize = buildList {
        if (local) {
            add(ItemAction.COPY_TO)
            add(ItemAction.MOVE_TO)
            if (!item.isDirectory) add(ItemAction.ZIP)
        } else {
            add(ItemAction.COPY)
            add(ItemAction.MOVE)
        }
        if (!item.isDirectory) add(ItemAction.VAULT)
    }.filter(::ok)
    val more = buildList {
        if (!item.isDirectory) add(ItemAction.OPEN_WITH)
        add(ItemAction.COPY_PATH)
        if (local && !item.isDirectory) add(ItemAction.TOOL_HEX)
        add(ItemAction.DETAILS)
        if (allowed != null && ItemAction.SHOW_IN_FOLDER !in quick) add(ItemAction.SHOW_IN_FOLDER)
    }.filter(::ok)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).testTag("item_sheet")) {
            Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                FileThumb(item, size = 56.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(item.subtitle(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    if (local) {
                        Text(
                            item.id.substringBeforeLast('/').substringAfter("/0/").substringAfter("/0").replace("/", " › ").ifEmpty { "Internal storage" },
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (ok(ItemAction.FAVORITE)) Surface(
                    onClick = { onAction(if (favorite) ItemAction.UNFAVORITE else ItemAction.FAVORITE) },
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    modifier = Modifier.size(40.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (favorite) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                            if (favorite) "Remove from favorites" else "Add to favorites",
                            tint = if (favorite) Palette.Orange else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                quick.forEach { action ->
                    val l = look(action, item)
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).clickable { onAction(action) }.padding(vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.size(54.dp).clip(RoundedCornerShape(18.dp)).background(l.tint.copy(alpha = 0.13f)),
                            contentAlignment = Alignment.Center,
                        ) { Icon(l.icon, null, tint = l.tint, modifier = Modifier.size(25.dp)) }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (action == ItemAction.ZIP) "ZIP" else l.label, style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold, maxLines = 1,
                            color = if (action == ItemAction.DELETE) Palette.Red else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            Group("FOR THIS ${if (item.isDirectory) "FOLDER" else "FILE"}", tools, item, onAction)
            Group("ORGANIZE", organize, item, onAction)
            Group("MORE", more, item, onAction)
            Spacer(Modifier.navigationBarsPadding().height(16.dp))
        }
    }
}

@Composable
private fun Group(title: String, actions: List<ItemAction>, item: FileItem, onAction: (ItemAction) -> Unit) {
    if (actions.isEmpty()) return
    Text(
        title, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp, top = 16.dp, bottom = 6.dp),
    )
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column {
            actions.forEachIndexed { i, action ->
                val l = look(action, item)
                if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 56.dp).height(1.dp).background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)))
                Row(
                    Modifier.fillMaxWidth().clickable { onAction(action) }.padding(horizontal = 12.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(l.tint.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
                        Icon(l.icon, null, tint = l.tint, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(l.label, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}

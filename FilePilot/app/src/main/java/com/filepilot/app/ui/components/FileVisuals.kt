package com.filepilot.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import androidx.compose.ui.platform.LocalDensity
import com.filepilot.app.data.thumbs.Thumb
import coil3.request.ImageRequest
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.FileType
import com.filepilot.app.core.util.Format
import com.filepilot.app.ui.theme.style

/** Display name, optionally without its extension (Settings → Show file extensions). */
fun FileItem.displayName(showExtension: Boolean): String =
    if (showExtension || isDirectory) name else name.substringBeforeLast('.', name).ifEmpty { name }

fun FileItem.subtitle(): String {
    val date = Format.date(lastModified)
    return if (isDirectory) {
        if (childCount >= 0) "${Format.items(childCount)} · $date" else date
    } else {
        "${Format.size(size)} · $date"
    }
}

/** Colored type tile. */
@Composable
fun TypeTile(type: FileType, size: Dp = 42.dp, corner: Dp = 12.dp) {
    val style = type.style()
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(corner))
            .background(style.color.copy(alpha = 0.13f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(style.icon, contentDescription = null, tint = style.color, modifier = Modifier.size(size * 0.55f))
    }
}

/**
 * Thumbnail for images and videos. Uses small system thumbnails (not full decodes) and shows the
 * type tile underneath while loading, so scrolling large photo folders stays smooth.
 */
@Composable
fun FileThumb(item: FileItem, size: Dp = 42.dp, corner: Dp = 12.dp) {
    val type = item.type
    if (type == FileType.IMAGE || type == FileType.VIDEO) {
        val context = LocalContext.current
        val px = with(LocalDensity.current) { size.roundToPx() }
        val request = remember(item.id, item.lastModified, px) {
            ImageRequest.Builder(context)
                .data(Thumb(item.uri, item.path, type == FileType.VIDEO, px, item.lastModified))
                .size(px, px)
                .build()
        }
        Box(Modifier.size(size).clip(RoundedCornerShape(corner))) {
            TypeTile(type, size, corner)
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            if (type == FileType.VIDEO) {
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .size(size * 0.42f)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.45f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(size * 0.3f))
                }
            }
        }
    } else {
        TypeTile(type, size, corner)
    }
}

@Composable
private fun SelectionBadge(selected: Boolean, modifier: Modifier = Modifier) {
    val bg by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerLowest,
        label = "badge",
    )
    Box(
        modifier
            .size(22.dp)
            .clip(CircleShape)
            .background(bg)
            .border(1.5.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedVisibility(selected, enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
            Icon(Icons.Rounded.Check, null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(15.dp))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileRow(
    item: FileItem,
    showExtension: Boolean,
    selected: Boolean,
    selectionMode: Boolean,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onMore: (() -> Unit)?,
    modifier: Modifier = Modifier,
    supporting: String? = null,
) {
    val bg by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f) else Color.Transparent,
        animationSpec = tween(160),
        label = "rowBg",
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 1.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(bg)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .semantics(mergeDescendants = true) { this.selected = selected }
            .padding(start = 8.dp, end = 2.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            FileThumb(item)
            if (isFavorite) {
                Icon(
                    Icons.Rounded.Star, contentDescription = "Favorite",
                    tint = Color(0xFFF59E0B),
                    modifier = Modifier.align(Alignment.BottomEnd).size(14.dp)
                        .background(MaterialTheme.colorScheme.surface, CircleShape).padding(1.dp),
                )
            }
        }
        Column(Modifier.weight(1f).padding(start = 12.dp, end = 4.dp)) {
            Text(
                item.displayName(showExtension),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis,
            )
            Text(
                supporting ?: item.subtitle(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (selectionMode) {
            SelectionBadge(selected, Modifier.padding(horizontal = 12.dp))
        } else if (onMore != null) {
            IconButton(onClick = onMore) {
                Icon(Icons.Rounded.MoreVert, contentDescription = "More actions for ${item.name}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileGridCell(
    item: FileItem,
    showExtension: Boolean,
    selected: Boolean,
    selectionMode: Boolean,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scale by animateFloatAsState(if (selected) 0.94f else 1f, label = "cellScale")
    val border by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        label = "cellBorder",
    )
    Column(
        modifier = modifier
            .padding(4.dp)
            .scale(scale)
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceContainerLowest)
            .border(1.dp, border, MaterialTheme.shapes.medium)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .semantics(mergeDescendants = true) {
                this.selected = selected
                contentDescription = item.name
            }
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1.15f), contentAlignment = Alignment.Center) {
            val t = item.type
            if (t == FileType.IMAGE || t == FileType.VIDEO) {
                FileThumb(item, size = 96.dp, corner = 10.dp)
            } else {
                TypeTile(t, size = 56.dp, corner = 16.dp)
            }
            if (selectionMode) SelectionBadge(selected, Modifier.align(Alignment.TopEnd))
            if (isFavorite) {
                Icon(Icons.Rounded.Star, "Favorite", tint = Color(0xFFF59E0B), modifier = Modifier.align(Alignment.TopStart).size(16.dp))
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            item.displayName(showExtension),
            style = MaterialTheme.typography.labelLarge,
            maxLines = 2,
            minLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            if (item.isDirectory) (if (item.childCount >= 0) Format.items(item.childCount) else "Folder") else Format.size(item.size),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(),
            maxLines = 1,
        )
    }
}

@Composable
fun InfoPill(text: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun Gap(width: Dp = 0.dp, height: Dp = 0.dp) = Spacer(Modifier.width(width).height(height))

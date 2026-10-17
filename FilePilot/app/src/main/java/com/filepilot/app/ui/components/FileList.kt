package com.filepilot.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.ViewMode
import com.filepilot.app.ui.navigation.Selection

/**
 * Lazily rendered list or grid of files with long-press multi-selection.
 * Tap opens (or toggles while selecting); long-press starts selection.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileListContent(
    items: List<FileItem>,
    viewMode: ViewMode,
    selection: Selection,
    showExtensions: Boolean,
    favoriteIds: Set<String>,
    onOpen: (FileItem) -> Unit,
    onMore: (FileItem) -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    gridState: LazyGridState = rememberLazyGridState(),
    contentPadding: PaddingValues = PaddingValues(bottom = 96.dp),
    supporting: ((FileItem) -> String?)? = null,
    header: (@Composable () -> Unit)? = null,
) {
    val selecting = selection.active
    val click: (FileItem) -> Unit = { item -> if (selecting) selection.toggle(item) else onOpen(item) }
    if (viewMode == ViewMode.LIST) {
        LazyColumn(modifier.fillMaxSize(), state = listState, contentPadding = contentPadding) {
            if (header != null) item(key = "__header") { header() }
            items(items, key = { it.id }) { item ->
                FileRow(
                    item = item,
                    showExtension = showExtensions,
                    selected = item.id in selection.ids,
                    selectionMode = selecting,
                    isFavorite = item.id in favoriteIds,
                    onClick = { click(item) },
                    onLongClick = { selection.toggle(item) },
                    onMore = { onMore(item) },
                    supporting = supporting?.invoke(item),
                    modifier = Modifier.animateItem(),
                )
            }
        }
    } else {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(104.dp),
            modifier = modifier.fillMaxSize(),
            state = gridState,
            contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = contentPadding.calculateBottomPadding(), top = 4.dp),
        ) {
            if (header != null) item(key = "__header", span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) { header() }
            items(items, key = { it.id }) { item ->
                FileGridCell(
                    item = item,
                    showExtension = showExtensions,
                    selected = item.id in selection.ids,
                    selectionMode = selecting,
                    isFavorite = item.id in favoriteIds,
                    onClick = { click(item) },
                    onLongClick = { if (selecting) selection.toggle(item) else onMore(item) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

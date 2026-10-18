package com.webtecit.nayon.feature.tabs

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.ConfirmDialog
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.NayonLogo
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.feature.browser.BrowserViewModel
import com.webtecit.nayon.feature.browser.TabState

@Composable
fun TabsScreen(viewModel: BrowserViewModel, onBack: () -> Unit) {
    val tabs by viewModel.tabs.collectAsStateWithLifecycle()
    val activeId by viewModel.activeId.collectAsStateWithLifecycle()
    val activeIsPrivate = tabs.firstOrNull { it.id == activeId }?.isPrivate == true
    var showPrivate by rememberSaveable { mutableStateOf(activeIsPrivate) }
    var query by rememberSaveable { mutableStateOf("") }
    var confirmCloseAll by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val scheme = MaterialTheme.colorScheme
    val visible = tabs.filter { it.isPrivate == showPrivate }
        .filter { query.isBlank() || it.displayTitle.contains(query, true) || it.url.orEmpty().contains(query, true) }

    Column(Modifier.fillMaxSize().background(scheme.surfaceContainer).statusBarsPadding().navigationBarsPadding()) {
        // Top row: new tab · normal/private switch · menu
        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            FilledTonalIconButton(
                onClick = { viewModel.newTab(private = showPrivate); onBack() },
                shape = RoundedCornerShape(14.dp),
                colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = scheme.primary, contentColor = scheme.onPrimary),
                modifier = Modifier.size(48.dp),
            ) { Icon(Icons.Outlined.Add, stringResource(if (showPrivate) R.string.action_new_private_tab else R.string.action_new_tab)) }
            Spacer(Modifier.weight(1f))
            Row(Modifier.clip(CircleShape).background(scheme.surfaceContainerHighest).padding(4.dp)) {
                SegmentButton(selected = !showPrivate, label = stringResource(R.string.tabs_normal, tabs.count { !it.isPrivate }),
                    onClick = { showPrivate = false }) {
                    Box(Modifier.size(20.dp).border(2.dp, it, RoundedCornerShape(5.dp)), contentAlignment = Alignment.Center) {
                        Text(tabs.count { t -> !t.isPrivate }.coerceAtMost(99).toString(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = it)
                    }
                }
                SegmentButton(selected = showPrivate, label = stringResource(R.string.tabs_private, tabs.count { it.isPrivate }),
                    onClick = { showPrivate = true }) {
                    Icon(Icons.Outlined.VisibilityOff, null, tint = it, modifier = Modifier.size(20.dp))
                }
            }
            Spacer(Modifier.weight(1f))
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_new_tab)) }, onClick = { menu = false; viewModel.newTab(); onBack() })
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_new_private_tab)) },
                        onClick = { menu = false; viewModel.newTab(private = true); onBack() })
                    if (visible.isNotEmpty()) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.action_close_all)) }, onClick = { menu = false; confirmCloseAll = true })
                    }
                }
            }
        }

        // Search your tabs
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.xs).height(48.dp)
                .clip(CircleShape).background(scheme.surfaceContainerHighest).padding(horizontal = Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Search, null, tint = scheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Spacing.md))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                BasicTextField(
                    value = query, onValueChange = { query = it }, singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface),
                    cursorBrush = SolidColor(scheme.primary), modifier = Modifier.fillMaxWidth(),
                )
                if (query.isEmpty()) Text(stringResource(R.string.tabs_search), style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant)
            }
            if (query.isNotEmpty()) {
                IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, stringResource(R.string.action_clear), Modifier.size(18.dp)) }
            }
        }

        if (visible.isEmpty()) {
            MessageState(
                icon = if (showPrivate) Icons.Outlined.VisibilityOff else Icons.Outlined.Search,
                title = stringResource(if (showPrivate && query.isBlank()) R.string.tabs_empty_private_title else R.string.tabs_no_results),
                body = if (showPrivate && query.isBlank()) stringResource(R.string.tabs_empty_private_body) else "",
                modifier = Modifier.padding(top = Spacing.xxl),
            )
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(150.dp),
                contentPadding = PaddingValues(Spacing.lg),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
                modifier = Modifier.weight(1f),
            ) {
                items(visible, key = { it.id }) { tab ->
                    TabCard(
                        tab = tab,
                        selected = tab.id == activeId,
                        onClick = { viewModel.selectTab(tab.id); onBack() },
                        onClose = { viewModel.closeTab(tab.id) },
                        modifier = Modifier.animateItem(),
                    )
                }
                item(span = { GridItemSpan(maxLineSpan) }) { Spacer(Modifier.height(Spacing.xl)) }
            }
        }
    }

    if (confirmCloseAll) {
        ConfirmDialog(
            title = stringResource(R.string.tabs_close_all_title),
            body = stringResource(R.string.tabs_close_all_body),
            confirmLabel = stringResource(R.string.action_close_all),
            dismissLabel = stringResource(R.string.action_cancel),
            destructive = true,
            onConfirm = { confirmCloseAll = false; viewModel.closeAll(showPrivate); if (!showPrivate) onBack() },
            onDismiss = { confirmCloseAll = false },
        )
    }
}

@Composable
private fun SegmentButton(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
    icon: @Composable (androidx.compose.ui.graphics.Color) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val bg by animateColorAsState(if (selected) scheme.surface else scheme.surfaceContainerHighest, label = "seg")
    Box(
        Modifier.size(width = 60.dp, height = 40.dp).clip(CircleShape).background(bg)
            .clickable(role = Role.Tab, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { icon(if (selected) scheme.onSurface else scheme.onSurfaceVariant) }
}

/** Chrome-style tab card: coloured header with icon, title and close; page preview below. */
@Composable
private fun TabCard(tab: TabState, selected: Boolean, onClick: () -> Unit, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val frame by animateColorAsState(if (selected) scheme.primary else scheme.surfaceContainerHighest, label = "frame")
    val onFrame = if (selected) scheme.onPrimary else scheme.onSurface
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = frame,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column {
            Row(Modifier.fillMaxWidth().height(44.dp).padding(start = Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 20.dp)
                Spacer(Modifier.width(Spacing.sm))
                Text(
                    if (tab.showingHome && tab.url == null) stringResource(R.string.tabs_new_page) else tab.displayTitle,
                    style = MaterialTheme.typography.labelLarge, color = onFrame,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onClose, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.Close, stringResource(R.string.action_close_tab), tint = onFrame, modifier = Modifier.size(18.dp))
                }
            }
            Box(
                Modifier.fillMaxWidth().aspectRatio(1f).padding(start = 5.dp, end = 5.dp, bottom = 5.dp)
                    .clip(RoundedCornerShape(16.dp)).background(scheme.surfaceContainerLowest),
                contentAlignment = Alignment.Center,
            ) {
                val thumb = tab.thumbnail
                when {
                    thumb != null && !tab.showingHome -> Image(
                        remember(thumb) { thumb.asImageBitmap() }, contentDescription = null,
                        contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize(),
                    )
                    tab.showingHome || tab.url == null -> NayonLogo(size = 48.dp)
                    else -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 44.dp)
                        Text(UrlResolver.displayHost(tab.url), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

package com.webtecit.nayon.feature.tabs

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Tab
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TabsScreen(viewModel: BrowserViewModel, onBack: () -> Unit) {
    val tabs by viewModel.tabs.collectAsStateWithLifecycle()
    val activeId by viewModel.activeId.collectAsStateWithLifecycle()
    val activeIsPrivate = tabs.firstOrNull { it.id == activeId }?.isPrivate == true
    var showPrivate by rememberSaveable { mutableStateOf(activeIsPrivate) }
    var confirmCloseAll by remember { mutableStateOf(false) }
    val visible = tabs.filter { it.isPrivate == showPrivate }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tabs_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack,
                            stringResource(R.string.action_back))
                    }
                },
                actions = {
                    if (visible.isNotEmpty()) {
                        TextButton(onClick = { confirmCloseAll = true }) { Text(stringResource(R.string.action_close_all)) }
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { viewModel.newTab(private = showPrivate); onBack() },
                icon = { Icon(if (showPrivate) Icons.Outlined.VisibilityOff else Icons.Outlined.Add, null) },
                text = { Text(stringResource(if (showPrivate) R.string.action_new_private_tab else R.string.action_new_tab)) },
            )
        },
    ) { inner ->
        Column(Modifier.fillMaxSize().padding(inner)) {
            Row(Modifier.padding(horizontal = Spacing.gutter, vertical = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                FilterChip(
                    selected = !showPrivate,
                    onClick = { showPrivate = false },
                    label = { Text(stringResource(R.string.tabs_normal, tabs.count { !it.isPrivate })) },
                    leadingIcon = { Icon(Icons.Outlined.Tab, null, Modifier.size(18.dp)) },
                )
                FilterChip(
                    selected = showPrivate,
                    onClick = { showPrivate = true },
                    label = { Text(stringResource(R.string.tabs_private, tabs.count { it.isPrivate })) },
                    leadingIcon = { Icon(Icons.Outlined.VisibilityOff, null, Modifier.size(18.dp)) },
                )
            }
            if (visible.isEmpty()) {
                MessageState(
                    icon = Icons.Outlined.VisibilityOff,
                    title = stringResource(R.string.tabs_empty_private_title),
                    body = stringResource(R.string.tabs_empty_private_body),
                    modifier = Modifier.padding(top = Spacing.xxl),
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(160.dp),
                    contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, top = Spacing.sm, bottom = 96.dp),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md),
                ) {
                    items(visible, key = { it.id }) { tab ->
                        TabCard(
                            modifier = Modifier.animateItem(),
                            tab = tab,
                            selected = tab.id == activeId,
                            onClick = { viewModel.selectTab(tab.id); onBack() },
                            onClose = { viewModel.closeTab(tab.id) },
                        )
                    }
                }
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
private fun TabCard(tab: TabState, selected: Boolean, onClick: () -> Unit, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Card(
        onClick = onClick,
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerHigh),
        modifier = modifier.border(
            width = if (selected) 2.dp else 0.dp,
            color = if (selected) scheme.primary else scheme.surfaceContainerHigh,
            shape = MaterialTheme.shapes.large,
        ),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 20.dp)
            Spacer(Modifier.width(Spacing.sm))
            Text(
                if (tab.showingHome && tab.url == null) stringResource(R.string.tabs_new_page) else tab.displayTitle,
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, stringResource(R.string.action_close_tab), modifier = Modifier.size(18.dp))
            }
        }
        Box(
            Modifier.fillMaxWidth().aspectRatio(0.8f).padding(start = Spacing.xs, end = Spacing.xs, bottom = Spacing.xs)
                .clip(MaterialTheme.shapes.medium).background(scheme.surfaceContainerLowest),
            contentAlignment = Alignment.Center,
        ) {
            val thumb = tab.thumbnail
            when {
                thumb != null && !tab.showingHome -> Image(
                    remember(thumb) { thumb.asImageBitmap() }, contentDescription = null,
                    contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize(),
                )
                tab.showingHome || tab.url == null -> NayonLogo(size = 56.dp)
                else -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 48.dp)
                    Text(UrlResolver.displayHost(tab.url), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
            }
        }
    }
}

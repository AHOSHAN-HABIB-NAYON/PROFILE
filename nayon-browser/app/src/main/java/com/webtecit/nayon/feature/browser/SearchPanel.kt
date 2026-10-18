package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NorthWest
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing

/**
 * Shown while typing in the address bar, like Chrome: the current page (share / copy / edit),
 * most-visited sites and recent searches when empty; matching bookmarks and history while typing.
 * Everything comes from this device — nothing is sent to a server while typing.
 */
@Composable
fun SearchPanel(
    viewModel: BrowserViewModel,
    tab: TabState?,
    query: String,
    onSearch: (String) -> Unit,
    onOpen: (String) -> Unit,
    onFill: (String) -> Unit,
    onShare: () -> Unit,
    onCopy: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val topSites by viewModel.topSites.collectAsStateWithLifecycle()
    val searches by viewModel.recentSearches.collectAsStateWithLifecycle()
    val suggestionsFlow = remember(query) { viewModel.suggestionsFor(query) }
    val suggestions by suggestionsFlow.collectAsState(initial = emptyList())
    val remoteFlow = remember(query) { viewModel.searchSuggestionsFor(query) }
    val remote by remoteFlow.collectAsState(initial = emptyList())
    val typing = query.isNotBlank() && query != tab?.url

    LazyColumn(
        Modifier.fillMaxSize().background(scheme.surface),
        contentPadding = PaddingValues(bottom = Spacing.xl),
    ) {
        if (typing) {
            item {
                PanelRow(
                    leading = { Icon(Icons.Outlined.Search, null, tint = scheme.primary) },
                    title = stringResource(R.string.search_for, query.trim()),
                    onClick = { onSearch(query) },
                    trailing = { FillButton { onFill(query.trim()) } },
                )
            }
            items(remote.filter { !it.equals(query.trim(), ignoreCase = true) }, key = { "q:$it" }) { q ->
                PanelRow(
                    leading = { Icon(Icons.Outlined.Search, null, tint = scheme.onSurfaceVariant) },
                    title = q,
                    onClick = { onSearch(q) },
                    trailing = { FillButton { onFill(q) } },
                )
            }
            items(suggestions, key = { it.url }) { s ->
                PanelRow(
                    leading = {
                        if (s.isBookmark) Icon(Icons.Outlined.StarBorder, null, tint = scheme.onSurfaceVariant)
                        else SiteIcon(s.url, s.title, size = 28.dp)
                    },
                    title = s.title.ifBlank { UrlResolver.displayHost(s.url) },
                    subtitle = s.url,
                    onClick = { onOpen(s.url) },
                    trailing = { FillButton { onFill(s.url) } },
                )
            }
            return@LazyColumn
        }

        // Current page card
        if (tab?.isWebPage == true && tab.url != null) {
            item {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = scheme.surfaceContainerLow,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm),
                ) {
                    Row(Modifier.padding(start = Spacing.lg, end = Spacing.xs, top = Spacing.md, bottom = Spacing.md),
                        verticalAlignment = Alignment.CenterVertically) {
                        SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 36.dp)
                        Spacer(Modifier.width(Spacing.md))
                        Column(Modifier.weight(1f)) {
                            Text(tab.displayTitle, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(tab.url, style = MaterialTheme.typography.bodySmall, color = scheme.primary, maxLines = 1,
                                overflow = TextOverflow.Ellipsis)
                        }
                        IconButton(onClick = onShare) { Icon(Icons.Outlined.Share, stringResource(R.string.action_share)) }
                        IconButton(onClick = onCopy) { Icon(Icons.Outlined.ContentCopy, stringResource(R.string.action_copy_link)) }
                        IconButton(onClick = { onFill(tab.url) }) { Icon(Icons.Outlined.Edit, stringResource(R.string.action_edit)) }
                    }
                }
            }
        }

        // Most visited
        if (topSites.isNotEmpty()) {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.md),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    modifier = Modifier.padding(vertical = Spacing.sm),
                ) {
                    items(topSites, key = { it.url }) { site ->
                        Column(
                            Modifier.width(76.dp).clip(MaterialTheme.shapes.medium)
                                .clickable(role = Role.Button) { onOpen(site.url) }
                                .padding(vertical = Spacing.sm),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                        ) {
                            Box(Modifier.size(52.dp).clip(androidx.compose.foundation.shape.CircleShape).background(scheme.surfaceContainerHigh),
                                contentAlignment = Alignment.Center) {
                                SiteIcon(site.url, site.title, size = 52.dp)
                            }
                            Text(
                                site.title.ifBlank { UrlResolver.displayHost(site.url) },
                                style = MaterialTheme.typography.labelMedium,
                                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }

        // Recent searches
        if (searches.isNotEmpty()) {
            item {
                Text(
                    stringResource(R.string.search_recent),
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.xl, top = Spacing.md, bottom = Spacing.sm),
                )
            }
            item {
                Surface(shape = MaterialTheme.shapes.extraLarge, color = scheme.surfaceContainerLow,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md)) {
                    Column {
                        searches.forEachIndexed { i, q ->
                            if (i > 0) HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.4f))
                            PanelRow(
                                leading = { Icon(Icons.Outlined.History, null, tint = scheme.onSurfaceVariant) },
                                title = q,
                                onClick = { onSearch(q) },
                                trailing = { FillButton { onFill(q) } },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FillButton(onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(
            Icons.Outlined.NorthWest,
            contentDescription = stringResource(R.string.action_edit),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp).then(Modifier.padding(0.dp)),
        )
    }
}

@Composable
private fun PanelRow(
    leading: @Composable () -> Unit,
    title: String,
    onClick: () -> Unit,
    subtitle: String? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick)
            .padding(start = Spacing.lg, end = Spacing.xs, top = Spacing.xs, bottom = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) { leading() }
        Spacer(Modifier.width(Spacing.lg))
        Column(Modifier.weight(1f).padding(vertical = Spacing.sm)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing?.invoke()
    }
}

package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Bookmarks
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DesktopWindows
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FileCopy
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.component.SettingsSwitchRow
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing

enum class MenuAction {
    NEW_TAB, NEW_PRIVATE_TAB, BOOKMARKS, HISTORY, DOWNLOADS, SETTINGS,
    TOGGLE_BOOKMARK, SHARE, COPY_LINK, DESKTOP, DUPLICATE, FORWARD, RELOAD, SITE_INFO,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserMenuSheet(
    tab: TabState?,
    isBookmarked: Boolean,
    onDismiss: () -> Unit,
    onAction: (MenuAction) -> Unit,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val onPage = tab?.isWebPage == true
    fun act(a: MenuAction) { onDismiss(); onAction(a) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = Spacing.md)) {
            if (onPage && tab != null) {
                Row(Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 40.dp)
                    Spacer(Modifier.width(Spacing.md))
                    Column(Modifier.weight(1f)) {
                        Text(tab.displayTitle, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(UrlResolver.displayHost(tab.url), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    QuickAction(Icons.AutoMirrored.Outlined.ArrowForward, stringResource(R.string.action_forward),
                        enabled = tab.canGoForward) { act(MenuAction.FORWARD) }
                    QuickAction(
                        if (isBookmarked) Icons.Filled.Star else Icons.Outlined.StarBorder,
                        stringResource(if (isBookmarked) R.string.action_remove_bookmark else R.string.action_bookmark),
                        highlighted = isBookmarked,
                    ) { act(MenuAction.TOGGLE_BOOKMARK) }
                    QuickAction(Icons.Outlined.Info, stringResource(R.string.action_site_info)) { act(MenuAction.SITE_INFO) }
                    QuickAction(Icons.Outlined.Share, stringResource(R.string.action_share)) { act(MenuAction.SHARE) }
                    QuickAction(Icons.Outlined.Refresh, stringResource(R.string.action_reload)) { act(MenuAction.RELOAD) }
                }
                HorizontalDivider(Modifier.padding(horizontal = Spacing.lg), color = MaterialTheme.colorScheme.outlineVariant)
            }
            SettingsRow(stringResource(R.string.action_new_tab), { act(MenuAction.NEW_TAB) }, icon = Icons.Outlined.Add, showChevron = false)
            SettingsRow(stringResource(R.string.action_new_private_tab), { act(MenuAction.NEW_PRIVATE_TAB) }, icon = Icons.Outlined.VisibilityOff, showChevron = false)
            SettingsRow(stringResource(R.string.action_bookmarks), { act(MenuAction.BOOKMARKS) }, icon = Icons.Outlined.Bookmarks, showChevron = false)
            SettingsRow(stringResource(R.string.action_history), { act(MenuAction.HISTORY) }, icon = Icons.Outlined.History, showChevron = false)
            SettingsRow(stringResource(R.string.action_downloads), { act(MenuAction.DOWNLOADS) }, icon = Icons.Outlined.Download, showChevron = false)
            if (onPage) {
                SettingsRow(stringResource(R.string.action_copy_link), { act(MenuAction.COPY_LINK) }, icon = Icons.Outlined.ContentCopy, showChevron = false)
                SettingsRow(stringResource(R.string.action_duplicate), { act(MenuAction.DUPLICATE) }, icon = Icons.Outlined.FileCopy, showChevron = false)
            }
            if (onPage && tab != null) {
                SettingsSwitchRow(
                    title = stringResource(R.string.action_desktop_site),
                    checked = tab.desktopMode,
                    onCheckedChange = { act(MenuAction.DESKTOP) },
                    icon = Icons.Outlined.DesktopWindows,
                )
            }
            SettingsRow(stringResource(R.string.action_settings), { act(MenuAction.SETTINGS) }, icon = Icons.Outlined.Settings, showChevron = false)
        }
    }
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, highlighted: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.xs),
        modifier = Modifier.width(64.dp)) {
        FilledTonalIconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.size(48.dp),
            shape = CircleShape,
            colors = if (highlighted) {
                IconButtonDefaults.filledTonalIconButtonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            } else {
                IconButtonDefaults.filledTonalIconButtonColors()
            },
        ) { Icon(icon, contentDescription = label) }
        Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}


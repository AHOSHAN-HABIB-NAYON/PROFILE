package com.webtecit.nayon.feature.browser

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.AddToHomeScreen
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Bookmarks
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DesktopWindows
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FileCopy
import androidx.compose.material.icons.outlined.FindInPage
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.theme.Spacing

enum class MenuAction {
    NEW_TAB, NEW_PRIVATE_TAB, BOOKMARKS, HISTORY, DOWNLOADS, SETTINGS,
    TOGGLE_BOOKMARK, SHARE, COPY_LINK, DESKTOP, DUPLICATE, FORWARD, RELOAD, SITE_INFO, FIND, TRANSLATE, ADD_TO_HOME,
}

/**
 * Chrome-style ⋮ menu: a light popup from the corner, drawn in the same window as the page
 * (no new dialog window), so it opens instantly and the page behind stays smooth.
 */
@Composable
fun BrowserMenu(
    visible: Boolean,
    tab: TabState?,
    isBookmarked: Boolean,
    atBottom: Boolean,
    onDismiss: () -> Unit,
    onAction: (MenuAction) -> Unit,
) {
    BackHandler(enabled = visible, onBack = onDismiss)
    val scrim by animateFloatAsState(if (visible) 0.28f else 0f, tween(150), label = "menu-scrim")
    if (scrim > 0f) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = scrim)).pointerInput(Unit) { detectTapGestures { onDismiss() } })
    }
    val origin = TransformOrigin(1f, if (atBottom) 1f else 0f)
    BoxWithConstraints(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()
            .padding(top = 6.dp, end = 6.dp, bottom = if (atBottom) 60.dp else 6.dp),
        contentAlignment = if (atBottom) Alignment.BottomEnd else Alignment.TopEnd,
    ) {
        val maxMenuHeight = maxHeight
        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(tween(110)) + scaleIn(tween(170), initialScale = 0.8f, transformOrigin = origin),
            exit = fadeOut(tween(90)) + scaleOut(tween(110), targetScale = 0.9f, transformOrigin = origin),
        ) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surfaceContainer,
                shadowElevation = 10.dp,
                modifier = Modifier.width(284.dp).heightIn(max = maxMenuHeight),
            ) {
                MenuContent(tab, isBookmarked) { action -> onDismiss(); onAction(action) }
            }
        }
    }
}

@Composable
private fun MenuContent(tab: TabState?, isBookmarked: Boolean, act: (MenuAction) -> Unit) {
    val onPage = tab?.isWebPage == true
    Column(Modifier.verticalScroll(rememberScrollState()).padding(vertical = Spacing.xs)) {
        if (onPage && tab != null) {
            Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.xs), horizontalArrangement = Arrangement.SpaceEvenly) {
                QuickIcon(Icons.AutoMirrored.Outlined.ArrowForward, stringResource(R.string.action_forward), enabled = tab.canGoForward) {
                    act(MenuAction.FORWARD)
                }
                QuickIcon(
                    if (isBookmarked) Icons.Filled.Star else Icons.Outlined.StarBorder,
                    stringResource(if (isBookmarked) R.string.action_remove_bookmark else R.string.action_bookmark),
                    tint = if (isBookmarked) MaterialTheme.colorScheme.primary else null,
                ) { act(MenuAction.TOGGLE_BOOKMARK) }
                QuickIcon(Icons.Outlined.Info, stringResource(R.string.action_site_info)) { act(MenuAction.SITE_INFO) }
                QuickIcon(Icons.Outlined.Share, stringResource(R.string.action_share)) { act(MenuAction.SHARE) }
                QuickIcon(Icons.Outlined.Refresh, stringResource(R.string.action_reload)) { act(MenuAction.RELOAD) }
            }
            HorizontalDivider(Modifier.padding(vertical = Spacing.xs), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
        }
        MenuRow(Icons.Outlined.Add, stringResource(R.string.action_new_tab)) { act(MenuAction.NEW_TAB) }
        MenuRow(Icons.Outlined.VisibilityOff, stringResource(R.string.action_new_private_tab)) { act(MenuAction.NEW_PRIVATE_TAB) }
        HorizontalDivider(Modifier.padding(vertical = Spacing.xs), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
        MenuRow(Icons.Outlined.History, stringResource(R.string.action_history)) { act(MenuAction.HISTORY) }
        MenuRow(Icons.Outlined.Download, stringResource(R.string.action_downloads)) { act(MenuAction.DOWNLOADS) }
        MenuRow(Icons.Outlined.Bookmarks, stringResource(R.string.action_bookmarks)) { act(MenuAction.BOOKMARKS) }
        if (onPage && tab != null) {
            HorizontalDivider(Modifier.padding(vertical = Spacing.xs), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
            MenuRow(Icons.Outlined.FindInPage, stringResource(R.string.action_find)) { act(MenuAction.FIND) }
            MenuRow(Icons.Outlined.Translate, stringResource(R.string.action_translate)) { act(MenuAction.TRANSLATE) }
            MenuRow(Icons.AutoMirrored.Outlined.AddToHomeScreen, stringResource(R.string.action_add_to_home)) { act(MenuAction.ADD_TO_HOME) }
            MenuRow(Icons.Outlined.ContentCopy, stringResource(R.string.action_copy_link)) { act(MenuAction.COPY_LINK) }
            MenuRow(Icons.Outlined.FileCopy, stringResource(R.string.action_duplicate)) { act(MenuAction.DUPLICATE) }
            Row(
                Modifier.fillMaxWidth().height(48.dp).clickable(role = Role.Checkbox) { act(MenuAction.DESKTOP) }
                    .padding(start = Spacing.lg, end = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.DesktopWindows, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(Spacing.lg))
                Text(stringResource(R.string.action_desktop_site), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Checkbox(checked = tab.desktopMode, onCheckedChange = { act(MenuAction.DESKTOP) })
            }
        }
        HorizontalDivider(Modifier.padding(vertical = Spacing.xs), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
        MenuRow(Icons.Outlined.Settings, stringResource(R.string.action_settings)) { act(MenuAction.SETTINGS) }
        Text(
            "NAYON Browser ${com.webtecit.nayon.BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.sm),
        )
    }
}

@Composable
private fun MenuRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(48.dp).clickable(role = Role.Button, onClick = onClick).padding(horizontal = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(Spacing.lg))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun QuickIcon(icon: ImageVector, label: String, enabled: Boolean = true, tint: Color? = null, onClick: () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled) {
        Icon(icon, contentDescription = label, tint = tint ?: androidx.compose.material3.LocalContentColor.current)
    }
}

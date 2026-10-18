package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R

/** Optional bottom bar (Settings → Toolbar layout → Top and bottom). Hides while scrolling. */
@Composable
fun BrowserToolbar(
    tab: TabState?,
    tabCount: Int,
    onBack: () -> Unit,
    onForward: () -> Unit,
    onHome: () -> Unit,
    onTabs: () -> Unit,
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val canBack = tab != null && (tab.canGoBack && !tab.showingHome || tab.showingHome && tab.url != null)
    val canForward = tab != null && (tab.canGoForward || tab.showingHome && tab.url != null)
    val colors = IconButtonDefaults.iconButtonColors(
        contentColor = scheme.onSurface,
        disabledContentColor = scheme.onSurface.copy(alpha = 0.3f),
    )
    Surface(color = if (tab?.isPrivate == true) scheme.surfaceContainerHigh else scheme.surfaceContainerLow, modifier = modifier) {
        Row(
            Modifier.fillMaxWidth().height(52.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack, enabled = canBack, colors = colors) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
            }
            IconButton(onClick = onForward, enabled = canForward, colors = colors) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, stringResource(R.string.action_forward))
            }
            IconButton(onClick = onHome, colors = colors) { Icon(Icons.Outlined.Home, stringResource(R.string.action_home)) }
            TabsCountButton(tabCount, onTabs)
            IconButton(onClick = onMenu, colors = colors) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu)) }
        }
    }
}

package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import com.webtecit.nayon.R

/** Bottom browser controls, within thumb reach. */
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
    Surface(color = if (tab?.isPrivate == true) scheme.surfaceContainerHigh else scheme.surfaceContainer, modifier = modifier) {
        Column {
            HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.5f))
            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().height(56.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, enabled = canBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                }
                IconButton(onClick = onForward, enabled = canForward) {
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, stringResource(R.string.action_forward))
                }
                IconButton(onClick = onHome) {
                    Icon(Icons.Outlined.Home, stringResource(R.string.action_home))
                }
                val tabsLabel = stringResource(R.string.action_tabs, tabCount)
                IconButton(onClick = onTabs, modifier = Modifier.semantics { contentDescription = tabsLabel }) {
                    Box(
                        Modifier.size(24.dp).border(2.dp, scheme.onSurface, RoundedCornerShape(6.dp)).clearAndSetSemantics { },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (tabCount > 99) "99+" else tabCount.toString(),
                            fontSize = if (tabCount > 99) 8.sp else if (tabCount > 9) 10.sp else 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = scheme.onSurface,
                        )
                    }
                }
                IconButton(onClick = onMenu) {
                    Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu))
                }
            }
        }
    }
}

package com.webtecit.nayon.feature.settings

import android.text.format.Formatter
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.outlined.Cookie
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Tab
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.CheckboxRow
import com.webtecit.nayon.core.designsystem.component.ConfirmDialog
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.feature.browser.BrowserViewModel

private enum class TimeRange(val label: Int, val millis: Long) {
    HOUR(R.string.range_hour, 60L * 60 * 1000),
    DAY(R.string.range_day, 24L * 60 * 60 * 1000),
    WEEK(R.string.range_week, 7L * 24 * 60 * 60 * 1000),
    MONTH(R.string.range_month, 28L * 24 * 60 * 60 * 1000),
    ALL(R.string.range_all, 0L),
}

@Composable
fun ClearDataScreen(browser: BrowserViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    var range by rememberSaveable { mutableStateOf(TimeRange.DAY) }
    var history by rememberSaveable { mutableStateOf(true) }
    var cookies by rememberSaveable { mutableStateOf(false) }
    var cache by rememberSaveable { mutableStateOf(true) }
    var closeTabs by rememberSaveable { mutableStateOf(false) }
    var confirm by rememberSaveable { mutableStateOf(false) }
    var rangeMenu by remember { mutableStateOf(false) }
    val since = remember(range) { if (range.millis == 0L) 0L else System.currentTimeMillis() - range.millis }
    val historyCount by remember(since) { browser.historyCountSince(since) }.collectAsState(initial = 0)
    val cacheSize by produceState(0L) { value = browser.cacheSizeBytes() }
    val tabCount = browser.tabs.collectAsStateWithLifecycle().value.count { !it.isPrivate }

    ScreenScaffold(title = stringResource(R.string.clear_data_title), onBack = onBack) {
        item {
            Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.range_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Box {
                    TextButton(onClick = { rangeMenu = true }) {
                        Text(stringResource(range.label), style = MaterialTheme.typography.titleMedium)
                        Icon(Icons.Filled.ArrowDropDown, null)
                    }
                    DropdownMenu(expanded = rangeMenu, onDismissRequest = { rangeMenu = false }) {
                        TimeRange.entries.forEach { r ->
                            DropdownMenuItem(text = { Text(stringResource(r.label)) }, onClick = { range = r; rangeMenu = false })
                        }
                    }
                }
            }
        }
        item {
            SettingsGroup {
                CheckboxRow(stringResource(R.string.clear_data_history), history, { history = it }, icon = Icons.Outlined.History,
                    subtitle = context.resources.getQuantityString(R.plurals.clear_data_history_count, historyCount, historyCount))
                GroupDivider()
                CheckboxRow(stringResource(R.string.clear_data_cookies), cookies, { cookies = it }, icon = Icons.Outlined.Cookie,
                    subtitle = stringResource(R.string.clear_data_cookies_desc_all))
                GroupDivider()
                CheckboxRow(stringResource(R.string.clear_data_cache), cache, { cache = it }, icon = Icons.Outlined.Image,
                    subtitle = stringResource(R.string.clear_data_cache_size, Formatter.formatShortFileSize(context, cacheSize)))
                GroupDivider()
                CheckboxRow(stringResource(R.string.clear_data_tabs), closeTabs, { closeTabs = it }, icon = Icons.Outlined.Tab,
                    subtitle = context.resources.getQuantityString(R.plurals.clear_data_tabs_count, tabCount, tabCount))
            }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(top = Spacing.md), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = { confirm = true },
                    enabled = history || cookies || cache || closeTabs,
                    modifier = Modifier.heightIn(min = Layout.minTouchTarget),
                ) { Text(stringResource(R.string.clear_data_action)) }
            }
        }
        item { Spacer(Modifier.padding(Spacing.sm)) }
    }

    if (confirm) {
        ConfirmDialog(
            title = stringResource(R.string.clear_data_confirm_title),
            body = stringResource(R.string.clear_data_confirm_body),
            confirmLabel = stringResource(R.string.clear_data_action),
            dismissLabel = stringResource(R.string.action_cancel),
            destructive = true,
            onConfirm = { confirm = false; browser.clearBrowsingData(since, history, cookies, cache, closeTabs); onBack() },
            onDismiss = { confirm = false },
        )
    }
}

package com.webtecit.nayon.feature.settings

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cookie
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.CheckboxRow
import com.webtecit.nayon.core.designsystem.component.ConfirmDialog
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.feature.browser.BrowserViewModel

@Composable
fun ClearDataScreen(browser: BrowserViewModel, onBack: () -> Unit) {
    var history by rememberSaveable { mutableStateOf(true) }
    var cookies by rememberSaveable { mutableStateOf(false) }
    var cache by rememberSaveable { mutableStateOf(true) }
    var confirm by rememberSaveable { mutableStateOf(false) }

    ScreenScaffold(title = stringResource(R.string.clear_data_title), onBack = onBack) {
        item {
            SettingsGroup {
                CheckboxRow(stringResource(R.string.clear_data_history), history, { history = it }, icon = Icons.Outlined.History,
                    subtitle = stringResource(R.string.clear_data_history_desc))
                GroupDivider()
                CheckboxRow(stringResource(R.string.clear_data_cookies), cookies, { cookies = it }, icon = Icons.Outlined.Cookie,
                    subtitle = stringResource(R.string.clear_data_cookies_desc))
                GroupDivider()
                CheckboxRow(stringResource(R.string.clear_data_cache), cache, { cache = it }, icon = Icons.Outlined.Image,
                    subtitle = stringResource(R.string.clear_data_cache_desc))
            }
        }
        item {
            Button(
                onClick = { confirm = true },
                enabled = history || cookies || cache,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm).heightIn(min = Layout.minTouchTarget),
            ) { Text(stringResource(R.string.clear_data_action)) }
        }
    }

    if (confirm) {
        ConfirmDialog(
            title = stringResource(R.string.clear_data_confirm_title),
            body = stringResource(R.string.clear_data_confirm_body),
            confirmLabel = stringResource(R.string.clear_data_action),
            dismissLabel = stringResource(R.string.action_cancel),
            destructive = true,
            onConfirm = { confirm = false; browser.clearBrowsingData(history, cookies, cache); onBack() },
            onDismiss = { confirm = false },
        )
    }
}

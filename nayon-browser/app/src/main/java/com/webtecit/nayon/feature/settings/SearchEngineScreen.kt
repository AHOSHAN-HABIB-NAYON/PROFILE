package com.webtecit.nayon.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.SearchEngine
import com.webtecit.nayon.core.browser.SearchTemplates
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.RadioRow
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.feature.browser.BrowserViewModel

@Composable
fun SearchEngineScreen(browser: BrowserViewModel, onBack: () -> Unit) {
    val prefs by browser.preferences.collectAsStateWithLifecycle()
    var editingCustom by rememberSaveable { mutableStateOf(false) }

    ScreenScaffold(title = stringResource(R.string.search_engine_title), onBack = onBack) {
        item {
            SettingsGroup(Modifier.selectableGroup()) {
                SearchEngine.entries.filter { it != SearchEngine.CUSTOM }.forEachIndexed { i, engine ->
                    if (i > 0) GroupDivider()
                    RadioRow(
                        title = engine.displayName,
                        subtitle = UrlResolver.displayHost(engine.homeUrl),
                        selected = prefs.searchEngine == engine,
                        onSelect = { browser.setSearchEngine(engine) },
                    )
                }
                GroupDivider()
                RadioRow(
                    title = stringResource(R.string.search_engine_custom_title),
                    subtitle = prefs.customSearchTemplate.ifBlank { stringResource(R.string.search_engine_custom_desc) },
                    selected = prefs.searchEngine == SearchEngine.CUSTOM,
                    onSelect = { editingCustom = true },
                )
            }
        }
    }

    if (editingCustom) {
        CustomSearchDialog(
            initial = prefs.customSearchTemplate,
            onDismiss = { editingCustom = false },
            onSave = { browser.setCustomSearch(it); editingCustom = false },
        )
    }
}

@Composable
private fun CustomSearchDialog(initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf(initial.ifBlank { "https://" }) }
    var showError by rememberSaveable { mutableStateOf(false) }
    val validation = SearchTemplates.validate(text)
    val error = when (validation) {
        SearchTemplates.Validation.OK -> null
        SearchTemplates.Validation.EMPTY -> R.string.search_engine_error_empty
        SearchTemplates.Validation.NOT_HTTPS -> R.string.search_engine_error_https
        SearchTemplates.Validation.MISSING_PLACEHOLDER -> R.string.search_engine_error_placeholder
        SearchTemplates.Validation.INVALID_URL -> R.string.search_engine_error_invalid
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.search_engine_custom_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text(stringResource(R.string.search_engine_custom_label)) },
                    singleLine = true,
                    isError = showError && error != null,
                    supportingText = {
                        Text(if (showError && error != null) stringResource(error) else stringResource(R.string.search_engine_custom_help))
                    },
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { if (error == null) onSave(text) else showError = true }) { Text(stringResource(R.string.action_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

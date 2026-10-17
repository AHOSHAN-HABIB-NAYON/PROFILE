package com.filepilot.app.ui.settings

import android.os.Build
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.automirrored.rounded.ManageSearch
import androidx.compose.material.icons.rounded.Policy
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.BuildConfig
import com.filepilot.app.core.model.SortField
import com.filepilot.app.core.model.ThemeMode
import com.filepilot.app.core.model.ViewMode
import com.filepilot.app.data.AppSettings
import com.filepilot.app.permissions.StorageAccess
import com.filepilot.app.ui.components.SectionHeader
import com.filepilot.app.ui.components.ascendingLabel
import com.filepilot.app.ui.components.descendingLabel
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes
import kotlinx.coroutines.launch

private enum class SettingsDialog { THEME, VIEW, SORT, CLEAR_SEARCH, CLEAR_RECENT }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by container.store.settings.collectAsStateWithLifecycle(AppSettings(onboardingDone = true))
    val access by container.access.collectAsStateWithLifecycle()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val searches by container.store.searchHistory.collectAsStateWithLifecycle(emptyList())
    var dialog by remember { mutableStateOf<SettingsDialog?>(null) }

    Scaffold(topBar = { TopAppBar(title = { Text("Settings", style = MaterialTheme.typography.titleLarge) }) }) { padding ->
        LazyColumn(contentPadding = PaddingValues(top = padding.calculateTopPadding(), bottom = 24.dp)) {
            item { SectionHeader("Appearance") }
            item { NavRow(Icons.Rounded.DarkMode, "Theme", settings.theme.label) { dialog = SettingsDialog.THEME } }
            item {
                NavRow(Icons.Rounded.GridView, "Default file view", if (settings.viewMode == ViewMode.LIST) "List" else "Grid") { dialog = SettingsDialog.VIEW }
            }
            item {
                NavRow(
                    Icons.AutoMirrored.Rounded.Sort, "Default sort order",
                    "${settings.sort.field.label} · ${if (settings.sort.ascending) ascendingLabel(settings.sort.field) else descendingLabel(settings.sort.field)}",
                ) { dialog = SettingsDialog.SORT }
            }
            item {
                SwitchRow(Icons.Rounded.Extension, "Show file extensions", "For example “report.pdf” instead of “report”", settings.showExtensions) {
                    scope.launch { container.store.setShowExtensions(it) }
                }
            }
            item {
                SwitchRow(Icons.Rounded.Visibility, "Show hidden files", "Files and folders whose names start with a dot", settings.showHidden) {
                    scope.launch { container.store.setShowHidden(it) }
                }
            }

            item { SectionHeader("Storage & data") }
            item {
                val status = when {
                    access.fullAccess -> "Full file access"
                    access.anyMedia && access.pickedFolderCount > 0 -> "Media + ${access.pickedFolderCount} picked folder(s)"
                    access.anyMedia -> "Photos, videos & audio (read-only)"
                    access.pickedFolderCount > 0 -> "${access.pickedFolderCount} picked folder(s)"
                    else -> "No access granted"
                }
                NavRow(Icons.Rounded.Security, "Storage access & permissions", status) { navigator.go(Routes.PERMISSIONS) }
            }
            item { NavRow(Icons.Rounded.Star, "Manage favorites", "${favorites.size} saved") { navigator.switchTab(Routes.FAVORITES) } }
            item { NavRow(Icons.Rounded.History, "Operation history", "Completed and failed tasks") { navigator.go(Routes.HISTORY) } }
            item {
                NavRow(Icons.AutoMirrored.Rounded.ManageSearch, "Clear search history", if (searches.isEmpty()) "Nothing saved" else "${searches.size} saved searches", enabled = searches.isNotEmpty()) {
                    dialog = SettingsDialog.CLEAR_SEARCH
                }
            }
            item { NavRow(Icons.Rounded.DeleteSweep, "Clear recent files list", "Doesn't delete any files") { dialog = SettingsDialog.CLEAR_RECENT } }

            item { SectionHeader("Developer") }
            item { com.filepilot.app.ui.components.DeveloperCard() }
            item { SectionHeader("About") }
            item { NavRow(Icons.Rounded.Info, "About FilePilot", "Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") { navigator.go(Routes.ABOUT) } }
            item { NavRow(Icons.Rounded.Policy, "Privacy policy", "How FilePilot handles your data") { navigator.go(Routes.PRIVACY) } }
            item { NavRow(Icons.Rounded.Code, "Open-source licenses", "Libraries included in this app") { navigator.go(Routes.LICENSES) } }
            item { NavRow(Icons.Rounded.Settings, "Android app settings", "Permissions, storage and notifications for FilePilot") { StorageAccess.openAppSettings(context) } }
            item {
                Text(
                    "FilePilot ${BuildConfig.VERSION_NAME} · ${BuildConfig.BUILD_TYPE} build · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                )
            }
        }
    }

    when (dialog) {
        SettingsDialog.THEME -> ChoiceDialog(
            "Theme", ThemeMode.entries.map { it.label }, ThemeMode.entries.indexOf(settings.theme),
            onDismiss = { dialog = null },
        ) { i -> scope.launch { container.store.setTheme(ThemeMode.entries[i]) } }
        SettingsDialog.VIEW -> ChoiceDialog(
            "Default file view", listOf("List", "Grid"), if (settings.viewMode == ViewMode.LIST) 0 else 1,
            onDismiss = { dialog = null },
        ) { i -> scope.launch { container.store.setViewMode(if (i == 0) ViewMode.LIST else ViewMode.GRID) } }
        SettingsDialog.SORT -> {
            val options = SortField.entries.flatMap { f -> listOf(f to true, f to false) }
            ChoiceDialog(
                "Default sort order",
                options.map { (f, asc) -> "${f.label} · ${if (asc) ascendingLabel(f) else descendingLabel(f)}" },
                options.indexOf(settings.sort.field to settings.sort.ascending),
                onDismiss = { dialog = null },
            ) { i ->
                val (f, asc) = options[i]
                scope.launch { container.store.setSort(com.filepilot.app.core.model.SortOrder(f, asc)) }
            }
        }
        SettingsDialog.CLEAR_SEARCH -> ConfirmDialog("Clear search history?", "Saved searches are removed from this device.", "Clear", { dialog = null }) {
            scope.launch { container.store.clearSearchHistory() }
        }
        SettingsDialog.CLEAR_RECENT -> ConfirmDialog("Clear recent files list?", "Only the list is cleared. No files are deleted.", "Clear", { dialog = null }) {
            scope.launch { container.store.clearRecents() }
        }
        null -> Unit
    }
}

@Composable
private fun NavRow(icon: ImageVector, title: String, subtitle: String, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(18.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun SwitchRow(icon: ImageVector, title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onChange(!checked) }
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(18.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun ChoiceDialog(title: String, options: List<String>, selected: Int, onDismiss: () -> Unit, onSelect: (Int) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                options.forEachIndexed { i, label ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(selected = i == selected, role = Role.RadioButton) {
                                onSelect(i)
                                onDismiss()
                            }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = i == selected, onClick = null, modifier = Modifier.padding(8.dp))
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

@Composable
private fun ConfirmDialog(title: String, text: String, confirm: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = {
            TextButton(onClick = {
                onConfirm()
                onDismiss()
            }) { Text(confirm) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

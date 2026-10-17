package com.webtecit.devicepilot.ui.apps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Sort
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.InstallMobile
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.foundation.layout.height
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.EmptyState
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.PermissionCard
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.StatusPill

@Composable
fun AppsScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val vm: AppsViewModel = viewModel { AppsViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Usage Access may have been granted in system settings while we were away.
    LifecycleResumeEffect(Unit) {
        if (!ui.usageAccess && c.usage.hasUsageAccess()) vm.refresh()
        onPauseOrDispose { }
    }

    ScreenList {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ShortcutButton(stringResource(R.string.apps_install), Icons.Outlined.InstallMobile, Modifier.weight(1f)) { navigate(Routes.INSTALL) }
                ShortcutButton(stringResource(R.string.apps_uninstall), Icons.Outlined.DeleteSweep, Modifier.weight(1f)) { navigate(Routes.UNINSTALL) }
                ShortcutButton(stringResource(R.string.apps_apk_files), Icons.Outlined.FolderZip, Modifier.weight(1f)) { navigate(Routes.APKS) }
            }
            Spacer(Modifier.height(8.dp))
            ShortcutButton(stringResource(R.string.title_hider), Icons.Outlined.VisibilityOff, Modifier.fillMaxWidth()) { navigate(Routes.HIDER) }
        }
        if (!ui.usageAccess) item {
            PermissionCard(
                stringResource(R.string.perm_usage_title),
                stringResource(R.string.perm_usage_apps_text),
                stringResource(R.string.perm_grant_in_settings),
                onClick = { SystemSettings.usageAccess(context) },
            )
        }
        if (!ui.usageAccess) item { com.webtecit.devicepilot.ui.common.RestrictedSettingsHelp() }
        item {
            OutlinedTextField(
                value = ui.query,
                onValueChange = vm::setQuery,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(stringResource(R.string.apps_search)) },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                trailingIcon = {
                    if (ui.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) {
                        Icon(Icons.Outlined.Close, stringResource(R.string.action_clear))
                    }
                },
                shape = MaterialTheme.shapes.small,
            )
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(AppFilter.entries) { f ->
                    FilterChip(selected = ui.filter == f, onClick = { vm.setFilter(f) }, label = { Text(stringResource(filterLabel(f))) })
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.apps_count, ui.rows.size, ui.total), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                SortMenu(ui.sort, vm::setSort)
            }
            if (ui.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        }
        if (!ui.loading && ui.rows.isEmpty()) item {
            EmptyState(R.drawable.ill_empty, stringResource(R.string.apps_empty_title),
                stringResource(if (ui.filter == AppFilter.DATA || ui.filter == AppFilter.USAGE) R.string.apps_empty_usage else R.string.apps_empty_text))
        }
        items(ui.rows, key = { it.app.packageName }) { row ->
            AppListItem(row) { navigate(Routes.appDetails(row.app.packageName)) }
        }
    }
}

@Composable
private fun SortMenu(sort: AppSort, onSort: (AppSort) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        ShortcutButton(stringResource(sortLabel(sort)), Icons.AutoMirrored.Outlined.Sort) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AppSort.entries.forEach { s ->
                DropdownMenuItem(text = { Text(stringResource(sortLabel(s))) }, onClick = { onSort(s); open = false })
            }
        }
    }
}

@Composable
private fun AppListItem(row: AppRow, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AppIcon(row.app.packageName, 42.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(row.app.label, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(row.app.versionName?.let { "v$it" },
                        row.dataBytes?.takeIf { it > 0 }?.let { stringResource(R.string.apps_data_30d, Formatters.bytes(it)) },
                        row.usage?.foregroundMs?.takeIf { it > 0 }?.let { stringResource(R.string.apps_time_30d, Formatters.duration(it)) },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(8.dp))
            StatusPill(stringResource(if (row.app.isSystem) R.string.app_system else R.string.app_user),
                if (row.app.isSystem) Level.NEUTRAL else Level.INFO)
        }
    }
}

fun filterLabel(f: AppFilter) = when (f) {
    AppFilter.ALL -> R.string.filter_all
    AppFilter.USER -> R.string.filter_user
    AppFilter.SYSTEM -> R.string.filter_system
    AppFilter.RECENT -> R.string.filter_recent
    AppFilter.DATA -> R.string.filter_data
    AppFilter.USAGE -> R.string.filter_usage
}

fun sortLabel(s: AppSort) = when (s) {
    AppSort.NAME -> R.string.sort_name
    AppSort.INSTALLED -> R.string.sort_installed
    AppSort.UPDATED -> R.string.sort_updated
    AppSort.DATA -> R.string.sort_data
    AppSort.USAGE -> R.string.sort_usage
}

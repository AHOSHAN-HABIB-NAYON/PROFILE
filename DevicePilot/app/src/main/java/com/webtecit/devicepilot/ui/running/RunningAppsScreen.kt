package com.webtecit.devicepilot.ui.running

import android.text.format.DateUtils
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BatterySaver
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.AppSettings
import com.webtecit.devicepilot.data.RunState
import com.webtecit.devicepilot.data.RunningApp
import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.firewall.FirewallPhase
import com.webtecit.devicepilot.firewall.FirewallState
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.ConfirmDialog
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.EmptyState
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.PermissionCard
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RunningUi(val loading: Boolean = true, val access: Boolean = true, val apps: List<RunningApp> = emptyList())

class RunningViewModel(private val c: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow(RunningUi())
    val ui = _ui.asStateFlow()

    fun refresh() = viewModelScope.launch {
        val access = c.usage.hasUsageAccess()
        _ui.value = _ui.value.copy(loading = true, access = access)
        val list = if (access) runCatching { c.running.load() }.getOrDefault(emptyList()) else emptyList()
        _ui.value = RunningUi(false, access, list)
    }

    /** Returns how many close requests were sent. */
    fun close(pkgs: List<String>): Int {
        val n = pkgs.count { c.running.closeBackground(it) }
        viewModelScope.launch { delay(800); refresh() }
        return n
    }
}

private enum class RunFilter { ALL, SERVICES, RECENT, USER }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RunningAppsScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val vm: RunningViewModel = viewModel { RunningViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val settings by c.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val fw by FirewallState.status.collectAsStateWithLifecycle()
    var filter by remember { mutableStateOf(RunFilter.ALL) }
    var confirmAll by remember { mutableStateOf(false) }
    val sentMsg = stringResource(R.string.running_close_sent)

    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }

    val list = ui.apps.filter {
        when (filter) {
            RunFilter.ALL -> true
            RunFilter.SERVICES -> it.state == RunState.BACKGROUND_SERVICE
            RunFilter.RECENT -> it.state == RunState.RECENT
            RunFilter.USER -> !it.isSystem
        }
    }
    val closable = list.filter { it.state != RunState.FOREGROUND }.map { it.packageName }

    ScreenList {
        item { HeroCard(R.drawable.ill_memory, stringResource(R.string.running_hero_title), stringResource(R.string.running_hero_text)) }
        if (!ui.access) item {
            PermissionCard(stringResource(R.string.perm_usage_title), stringResource(R.string.running_needs_access),
                stringResource(R.string.perm_grant_in_settings), onClick = { SystemSettings.usageAccess(context) })
        }
        if (!ui.access) item { com.webtecit.devicepilot.ui.common.RestrictedSettingsHelp() }
        if (ui.access) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.running_count, ui.apps.count { it.state == RunState.BACKGROUND_SERVICE }, ui.apps.size),
                            style = MaterialTheme.typography.titleSmall)
                        Text(stringResource(R.string.running_window), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { vm.refresh() }) { Icon(Icons.Outlined.Refresh, stringResource(R.string.action_refresh)) }
                }
                if (ui.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(RunFilter.entries) { f ->
                        FilterChip(filter == f, { filter = f }, label = {
                            Text(stringResource(when (f) {
                                RunFilter.ALL -> R.string.running_filter_all
                                RunFilter.SERVICES -> R.string.running_filter_services
                                RunFilter.RECENT -> R.string.running_filter_recent
                                RunFilter.USER -> R.string.filter_user
                            }))
                        })
                    }
                }
            }
            if (closable.isNotEmpty()) item {
                Button(onClick = { confirmAll = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.Close, null); Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.running_close_all, closable.size))
                }
            }
            if (!ui.loading && list.isEmpty()) item {
                EmptyState(R.drawable.ill_empty, stringResource(R.string.running_empty_title), stringResource(R.string.running_empty_text))
            }
            items(list, key = { it.packageName }) { app ->
                val rule = settings.firewallRules[app.packageName]
                val internetOn = rule == null || !(rule.blockWifi && rule.blockMobile)
                DpCard(contentPadding = 12.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AppIcon(app.packageName, 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(app.label, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(DateUtils.getRelativeTimeSpanString(app.lastActive).toString(),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        StatusPill(stringResource(when (app.state) {
                            RunState.FOREGROUND -> R.string.run_state_foreground
                            RunState.BACKGROUND_SERVICE -> R.string.run_state_service
                            RunState.RECENT -> R.string.run_state_recent
                        }), when (app.state) {
                            RunState.FOREGROUND -> Level.INFO
                            RunState.BACKGROUND_SERVICE -> Level.WARN
                            RunState.RECENT -> Level.NEUTRAL
                        })
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.running_internet), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Switch(checked = internetOn, onCheckedChange = { on ->
                            scope.launch { c.settings.setRule(AppRule(app.packageName, !on, !on)) }
                        })
                    }
                    if (!internetOn && fw.phase != FirewallPhase.ACTIVE) {
                        TextButton(onClick = { navigate(Routes.FIREWALL) }) {
                            Text(stringResource(R.string.running_firewall_off), color = levelColor(Level.WARN))
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (app.state != RunState.FOREGROUND) ShortcutButton(stringResource(R.string.running_close), Icons.Outlined.Close) {
                            vm.close(listOf(app.packageName))
                            Toast.makeText(context, sentMsg, Toast.LENGTH_SHORT).show()
                        }
                        ShortcutButton(stringResource(R.string.running_force_stop), Icons.Outlined.Block) {
                            SystemSettings.appDetails(context, app.packageName)
                        }
                        ShortcutButton(stringResource(R.string.running_restrict), Icons.Outlined.BatterySaver) {
                            SystemSettings.appDetails(context, app.packageName)
                        }
                    }
                }
            }
        }
        item { SourceNote(stringResource(R.string.running_note)) }
    }

    if (confirmAll) {
        ConfirmDialog(
            title = stringResource(R.string.running_close_all_title),
            text = stringResource(R.string.running_close_all_text),
            confirm = stringResource(R.string.running_close),
            onConfirm = {
                confirmAll = false
                vm.close(closable)
                Toast.makeText(context, sentMsg, Toast.LENGTH_SHORT).show()
            },
            onDismiss = { confirmAll = false },
        )
    }
}

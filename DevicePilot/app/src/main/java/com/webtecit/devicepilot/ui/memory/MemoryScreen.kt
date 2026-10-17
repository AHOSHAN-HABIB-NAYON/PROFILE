package com.webtecit.devicepilot.ui.memory

import android.os.Debug
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.AppUsageInfo
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.Pressure
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.PermissionCard
import com.webtecit.devicepilot.ui.common.RingGauge
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.polling
import com.webtecit.devicepilot.ui.common.pressureLevel
import com.webtecit.devicepilot.ui.common.pressureRes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MemoryViewModel(c: AppContainer) : ViewModel() {
    val memory = polling(2_000) { c.monitor.memory() }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val cpu = polling(2_000) { c.monitor.cpu() }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

/** Result of the Clean Up check. Only [ownCacheFreed] is an action DevicePilot actually performs. */
private data class CleanupReport(
    val memoryPressure: Pressure,
    val storagePressure: Pressure?,
    val ownCacheFreed: Long,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MemoryScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val vm: MemoryViewModel = viewModel { MemoryViewModel(c) }
    val memory by vm.memory.collectAsStateWithLifecycle()
    val cpu by vm.cpu.collectAsStateWithLifecycle()
    var report by remember { mutableStateOf<CleanupReport?>(null) }
    var scanning by remember { mutableStateOf(false) }
    val recent by produceState<List<AppUsageInfo>?>(null) {
        value = if (!c.usage.hasUsageAccess()) null else c.usage
            .appUsage(UsagePeriods.range(UsagePeriod.TODAY, System.currentTimeMillis(), 1))
            .values.filter { it.foregroundMs > 0 }.sortedByDescending { it.lastUsed }.take(8)
    }

    ScreenList {
        memory?.let { m ->
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RingGauge(m.usedPercent / 100f, size = 112.dp, color = levelColor(pressureLevel(m.pressure))) {
                            Text("${m.usedPercent}%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            StatusPill(stringResource(pressureRes(m.pressure)), pressureLevel(m.pressure))
                            Spacer(Modifier.height(6.dp))
                            Text(stringResource(R.string.ram_available, Formatters.bytes(m.availableBytes)), style = MaterialTheme.typography.bodyMedium)
                            Text(stringResource(R.string.ram_total, Formatters.bytes(m.totalBytes)), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    InfoRow(stringResource(R.string.ram_threshold), Formatters.bytes(m.thresholdBytes))
                    InfoRow(stringResource(R.string.ram_low_flag), stringResource(if (m.lowMemory) R.string.yes else R.string.no))
                    InfoRow(stringResource(R.string.ram_low_ram_device), stringResource(if (c.monitor.isLowRamDevice) R.string.yes else R.string.no))
                    val pss = remember(m) { Debug.getPss() * 1024 }
                    InfoRow(stringResource(R.string.ram_this_app), Formatters.bytes(pss))
                    SourceNote(stringResource(R.string.ram_source))
                }
            }
        }
        cpu?.let { cp ->
            item {
                DpCard {
                    Text(stringResource(R.string.cpu_title), style = MaterialTheme.typography.titleSmall)
                    InfoRow(stringResource(R.string.cpu_cores), cp.cores.toString())
                    cp.usagePercent?.let { InfoRow(stringResource(R.string.cpu_usage), "$it%") }
                    cp.currentFreqMhz.forEachIndexed { i, f ->
                        val max = cp.maxFreqMhz.getOrNull(i)
                        InfoRow(stringResource(R.string.cpu_core_n, i), when {
                            f != null && max != null -> "$f / $max MHz"
                            f != null -> "$f MHz"
                            else -> stringResource(R.string.unavailable)
                        })
                    }
                    SourceNote(stringResource(if (cp.usagePercent != null) R.string.source_proc_stat else R.string.cpu_usage_restricted_long))
                }
            }
        }
        item { SectionTitle(stringResource(R.string.cleanup_title)) }
        item {
            DpCard {
                Text(stringResource(R.string.cleanup_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Button(onClick = {
                    scanning = true
                    scope.launch {
                        val freed = withContext(Dispatchers.IO) { clearOwnCache(context.cacheDir) }
                        report = CleanupReport(c.monitor.memory().pressure, c.monitor.storage()?.pressure, freed)
                        scanning = false
                    }
                }, enabled = !scanning) {
                    Icon(Icons.Outlined.CleaningServices, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.cleanup_run))
                }
                if (scanning) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
                AnimatedVisibility(report != null) {
                    report?.let { r ->
                        Column(Modifier.padding(top = 12.dp)) {
                            Text(stringResource(R.string.cleanup_done_actions), style = MaterialTheme.typography.titleSmall)
                            Text(stringResource(R.string.cleanup_own_cache, Formatters.bytes(r.ownCacheFreed)), style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.height(8.dp))
                            Text(stringResource(R.string.cleanup_findings), style = MaterialTheme.typography.titleSmall)
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                                Text(stringResource(R.string.factor_memory), Modifier.weight(1f))
                                StatusPill(stringResource(pressureRes(r.memoryPressure)), pressureLevel(r.memoryPressure))
                            }
                            r.storagePressure?.let {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                                    Text(stringResource(R.string.factor_storage), Modifier.weight(1f))
                                    StatusPill(stringResource(pressureRes(it)), pressureLevel(it))
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(stringResource(R.string.cleanup_suggestions), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(8.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (r.storagePressure != null && r.storagePressure != Pressure.LOW)
                                    ShortcutButton(stringResource(R.string.action_storage_settings), Icons.Outlined.Settings) { SystemSettings.storage(context) }
                                ShortcutButton(stringResource(R.string.action_uninstall_unused), Icons.Outlined.Apps) { navigate(Routes.UNINSTALL) }
                            }
                        }
                    }
                }
            }
        }
        item { SectionTitle(stringResource(R.string.running_title)) }
        item {
            DpCard {
                Text(stringResource(R.string.running_explain), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.title_running), Icons.Outlined.Apps) { navigate(Routes.RUNNING) }
                    ShortcutButton(stringResource(R.string.action_manage_apps), Icons.Outlined.Apps) { SystemSettings.appList(context) }
                    ShortcutButton(stringResource(R.string.action_running_services), Icons.Outlined.Settings) { SystemSettings.developerOptions(context) }
                }
            }
        }
        val r = recent
        if (r == null) item {
            PermissionCard(stringResource(R.string.perm_usage_title), stringResource(R.string.perm_usage_recent_text),
                stringResource(R.string.perm_grant_in_settings), onClick = { SystemSettings.usageAccess(context) })
        } else if (r.isNotEmpty()) {
            item { SectionTitle(stringResource(R.string.recent_apps_today)) }
            item {
                DpCard {
                    r.forEach { u ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            AppIcon(u.packageName, 32.dp)
                            Spacer(Modifier.width(10.dp))
                            Text(c.apps.labelFor(u.packageName), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(Formatters.duration(u.foregroundMs), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    SourceNote(stringResource(R.string.recent_apps_source))
                }
            }
        }
    }
}

/** Deletes only DevicePilot's own cache directory contents. Returns bytes freed. */
private fun clearOwnCache(dir: File): Long {
    var freed = 0L
    dir.listFiles()?.forEach { f ->
        val size = f.walkBottomUp().filter { it.isFile }.sumOf { it.length() }
        if (f.deleteRecursively()) freed += size
    }
    return freed
}

package com.webtecit.devicepilot.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.BatteryChargingFull
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material.icons.outlined.DeveloperMode
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Radar
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.SdStorage
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.BatterySnapshot
import com.webtecit.devicepilot.data.CpuSnapshot
import com.webtecit.devicepilot.data.DeviceDataTotals
import com.webtecit.devicepilot.data.DeviceIdentity
import com.webtecit.devicepilot.data.NetworkStatus
import com.webtecit.devicepilot.data.ThermalSnapshot
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.HealthFactorId
import com.webtecit.devicepilot.domain.HealthInputs
import com.webtecit.devicepilot.domain.HealthResult
import com.webtecit.devicepilot.domain.HealthScoreCalculator
import com.webtecit.devicepilot.domain.MemorySnapshot
import com.webtecit.devicepilot.domain.StorageSnapshot
import com.webtecit.devicepilot.domain.TemperatureUnit
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.MetricTile
import com.webtecit.devicepilot.ui.common.RingGauge
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.chargeStateRes
import com.webtecit.devicepilot.ui.common.entrance
import com.webtecit.devicepilot.ui.common.factorLevel
import com.webtecit.devicepilot.ui.common.factorStatusRes
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.polling
import com.webtecit.devicepilot.ui.common.pressureLevel
import com.webtecit.devicepilot.ui.common.pressureRes
import com.webtecit.devicepilot.ui.common.thermalLabelRes
import com.webtecit.devicepilot.ui.common.thermalLevel
import com.webtecit.devicepilot.ui.common.transportRes
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class HomeState(
    val identity: DeviceIdentity,
    val memory: MemorySnapshot,
    val storage: StorageSnapshot?,
    val battery: BatterySnapshot,
    val thermal: ThermalSnapshot,
    val network: NetworkStatus,
    val cpu: CpuSnapshot,
    val health: HealthResult,
    val unit: TemperatureUnit,
)

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModel(private val c: AppContainer) : ViewModel() {

    private val live = c.settings.settings.map { it.refreshSeconds to it.temperatureUnit }.distinctUntilChanged()
        .flatMapLatest { (sec, unit) ->
            polling(sec * 1000L) {
                val memory = c.monitor.memory()
                val storage = c.monitor.storage()
                val battery = c.monitor.battery()
                val thermal = c.monitor.thermal()
                HomeState(
                    identity = c.monitor.identity(),
                    memory = memory,
                    storage = storage,
                    battery = battery,
                    thermal = thermal,
                    network = c.monitor.network(),
                    cpu = c.monitor.cpu(),
                    health = HealthScoreCalculator.calculate(
                        HealthInputs(storage, memory, if (thermal.supported) thermal.level else null,
                            battery.celsius, battery.percent, battery.isCharging)
                    ),
                    unit = unit,
                )
            }
        }

    /** Network totals change slowly and need Usage Access; refreshed once a minute. */
    private val data = c.settings.settings.map { it.billingDay }.distinctUntilChanged().flatMapLatest {
        polling(60_000L) {
            if (!c.usage.hasUsageAccess()) null
            else c.usage.deviceTotals(UsagePeriods.range(UsagePeriod.TODAY, System.currentTimeMillis(), it))
        }
    }

    val state = live.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val dataToday = data.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

@Composable
fun HomeScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val vm: HomeViewModel = viewModel { HomeViewModel(c) }
    val state by vm.state.collectAsStateWithLifecycle()
    val data by vm.dataToday.collectAsStateWithLifecycle()
    val s = state ?: return
    val context = LocalContext.current

    ScreenList {
        item { DeviceCard(s, Modifier.entrance(0)) }
        item { HealthCard(s.health, Modifier.entrance(1)) }
        item { SectionTitle(stringResource(R.string.home_performance)) }
        item {
            Row(Modifier.entrance(2), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricTile(
                    Icons.Outlined.Memory, stringResource(R.string.metric_ram),
                    "${s.memory.usedPercent}%",
                    Modifier.weight(1f),
                    subtitle = stringResource(R.string.metric_ram_sub, Formatters.bytes(s.memory.availableBytes), Formatters.bytes(s.memory.totalBytes)),
                    level = pressureLevel(s.memory.pressure),
                    progress = s.memory.usedPercent / 100f,
                    onClick = { navigate(Routes.MEMORY) },
                )
                val st = s.storage
                MetricTile(
                    Icons.Outlined.SdStorage, stringResource(R.string.metric_storage),
                    if (st != null) "${st.usedPercent}%" else stringResource(R.string.unavailable),
                    Modifier.weight(1f),
                    subtitle = st?.let { stringResource(R.string.metric_storage_sub, Formatters.bytes(it.freeBytes)) },
                    level = st?.let { pressureLevel(it.pressure) } ?: Level.NEUTRAL,
                    progress = st?.let { it.usedPercent / 100f },
                    onClick = { navigate(Routes.STORAGE) },
                )
            }
        }
        item {
            Row(Modifier.entrance(3), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val t = s.battery.celsius
                MetricTile(
                    Icons.Outlined.Thermostat, stringResource(R.string.metric_battery_temp),
                    t?.let { TemperatureUtils.format(it, s.unit) } ?: stringResource(R.string.unavailable),
                    Modifier.weight(1f),
                    subtitle = stringResource(R.string.source_battery_broadcast),
                    level = when { t == null -> Level.NEUTRAL; t >= 45 -> Level.BAD; t >= 40 -> Level.WARN; else -> Level.GOOD },
                    onClick = { navigate(Routes.TEMPERATURE) },
                )
                MetricTile(
                    Icons.Outlined.LocalFireDepartment, stringResource(R.string.metric_thermal),
                    stringResource(if (s.thermal.supported) thermalLabelRes(s.thermal.level) else R.string.thermal_unsupported_short),
                    Modifier.weight(1f),
                    subtitle = stringResource(if (s.thermal.supported) R.string.source_power_manager else R.string.requires_android_10),
                    level = if (s.thermal.supported) thermalLevel(s.thermal.level) else Level.NEUTRAL,
                    onClick = { navigate(Routes.TEMPERATURE) },
                )
            }
        }
        item {
            Row(Modifier.entrance(4), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val usage = s.cpu.usagePercent
                val freqs = s.cpu.currentFreqMhz.filterNotNull()
                MetricTile(
                    Icons.Outlined.Speed, stringResource(R.string.metric_cpu),
                    when {
                        usage != null -> "$usage%"
                        freqs.isNotEmpty() -> stringResource(R.string.cpu_freq_value, freqs.max())
                        else -> stringResource(R.string.cpu_cores_value, s.cpu.cores)
                    },
                    Modifier.weight(1f),
                    subtitle = stringResource(if (usage != null) R.string.source_proc_stat else R.string.cpu_usage_restricted),
                    level = Level.INFO,
                    onClick = { navigate(Routes.MEMORY) },
                )
                val d: DeviceDataTotals? = data
                MetricTile(
                    Icons.Outlined.DataUsage, stringResource(R.string.metric_data_today),
                    if (d != null) Formatters.bytes((d.wifiTotal ?: 0) + (d.mobileTotal ?: 0)) else stringResource(R.string.needs_usage_access_short),
                    Modifier.weight(1f),
                    subtitle = if (d != null) stringResource(R.string.data_split,
                        d.wifiTotal?.let { Formatters.bytes(it) } ?: "—", d.mobileTotal?.let { Formatters.bytes(it) } ?: "—")
                    else stringResource(R.string.tap_to_grant),
                    level = if (d != null) Level.INFO else Level.NEUTRAL,
                    onClick = { navigate(Routes.NETWORK) },
                )
            }
        }
        item { SectionTitle(stringResource(R.string.home_quick_actions)) }
        item {
            DpCard(Modifier.entrance(5), contentPadding = 8.dp) {
                val actions = listOf(
                    QuickAction(Icons.Outlined.Radar, R.string.qa_scan) { navigate(Routes.OPTIMIZE) },
                    QuickAction(Icons.Outlined.Apps, R.string.qa_apps) { navigate(Routes.APPS) },
                    QuickAction(Icons.Outlined.Security, R.string.qa_firewall) { navigate(Routes.FIREWALL) },
                    QuickAction(Icons.Outlined.DataUsage, R.string.qa_network) { navigate(Routes.NETWORK) },
                    QuickAction(Icons.Outlined.Thermostat, R.string.qa_temperature) { navigate(Routes.TEMPERATURE) },
                    QuickAction(Icons.Outlined.CleaningServices, R.string.qa_cleanup) { navigate(Routes.MEMORY) },
                    QuickAction(Icons.Outlined.MenuBook, R.string.qa_guide) { navigate(Routes.GUIDE) },
                    QuickAction(Icons.Outlined.DeveloperMode, R.string.qa_developer) { SystemSettings.developerOptions(context) },
                )
                actions.chunked(4).forEach { row ->
                    Row(Modifier.fillMaxWidth()) {
                        row.forEach { a -> QuickActionItem(a, Modifier.weight(1f)) }
                    }
                }
            }
        }
        item {
            NavigationShortcuts(navigate, s)
        }
        item { SourceNote(stringResource(R.string.home_sources_note)) }
    }
}

private data class QuickAction(val icon: ImageVector, val label: Int, val onClick: () -> Unit)

@Composable
private fun QuickActionItem(a: QuickAction, modifier: Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = a.onClick).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f), MaterialTheme.colorScheme.secondary.copy(alpha = 0.16f)))),
            contentAlignment = Alignment.Center,
        ) { Icon(a.icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) }
        Spacer(Modifier.height(6.dp))
        Text(stringResource(a.label), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 2)
    }
}

@Composable
private fun DeviceCard(s: HomeState, modifier: Modifier) {
    val gradient = Brush.linearGradient(listOf(Color(0xFF1E6BFF), Color(0xFF0B1B3F)))
    Box(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(gradient).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.home_your_device), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.75f))
                Text("${s.identity.manufacturer} ${s.identity.model}", style = MaterialTheme.typography.titleLarge, color = Color.White, maxLines = 2)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.android_version_api, s.identity.androidVersion, s.identity.apiLevel),
                    style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f))
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    WhiteChip(Icons.Outlined.BatteryChargingFull,
                        (s.battery.percent?.let { "$it%" } ?: "—") + " · " + stringResource(chargeStateRes(s.battery.state)))
                    WhiteChip(Icons.Outlined.DataUsage,
                        stringResource(transportRes(s.network.transport)) + if (s.network.vpnActive) " · VPN" else "")
                }
            }
            Image(painterResource(R.drawable.ill_dashboard), null, Modifier.width(96.dp).height(80.dp))
        }
    }
}

@Composable
private fun WhiteChip(icon: ImageVector, text: String) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.16f)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(4.dp))
        Text(text, style = MaterialTheme.typography.labelSmall, color = Color.White, maxLines = 1)
    }
}

@Composable
private fun HealthCard(h: HealthResult, modifier: Modifier) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val level = when { h.score >= 80 -> Level.GOOD; h.score >= 55 -> Level.WARN; else -> Level.BAD }
    DpCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RingGauge(h.score / 100f, size = 96.dp, stroke = 10.dp, color = levelColor(level)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${h.score}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("/100", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.health_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.health_disclaimer), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { expanded = !expanded }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text(stringResource(if (expanded) R.string.health_hide_factors else R.string.health_show_factors, h.measuredFactors))
                    Icon(if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null)
                }
            }
        }
        AnimatedVisibility(expanded) {
            Column {
                h.factors.forEach { f ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(factorTitle(f.id)), style = MaterialTheme.typography.bodyMedium)
                            Text(stringResource(factorExplain(f.id)), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(horizontalAlignment = Alignment.End) {
                            StatusPill(stringResource(factorStatusRes(f.status)), factorLevel(f.status))
                            if (f.deduction > 0) Text("−${f.deduction}", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

private fun factorTitle(id: HealthFactorId) = when (id) {
    HealthFactorId.STORAGE -> R.string.factor_storage
    HealthFactorId.MEMORY -> R.string.factor_memory
    HealthFactorId.THERMAL -> R.string.factor_thermal
    HealthFactorId.BATTERY_TEMP -> R.string.factor_battery_temp
    HealthFactorId.BATTERY_LEVEL -> R.string.factor_battery_level
}

private fun factorExplain(id: HealthFactorId) = when (id) {
    HealthFactorId.STORAGE -> R.string.factor_storage_explain
    HealthFactorId.MEMORY -> R.string.factor_memory_explain
    HealthFactorId.THERMAL -> R.string.factor_thermal_explain
    HealthFactorId.BATTERY_TEMP -> R.string.factor_battery_temp_explain
    HealthFactorId.BATTERY_LEVEL -> R.string.factor_battery_level_explain
}

@Composable
private fun NavigationShortcuts(navigate: (String) -> Unit, s: HomeState) {
    DpCard {
        com.webtecit.devicepilot.ui.common.NavRow(Icons.Outlined.BatteryChargingFull, stringResource(R.string.title_battery),
            stringResource(R.string.battery_row_sub)) { navigate(Routes.BATTERY) }
        com.webtecit.devicepilot.ui.common.NavRow(Icons.Outlined.SdStorage, stringResource(R.string.title_storage),
            s.storage?.let { stringResource(pressureRes(it.pressure)) }) { navigate(Routes.STORAGE) }
        com.webtecit.devicepilot.ui.common.NavRow(Icons.Outlined.Memory, stringResource(R.string.title_memory),
            stringResource(pressureRes(s.memory.pressure))) { navigate(Routes.MEMORY) }
    }
}

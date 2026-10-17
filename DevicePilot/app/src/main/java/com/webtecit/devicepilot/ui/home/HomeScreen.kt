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
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.Radar
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material.icons.outlined.VisibilityOff
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
        item { DeviceCard(s, Modifier.entrance(0).clickable { navigate(Routes.DEVICE_INFO) }) }
        item { HealthCard(s.health, Modifier.entrance(1)) }
        item { BatteryHealthCard(navigate, Modifier.entrance(2)) }
        item { SectionTitle(stringResource(R.string.home_performance)) }
        item { DashboardGrid(s, data, navigate, Modifier.entrance(3)) }
        item { SectionTitle(stringResource(R.string.home_quick_actions)) }
        item {
            DpCard(Modifier.entrance(5), contentPadding = 8.dp) {
                val actions = listOf(
                    QuickAction(Icons.Outlined.Radar, R.string.qa_scan) { navigate(Routes.OPTIMIZE) },
                    QuickAction(Icons.Outlined.PhoneAndroid, R.string.qa_device_info) { navigate(Routes.DEVICE_INFO) },
                    QuickAction(Icons.Outlined.PlayCircle, R.string.qa_running) { navigate(Routes.RUNNING) },
                    QuickAction(Icons.Outlined.Apps, R.string.qa_apps) { navigate(Routes.APPS) },
                    QuickAction(Icons.Outlined.Security, R.string.qa_firewall) { navigate(Routes.FIREWALL) },
                    QuickAction(Icons.Outlined.CleaningServices, R.string.qa_cleanup) { navigate(Routes.MEMORY) },
                    QuickAction(Icons.Outlined.MenuBook, R.string.qa_guide) { navigate(Routes.GUIDE) },
                    QuickAction(Icons.Outlined.VisibilityOff, R.string.qa_hider) { navigate(Routes.HIDER) },
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
        item { com.webtecit.devicepilot.brand.DeveloperCredit() }
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
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).then(modifier).background(gradient).padding(16.dp)) {
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


/** Battery health and cycle count, shown prominently near the top of Home. */
@Composable
private fun BatteryHealthCard(navigate: (String) -> Unit, modifier: Modifier) {
    val c = LocalContainer.current
    val info by androidx.compose.runtime.produceState<Pair<com.webtecit.devicepilot.data.BatterySnapshot, com.webtecit.devicepilot.data.BatteryExtras>?>(null) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val b = c.monitor.battery(); b to c.details.batteryExtras(b)
        }
    }
    val (b, x) = info ?: return
    DpCard(modifier, onClick = { navigate(Routes.BATTERY) }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            com.webtecit.devicepilot.ui.common.IconBadge(Icons.Outlined.BatteryChargingFull, size = 36.dp)
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.bh_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            StatusPill(stringResource(com.webtecit.devicepilot.ui.common.batteryHealthRes(b.health)),
                if (b.health == android.os.BatteryManager.BATTERY_HEALTH_GOOD) Level.GOOD else if (b.health == null) Level.NEUTRAL else Level.WARN)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BigStat(stringResource(R.string.bh_cycles), x.cycleCount?.toString() ?: "—", Modifier.weight(1f))
            BigStat(stringResource(R.string.bh_capacity), x.healthPercent?.let { "$it%" } ?: "—", Modifier.weight(1f))
            BigStat(stringResource(R.string.bh_level), b.percent?.let { "$it%" } ?: "—", Modifier.weight(1f))
        }
    }
}

@Composable
private fun BigStat(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)).padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}


private data class StaticSpecs(
    val chipName: String?, val chipCode: String?, val clusters: List<com.webtecit.devicepilot.data.CpuCluster>,
    val gpu: String?, val display: com.webtecit.devicepilot.data.DisplayInfo?, val cycles: Int?,
)

/** CPU-X style overview: CPU/GPU on the left, memory, battery, display and network on the right. */
@Composable
private fun DashboardGrid(s: HomeState, data: DeviceDataTotals?, navigate: (String) -> Unit, modifier: Modifier) {
    val c = LocalContainer.current
    val specs by androidx.compose.runtime.produceState<StaticSpecs?>(null) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val chip = c.hardware.chipset()
            StaticSpecs(chip.first, chip.second, c.hardware.cpuClusters(), c.hardware.gpu().first, c.details.display(),
                c.details.batteryExtras(c.monitor.battery()).cycleCount)
        }
    }
    val sp = specs
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            DashTile(Icons.Outlined.Memory, stringResource(R.string.metric_cpu), onClick = { navigate(Routes.DEVICE_INFO) }) {
                Text(sp?.chipName ?: sp?.chipCode ?: android.os.Build.HARDWARE, style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                if (sp?.chipName != null && sp.chipCode != null) Text(sp.chipCode, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                sp?.clusters?.forEach {
                    Text(String.format(java.util.Locale.US, "%d × %.2f GHz", it.cores, it.maxMhz / 1000f),
                        style = MaterialTheme.typography.bodyMedium)
                }
                if (sp?.clusters.isNullOrEmpty()) Text(stringResource(R.string.cpu_cores_value, s.cpu.cores), style = MaterialTheme.typography.bodyMedium)
                sp?.gpu?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.dd_gpu), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    Text(it, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
                }
            }
            DashTile(Icons.Outlined.DataUsage, stringResource(transportRes(s.network.transport)), onClick = { navigate(Routes.NETWORK) }) {
                Text(stringResource(if (s.network.validated) R.string.net_internet_ok else R.string.net_no_internet),
                    style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.metric_data_today), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (data != null) Formatters.bytes((data.wifiTotal ?: 0) + (data.mobileTotal ?: 0)) else "—",
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            DashTile(null, null, onClick = { navigate(Routes.MEMORY) }) {
                BarStat(stringResource(R.string.metric_ram), s.memory.usedPercent / 100f,
                    "${Formatters.bytes(s.memory.usedBytes)} / ${Formatters.bytes(s.memory.totalBytes)}")
                Spacer(Modifier.height(12.dp))
                s.storage?.let { st ->
                    BarStat(stringResource(R.string.metric_storage), st.usedPercent / 100f,
                        "${Formatters.bytes(st.usedBytes)} / ${Formatters.bytes(st.totalBytes)}")
                }
            }
            DashTile(Icons.Outlined.BatteryChargingFull, stringResource(R.string.dd_battery), onClick = { navigate(Routes.BATTERY) }) {
                IconLine(Icons.Outlined.BatteryChargingFull, s.battery.percent?.let { "$it%" } ?: "—")
                IconLine(Icons.Outlined.Thermostat, s.battery.celsius?.let { TemperatureUtils.format(it, s.unit) } ?: "—")
                s.battery.currentNowMa?.let { IconLine(Icons.Outlined.Bolt, String.format(java.util.Locale.US, "%.2f A", kotlin.math.abs(it) / 1000f)) }
                sp?.cycles?.let { IconLine(Icons.Outlined.History, stringResource(R.string.home_cycles, it)) }
            }
            sp?.display?.let { d ->
                DashTile(Icons.Outlined.Smartphone, stringResource(R.string.dd_display), onClick = { navigate(Routes.DEVICE_INFO) }) {
                    Text("${d.widthPx} × ${d.heightPx}", style = MaterialTheme.typography.bodyMedium)
                    Text(listOfNotNull(d.sizeInches?.let { String.format(java.util.Locale.US, "%.2f\"", it) },
                        String.format(java.util.Locale.US, "%.0f Hz", d.maxRefreshRate)).joinToString(" | "),
                        style = MaterialTheme.typography.bodyMedium)
                }
            }
            DashTile(Icons.Outlined.LocalFireDepartment, stringResource(R.string.metric_thermal), onClick = { navigate(Routes.TEMPERATURE) }) {
                StatusPill(stringResource(if (s.thermal.supported) thermalLabelRes(s.thermal.level) else R.string.thermal_unsupported_short),
                    if (s.thermal.supported) thermalLevel(s.thermal.level) else Level.NEUTRAL)
            }
        }
    }
}

@Composable
private fun DashTile(icon: ImageVector?, title: String?, onClick: () -> Unit, content: @Composable () -> Unit) {
    DpCard(onClick = onClick, contentPadding = 14.dp) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            if (icon != null || title != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (icon != null) Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                    if (icon != null && title != null) Spacer(Modifier.width(6.dp))
                    if (title != null) Text(title, style = MaterialTheme.typography.titleSmall)
                }
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}

@Composable
private fun BarStat(label: String, progress: Float, value: String) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(6.dp))
        com.webtecit.devicepilot.ui.common.Meter(progress)
        Spacer(Modifier.height(6.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun IconLine(icon: ImageVector, text: String) {
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

package com.webtecit.devicepilot.feature.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.AppInfo
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.designsystem.AppLogo
import com.webtecit.devicepilot.core.designsystem.BigValue
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.MetricRing
import com.webtecit.devicepilot.core.designsystem.QuickActionTile
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.designsystem.UsageMeter
import com.webtecit.devicepilot.core.designsystem.color
import com.webtecit.devicepilot.core.designsystem.toneForTemperature
import com.webtecit.devicepilot.core.navigation.Routes
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.DeviceInfoRepository
import com.webtecit.devicepilot.data.repository.LiveSnapshot
import com.webtecit.devicepilot.data.repository.LiveStatusRepository
import com.webtecit.devicepilot.domain.usecase.HealthScoreCalculator
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Live device status shared by Home, Health and Performance; stops polling 5 s after the screen leaves. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class LiveViewModel @Inject constructor(
    live: LiveStatusRepository,
    settings: SettingsRepository,
    val deviceInfo: DeviceInfoRepository,
) : ViewModel() {
    val refreshMs: StateFlow<Long> = settings.settings.map { it.refreshIntervalMs }.distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 2_000)

    val snapshot: StateFlow<LiveSnapshot?> = settings.settings
        .map { it.refreshIntervalMs }
        .distinctUntilChanged()
        .flatMapLatest { live.snapshots(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

fun healthTone(result: HealthScoreCalculator.Result): Tone = when {
    result.score == null -> Tone.NEUTRAL
    result.score >= 70 -> Tone.GOOD
    result.score >= 50 -> Tone.WARNING
    else -> Tone.BAD
}

@Composable
fun DashboardScreen(
    navigate: (String) -> Unit,
    isDark: Boolean,
    onToggleTheme: () -> Unit,
    viewModel: LiveViewModel = hiltViewModel(),
) {
    val snap by viewModel.snapshot.collectAsStateWithLifecycle()

    LazyColumn(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars),
        contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, bottom = Spacing.xl),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                AppLogo(36.dp)
                Spacer(Modifier.width(Spacing.sm))
                Text(AppInfo.NAME, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                IconButton(onClick = onToggleTheme) {
                    Icon(if (isDark) Icons.Default.LightMode else Icons.Default.DarkMode, contentDescription = if (isDark) "Switch to light mode" else "Switch to dark mode")
                }
                IconButton(onClick = { navigate(Routes.SETTINGS) }) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
            }
        }
        item {
            DpCard(onClick = { navigate(Routes.DEVICE_INFO) }) {
                Text(viewModel.deviceInfo.marketingModel(), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(2.dp))
                Text(
                    "${android.os.Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} · ${viewModel.deviceInfo.androidVersionLabel()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        val s = snap
        if (s == null) {
            item { LoadingState("Reading device status…") }
        } else {
            item { HealthOverview(s) { navigate(Routes.HEALTH) } }
            item { SectionHeader("Quick actions") }
            item { QuickActions(navigate) }
            item { PerformanceOverview(s) { navigate(Routes.PERFORMANCE) } }
            item { BatteryOverview(s) { navigate(Routes.CHARGING) } }
        }
    }
}

@Composable
private fun HealthOverview(s: LiveSnapshot, onClick: () -> Unit) {
    val tone = healthTone(s.health)
    DpCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MetricRing(progress = (s.health.score ?: 0) / 100f, size = 104.dp, color = tone.color()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(s.health.score?.toString() ?: "—", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                    Text("Health", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.width(Spacing.lg))
            Column(Modifier.weight(1f)) {
                Text("Device health", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                StatusChip(s.health.label, tone)
                Spacer(Modifier.height(Spacing.sm))
                val bat = s.battery
                InfoRow("Battery", bat?.health?.label ?: "Not Available")
                InfoRow("Temperature", bat?.temperatureC?.display { Formatters.celsius(it) } ?: "Not Available",
                    valueColor = bat?.temperatureC?.valueOrNull?.let { toneForTemperature(it).color() } ?: androidx.compose.ui.graphics.Color.Unspecified)
            }
        }
        Spacer(Modifier.height(Spacing.sm))
        UsageMeter("RAM", Formatters.bytes(s.memory.usedBytes), Formatters.bytes(s.memory.totalBytes), s.memory.usedFraction)
        UsageMeter("Storage", Formatters.bytes(s.storage.usedBytes), Formatters.bytes(s.storage.totalBytes), s.storage.usedFraction)
    }
}

@Composable
private fun QuickActions(navigate: (String) -> Unit) {
    val actions = listOf(
        Triple(Icons.Default.RocketLaunch, "Boost", Routes.RAM_BOOST) to Brand.Green,
        Triple(Icons.Default.CleaningServices, "Clean", Routes.JUNK) to Brand.Teal,
        Triple(Icons.Default.Speed, "Speed Up", Routes.SPEED_UP) to Brand.Amber,
        Triple(Icons.Default.PhoneAndroid, "Phone Details", Routes.DEVICE_INFO) to MaterialTheme.colorScheme.tertiary,
        Triple(Icons.Default.BatteryChargingFull, "Battery", Routes.CHARGING) to Brand.Green,
        Triple(Icons.Default.FolderOpen, "Storage", Routes.STORAGE) to Brand.Teal,
    )
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        actions.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                row.forEach { (a, tint) ->
                    QuickActionTile(a.first, a.second, tint, Modifier.weight(1f)) { navigate(a.third) }
                }
            }
        }
    }
}

@Composable
private fun PerformanceOverview(s: LiveSnapshot, onClick: () -> Unit) {
    DpCard(onClick = onClick) {
        SectionHeader("Performance", subtitle = "Live · tap for graphs")
        Spacer(Modifier.height(Spacing.sm))
        Row(Modifier.fillMaxWidth()) {
            val load = s.cpu.load
            BigValue(
                load.valueOrNull?.let { Formatters.percent(it) } ?: "—",
                if (load is Reading.Unavailable) "CPU: ${load.reason.label}" else "CPU load (est.)",
                Modifier.weight(1f),
            )
            BigValue(Formatters.bytes(s.memory.availableBytes), "Free RAM", Modifier.weight(1f))
            BigValue(Formatters.bytes(s.storage.freeBytes), "Free storage", Modifier.weight(1f))
        }
        Spacer(Modifier.height(Spacing.md))
        Row(Modifier.fillMaxWidth()) {
            BigValue(s.battery?.temperatureC?.display { Formatters.celsius(it) } ?: "—", "Battery temp", Modifier.weight(1f))
            BigValue(s.traffic?.let { Formatters.rate(it.rxBytesPerSec) } ?: "—", "Download", Modifier.weight(1f))
            BigValue(s.traffic?.let { Formatters.rate(it.txBytesPerSec) } ?: "—", "Upload", Modifier.weight(1f))
        }
    }
}

@Composable
private fun BatteryOverview(s: LiveSnapshot, onClick: () -> Unit) {
    val bat = s.battery ?: return
    DpCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.BatteryChargingFull, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(Spacing.sm))
            Text("Battery", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            StatusChip(bat.chargeState.label, if (bat.isCharging) Tone.GOOD else Tone.NEUTRAL)
        }
        Spacer(Modifier.height(Spacing.sm))
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${bat.levelPercent}%", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.width(Spacing.sm))
            Text(bat.source.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 6.dp))
        }
        Spacer(Modifier.height(Spacing.xs))
        com.webtecit.devicepilot.core.designsystem.LinearMeter(bat.levelPercent / 100f, color = when {
            bat.levelPercent <= 15 -> Tone.BAD.color()
            bat.levelPercent <= 30 -> Tone.WARNING.color()
            else -> Tone.GOOD.color()
        })
        Spacer(Modifier.height(Spacing.sm))
        InfoRow("Temperature", bat.temperatureC.display { Formatters.celsius(it) })
        InfoRow("Voltage", bat.voltageMv.display { Formatters.volts(it) })
        InfoRow("Health", bat.health.label)
        InfoRow("Charging", if (bat.isPluggedIn) bat.source.label else "Not plugged in")
    }
}


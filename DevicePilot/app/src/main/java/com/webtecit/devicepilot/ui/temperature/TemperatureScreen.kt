package com.webtecit.devicepilot.ui.temperature

import android.text.format.DateFormat
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BatteryChargingFull
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.TemperatureHistory
import com.webtecit.devicepilot.data.BatterySnapshot
import com.webtecit.devicepilot.data.SensorReading
import com.webtecit.devicepilot.data.ThermalSnapshot
import com.webtecit.devicepilot.domain.TemperatureUnit
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.domain.ThermalLevel
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LineChart
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.NavRow
import com.webtecit.devicepilot.ui.common.RingGauge
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.chargeStateRes
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.polling
import com.webtecit.devicepilot.ui.common.thermalLabelRes
import com.webtecit.devicepilot.ui.common.thermalLevel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import java.util.Date

data class TemperatureUi(
    val battery: BatterySnapshot,
    val thermal: ThermalSnapshot,
    val zones: List<SensorReading>,
    val history: List<TemperatureHistory.Point>,
    val unit: TemperatureUnit,
)

@OptIn(ExperimentalCoroutinesApi::class)
class TemperatureViewModel(private val c: AppContainer) : ViewModel() {
    val ui = c.settings.settings.map { it.refreshSeconds.coerceAtLeast(2) to it.temperatureUnit }.distinctUntilChanged()
        .flatMapLatest { (sec, unit) ->
            polling(sec * 1000L) {
                val b = c.monitor.battery()
                b.celsius?.let { c.temperatureHistory.add(TemperatureHistory.Point(b.timestamp, it)) }
                TemperatureUi(b, c.monitor.thermal(), c.monitor.thermalZones(), c.temperatureHistory.snapshot(), unit)
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

@Composable
fun TemperatureScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val vm: TemperatureViewModel = viewModel { TemperatureViewModel(c) }
    val state by vm.ui.collectAsStateWithLifecycle()
    val s = state ?: return
    val context = LocalContext.current
    val t = s.battery.celsius
    val level = when {
        s.thermal.supported -> thermalLevel(s.thermal.level)
        t == null -> Level.NEUTRAL
        t >= 45f -> Level.BAD
        t >= 40f -> Level.WARN
        else -> Level.GOOD
    }

    ScreenList {
        item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RingGauge(
                        progress = t?.let { ((it - 15f) / 40f) } ?: 0f,
                        size = 132.dp, stroke = 12.dp, color = levelColor(level),
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(t?.let { TemperatureUtils.format(it, s.unit) } ?: "—",
                                style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text(stringResource(R.string.temp_battery), style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        StatusPill(stringResource(chargeStateRes(s.battery.state)), if (s.battery.isCharging) Level.INFO else Level.NEUTRAL)
                        Spacer(Modifier.height(8.dp))
                        Text(stringResource(R.string.temp_updated, DateFormat.getTimeFormat(context).format(Date(s.battery.timestamp))),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        SourceNote(stringResource(R.string.source_battery_broadcast_long))
                    }
                }
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.temp_thermal_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                if (!s.thermal.supported) {
                    Text(stringResource(R.string.temp_thermal_unsupported), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    StatusPill(stringResource(thermalLabelRes(s.thermal.level)), thermalLevel(s.thermal.level))
                    Spacer(Modifier.height(6.dp))
                    Text(stringResource(thermalExplainRes(s.thermal.level)), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    s.thermal.headroom?.let {
                        InfoRow(stringResource(R.string.temp_headroom), String.format(java.util.Locale.US, "%.2f", it))
                        Text(stringResource(R.string.temp_headroom_explain), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    SourceNote(stringResource(R.string.source_power_manager_long))
                }
            }
        }
        if ((s.thermal.supported && s.thermal.level.code >= ThermalLevel.MODERATE.code) || (t != null && t >= 42f)) item {
            DpCard(color = levelColor(Level.WARN).copy(alpha = 0.10f)) {
                Row {
                    Icon(Icons.Outlined.WarningAmber, null, tint = levelColor(Level.WARN))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(stringResource(R.string.temp_warning_title), style = MaterialTheme.typography.titleSmall)
                        Text(stringResource(R.string.temp_warning_text), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.temp_history), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(8.dp))
                if (s.history.size < 2) {
                    Text(stringResource(R.string.temp_history_collecting), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    LineChart(s.history.map { it.batteryC }, color = levelColor(level))
                    val min = s.history.minOf { it.batteryC }
                    val max = s.history.maxOf { it.batteryC }
                    Text(stringResource(R.string.temp_history_range, TemperatureUtils.format(min, s.unit), TemperatureUtils.format(max, s.unit), s.history.size),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                SourceNote(stringResource(R.string.temp_history_note))
            }
        }
        item { SectionTitle(stringResource(R.string.temp_sensors)) }
        item {
            DpCard {
                if (s.zones.isEmpty()) {
                    Text(stringResource(R.string.temp_sensors_unavailable), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    s.zones.forEach { z ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(z.name, style = MaterialTheme.typography.bodyMedium)
                                Text(stringResource(sensorKindRes(z.name)), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(TemperatureUtils.format(z.celsius, s.unit), style = MaterialTheme.typography.titleSmall)
                        }
                    }
                    SourceNote(stringResource(R.string.temp_sensors_source))
                }
            }
        }
        item {
            DpCard(contentPadding = 6.dp) {
                NavRow(Icons.Outlined.BatteryChargingFull, stringResource(R.string.title_battery), stringResource(R.string.battery_row_sub)) {
                    navigate(Routes.BATTERY)
                }
            }
        }
        item { SourceNote(stringResource(R.string.temp_no_universal_limit)) }
    }
}

private fun thermalExplainRes(l: ThermalLevel) = when (l) {
    ThermalLevel.NONE -> R.string.thermal_none_explain
    ThermalLevel.LIGHT -> R.string.thermal_light_explain
    ThermalLevel.MODERATE -> R.string.thermal_moderate_explain
    ThermalLevel.SEVERE -> R.string.thermal_severe_explain
    ThermalLevel.CRITICAL, ThermalLevel.EMERGENCY, ThermalLevel.SHUTDOWN -> R.string.thermal_critical_explain
    ThermalLevel.UNKNOWN -> R.string.temp_thermal_unsupported
}

private fun sensorKindRes(name: String): Int {
    val n = name.lowercase()
    return when {
        "gpu" in n -> R.string.sensor_gpu
        "cpu" in n || "tsens" in n || "soc" in n || "core" in n || "cluster" in n -> R.string.sensor_cpu
        "batt" in n || "bms" in n -> R.string.sensor_battery
        "skin" in n || "therm" in n || "case" in n -> R.string.sensor_skin
        else -> R.string.sensor_other
    }
}

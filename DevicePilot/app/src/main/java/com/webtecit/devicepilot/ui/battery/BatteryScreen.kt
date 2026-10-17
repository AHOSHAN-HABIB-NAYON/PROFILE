package com.webtecit.devicepilot.ui.battery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BatterySaver
import androidx.compose.material.icons.outlined.Settings
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
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.RingGauge
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.batteryHealthRes
import com.webtecit.devicepilot.ui.common.chargeStateRes
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.polling
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

class BatteryViewModel(c: AppContainer) : ViewModel() {
    val state = combine(polling(3_000) { c.monitor.battery() }, c.settings.settings) { b, s -> b to s.temperatureUnit }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val extras = polling(5_000) { c.details.batteryExtras(c.monitor.battery()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BatteryScreen() {
    val c = LocalContainer.current
    val context = LocalContext.current
    val vm: BatteryViewModel = viewModel { BatteryViewModel(c) }
    val state by vm.state.collectAsStateWithLifecycle()
    val extras by vm.extras.collectAsStateWithLifecycle()
    val (b, unit) = state ?: return
    val na = stringResource(R.string.unavailable)
    val pct = b.percent
    val level = when { pct == null -> Level.NEUTRAL; pct <= 15 -> Level.BAD; pct <= 30 -> Level.WARN; else -> Level.GOOD }

    ScreenList {
        item { extras?.let { HealthHero(b, it) } }
        item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RingGauge((pct ?: 0) / 100f, size = 120.dp, color = levelColor(level)) {
                        Text(pct?.let { "$it%" } ?: "—", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(16.dp))
                    androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                        StatusPill(stringResource(chargeStateRes(b.state)), if (b.isCharging) Level.INFO else Level.NEUTRAL)
                        Spacer(Modifier.height(6.dp))
                        b.plugged?.let { Text(stringResource(R.string.battery_plugged, it), style = MaterialTheme.typography.bodySmall) }
                        b.powerSave?.let {
                            Text(stringResource(if (it) R.string.battery_saver_on else R.string.battery_saver_off),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        item {
            DpCard {
                InfoRow(stringResource(R.string.battery_temperature), b.celsius?.let { TemperatureUtils.format(it, unit) } ?: na)
                InfoRow(stringResource(R.string.battery_voltage), b.voltageMv?.let { "$it mV" } ?: na)
                InfoRow(stringResource(R.string.battery_current), b.currentNowMa?.let { "$it mA" } ?: na)
                InfoRow(stringResource(R.string.battery_charge_counter), b.chargeCounterMah?.let { "$it mAh" } ?: na)
                InfoRow(stringResource(R.string.battery_technology), b.technology ?: na)
                InfoRow(stringResource(R.string.battery_health_reported), stringResource(batteryHealthRes(b.health)))
                InfoRow(stringResource(R.string.battery_cycles), b.cycleCount?.toString() ?: stringResource(R.string.battery_cycles_unavailable))
                SourceNote(stringResource(R.string.battery_source))
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.battery_tips_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.battery_tips), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.action_battery_settings), Icons.Outlined.Settings) { SystemSettings.batterySettings(context) }
                    ShortcutButton(stringResource(R.string.action_battery_saver), Icons.Outlined.BatterySaver) { SystemSettings.batterySaver(context) }
                    ShortcutButton(stringResource(R.string.action_battery_optimization), Icons.Outlined.BatterySaver) { SystemSettings.batteryOptimization(context) }
                }
            }
        }
        item { HeroCard(R.drawable.ill_battery, stringResource(R.string.battery_lifespan_title), stringResource(R.string.battery_lifespan_text)) }
    }
}


@Composable
private fun HealthHero(b: com.webtecit.devicepilot.data.BatterySnapshot, x: com.webtecit.devicepilot.data.BatteryExtras) {
    val na = stringResource(R.string.unavailable)
    androidx.compose.foundation.layout.Box(
        Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(androidx.compose.ui.graphics.Color(0xFF16A34A), androidx.compose.ui.graphics.Color(0xFF0B1B3F))))
            .padding(18.dp)
    ) {
        androidx.compose.foundation.layout.Column {
            Text(stringResource(R.string.bh_title), style = MaterialTheme.typography.labelLarge, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.85f))
            Text(stringResource(batteryHealthRes(b.health)), style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.White)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeroBox(stringResource(R.string.bh_cycles), x.cycleCount?.toString() ?: "—", Modifier.weight(1f))
                HeroBox(stringResource(R.string.bh_capacity), x.healthPercent?.let { "$it%" } ?: "—", Modifier.weight(1f))
                HeroBox(stringResource(R.string.bh_charging_power),
                    x.chargingPowerW?.let { String.format(java.util.Locale.US, "%.1f W", it) } ?: "—", Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            HeroLine(stringResource(R.string.dd_design_capacity), x.designCapacityMah?.let { "$it mAh" } ?: na)
            HeroLine(stringResource(R.string.dd_estimated_capacity), (x.fullCapacityMah ?: x.estimatedFullMah)?.let { "$it mAh" } ?: na)
            HeroLine(stringResource(R.string.dd_charger_max), x.chargerMaxW?.let { String.format(java.util.Locale.US, "%.1f W", it) }
                ?: stringResource(R.string.dd_charger_not_reported))
            Spacer(Modifier.height(6.dp))
            Text(
                listOfNotNull(x.cycleSource?.let { "Cycles: $it" }, x.healthSource?.let { "Capacity: $it" })
                    .joinToString(" · ").ifBlank { stringResource(R.string.bh_source_none) },
                style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun HeroBox(label: String, value: String, modifier: Modifier) {
    androidx.compose.foundation.layout.Column(
        modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp)).background(androidx.compose.ui.graphics.Color.White.copy(alpha = 0.15f)).padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.White)
        Text(label, style = MaterialTheme.typography.labelSmall, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.8f))
    }
}

@Composable
private fun HeroLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.8f))
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = androidx.compose.ui.graphics.Color.White)
    }
}

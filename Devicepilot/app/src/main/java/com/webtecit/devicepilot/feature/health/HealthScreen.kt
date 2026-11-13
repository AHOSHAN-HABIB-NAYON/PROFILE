package com.webtecit.devicepilot.feature.health

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LinearMeter
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.MetricRing
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.designsystem.color
import com.webtecit.devicepilot.core.designsystem.toneForTemperature
import com.webtecit.devicepilot.core.designsystem.toneForUsage
import com.webtecit.devicepilot.core.navigation.Routes
import com.webtecit.devicepilot.domain.model.BatteryHealth
import com.webtecit.devicepilot.domain.usecase.HealthScoreCalculator
import com.webtecit.devicepilot.feature.dashboard.LiveViewModel
import com.webtecit.devicepilot.feature.dashboard.healthTone
import kotlin.math.abs

@Composable
fun HealthScreen(navigate: (String) -> Unit, viewModel: LiveViewModel = hiltViewModel()) {
    val snap by viewModel.snapshot.collectAsStateWithLifecycle()
    var showMethod by rememberSaveable { mutableStateOf(false) }

    DpScaffold(
        title = "Device Health",
        onBack = null,
        actions = {
            IconButton(onClick = { showMethod = true }) { Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = "How the score works") }
        },
    ) { padding ->
        val s = snap
        if (s == null) {
            LoadingState(modifier = Modifier.fillMaxSize())
            return@DpScaffold
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl,
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                val tone = healthTone(s.health)
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MetricRing((s.health.score ?: 0) / 100f, size = 120.dp, color = tone.color()) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(s.health.score?.toString() ?: "—", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                                Text("of 100", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.width(Spacing.lg))
                        Column(Modifier.weight(1f)) {
                            Text("Overall health", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(4.dp))
                            StatusChip(s.health.label, tone)
                            Spacer(Modifier.height(Spacing.sm))
                            NoteText("Based on ${s.health.components.size} measured values.")
                            TextButton(onClick = { showMethod = true }) { Text("How is this calculated?") }
                        }
                    }
                    s.health.components.forEach { c ->
                        Spacer(Modifier.height(Spacing.sm))
                        Row(Modifier.fillMaxWidth()) {
                            Text(c.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                            Text("${c.detail} · ${c.score}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(4.dp))
                        LinearMeter(c.score / 100f, color = scoreTone(c.score).color())
                    }
                    if (s.health.missing.isNotEmpty()) {
                        Spacer(Modifier.height(Spacing.md))
                        NoteText("Not reported by this device: ${s.health.missing.joinToString()}")
                    }
                }
            }
            item { Legend() }

            val bat = s.battery
            item {
                DpCard(onClick = { navigate(Routes.CHARGING) }) {
                    SectionHeader("Battery")
                    if (bat == null) {
                        InfoRow("Battery", "Not Available")
                    } else {
                        InfoRow("Battery health", bat.health.label, valueColor = batteryHealthTone(bat.health).color())
                        InfoRow("Level", "${bat.levelPercent}%")
                        InfoRow("Status", bat.chargeState.label)
                        ReadingRow("Temperature", bat.temperatureC) { Formatters.celsius(it) }
                        ReadingRow("Voltage", bat.voltageMv) { Formatters.volts(it) }
                        ReadingRow("Technology", bat.technology) { it }
                        ReadingRow("Cycle count", bat.cycleCount) { it.toString() }
                        ReadingRow(if (bat.isCharging) "Charging current" else "Discharge current", bat.currentNowUa) { Formatters.milliAmps(abs(it)) }
                        ReadingRow("Capacity", bat.capacityEstimateMah) { "$it mAh" }
                        Spacer(Modifier.height(Spacing.xs))
                        NoteText("Cycle count is available on Android 14+ only where the manufacturer reports it. Capacity is estimated from the charge counter and is not the design capacity.")
                    }
                }
            }
            item {
                DpCard(onClick = { navigate(Routes.RAM_BOOST) }) {
                    SectionHeader("RAM condition")
                    InfoRow("Used", "${Formatters.bytes(s.memory.usedBytes)} of ${Formatters.bytes(s.memory.totalBytes)}")
                    InfoRow("Available", Formatters.bytes(s.memory.availableBytes))
                    InfoRow("Low-memory state", if (s.memory.lowMemory) "Yes" else "No", valueColor = if (s.memory.lowMemory) Tone.BAD.color() else Tone.GOOD.color())
                    Spacer(Modifier.height(Spacing.xs))
                    LinearMeter(s.memory.usedFraction, color = toneForUsage(s.memory.usedFraction).color())
                }
            }
            item {
                DpCard(onClick = { navigate(Routes.STORAGE) }) {
                    SectionHeader("Storage condition")
                    InfoRow("Used", "${Formatters.bytes(s.storage.usedBytes)} of ${Formatters.bytes(s.storage.totalBytes)}")
                    InfoRow("Free", "${Formatters.bytes(s.storage.freeBytes)} (${Formatters.percent(s.storage.freeFraction * 100)})")
                    Spacer(Modifier.height(Spacing.xs))
                    LinearMeter(s.storage.usedFraction, color = toneForUsage(s.storage.usedFraction).color())
                    if (s.storage.freeFraction < 0.1f) {
                        Spacer(Modifier.height(Spacing.sm))
                        NoteText("Less than 10% free. Android can slow down and app updates may fail when storage is this low.")
                    }
                }
            }
            item {
                DpCard(onClick = { navigate(Routes.PERFORMANCE) }) {
                    SectionHeader("CPU & thermal")
                    ReadingRow("CPU load", s.cpu.load) { Formatters.percent(it) }
                    ReadingRow("CPU temperature", s.cpu.temperatureC) { Formatters.celsius(it) }
                    ReadingRow("Thermal status", s.thermal.level) { it.label }
                    ReadingRow("Thermal headroom", s.thermal.headroom) { Formatters.percent(it * 100) + " of throttling limit" }
                    Spacer(Modifier.height(Spacing.xs))
                    NoteText("Android 8+ hides overall CPU usage from apps. The load shown is estimated from core frequencies when the device exposes them.")
                }
            }
            item {
                val temp = bat?.temperatureC?.valueOrNull
                if (temp != null) {
                    DpCard(onClick = { navigate(Routes.COOLING) }) {
                        SectionHeader("Battery temperature")
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(Formatters.celsius(temp), style = MaterialTheme.typography.headlineSmall, color = toneForTemperature(temp).color(), modifier = Modifier.weight(1f))
                            StatusChip(
                                when (toneForTemperature(temp)) { Tone.BAD -> "Hot"; Tone.WARNING -> "Warm"; else -> "Normal" },
                                toneForTemperature(temp),
                            )
                        }
                    }
                }
            }
        }
    }

    if (showMethod) {
        AlertDialog(
            onDismissRequest = { showMethod = false },
            confirmButton = { TextButton(onClick = { showMethod = false }) { Text("Got it") } },
            title = { Text("How the health score works") },
            text = { Text(HealthScoreCalculator.METHODOLOGY) },
        )
    }
}

@Composable
private fun Legend() {
    DpCard {
        Text("Reading the values", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(Spacing.xs))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            StatusChip("Measured", Tone.GOOD); StatusChip("Est.", Tone.INFO); StatusChip("Not Available", Tone.NEUTRAL)
        }
        Spacer(Modifier.height(Spacing.xs))
        NoteText("Measured values come straight from Android. Estimated values are calculated and marked. Devicepilot never invents values your phone does not report.")
    }
}

private fun scoreTone(score: Int) = when {
    score >= 70 -> Tone.GOOD
    score >= 50 -> Tone.WARNING
    else -> Tone.BAD
}

private fun batteryHealthTone(h: BatteryHealth) = when (h) {
    BatteryHealth.GOOD -> Tone.GOOD
    BatteryHealth.UNKNOWN -> Tone.NEUTRAL
    BatteryHealth.COLD -> Tone.WARNING
    else -> Tone.BAD
}


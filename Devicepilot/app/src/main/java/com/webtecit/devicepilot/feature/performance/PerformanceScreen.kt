package com.webtecit.devicepilot.feature.performance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.designsystem.BigValue
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LineChart
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.LiveSnapshot
import com.webtecit.devicepilot.data.repository.LiveStatusRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val HISTORY = 60

@Immutable
data class PerfHistory(
    val latest: LiveSnapshot? = null,
    val cpu: List<Float> = emptyList(),
    val ram: List<Float> = emptyList(),
    val temp: List<Float> = emptyList(),
    val rx: List<Float> = emptyList(),
    val tx: List<Float> = emptyList(),
) {
    fun plus(s: LiveSnapshot) = PerfHistory(
        latest = s,
        cpu = (cpu + (s.cpu.load.valueOrNull ?: 0f)).takeLast(HISTORY),
        ram = (ram + s.memory.usedFraction * 100f).takeLast(HISTORY),
        temp = (temp + (s.battery?.temperatureC?.valueOrNull ?: 0f)).takeLast(HISTORY),
        rx = (rx + (s.traffic?.rxBytesPerSec?.toFloat() ?: 0f)).takeLast(HISTORY),
        tx = (tx + (s.traffic?.txBytesPerSec?.toFloat() ?: 0f)).takeLast(HISTORY),
    )
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PerformanceViewModel @Inject constructor(
    live: LiveStatusRepository,
    private val settings: SettingsRepository,
) : ViewModel() {
    val paused = MutableStateFlow(false)
    val interval: StateFlow<Long> = settings.settings.map { it.refreshIntervalMs }.distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 2_000)

    /** Pausing stops the polling loop entirely, so no battery is used while paused. */
    val history: StateFlow<PerfHistory> = combine(paused, interval) { p, i -> p to i }
        .flatMapLatest { (p, i) -> if (p) emptyFlow() else live.snapshots(i) }
        .runningFold(PerfHistory()) { acc, s -> acc.plus(s) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PerfHistory())

    fun togglePause() { paused.value = !paused.value }
    fun setInterval(ms: Long) { viewModelScope.launch { settings.setRefreshInterval(ms) } }
}

@Composable
fun PerformanceScreen(onBack: () -> Unit, viewModel: PerformanceViewModel = hiltViewModel()) {
    val h by viewModel.history.collectAsStateWithLifecycle()
    val paused by viewModel.paused.collectAsStateWithLifecycle()
    val interval by viewModel.interval.collectAsStateWithLifecycle()

    DpScaffold("Performance Monitor", onBack, actions = {
        IconButton(onClick = viewModel::togglePause) {
            Icon(if (paused) Icons.Default.PlayArrow else Icons.Default.Pause, contentDescription = if (paused) "Resume monitoring" else "Pause monitoring")
        }
    }) { padding ->
        val s = h.latest
        if (s == null) {
            LoadingState(modifier = Modifier.fillMaxSize()); return@DpScaffold
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    listOf(1_000L to "1 s", 2_000L to "2 s", 5_000L to "5 s").forEach { (ms, label) ->
                        FilterChip(selected = interval == ms, onClick = { viewModel.setInterval(ms) }, label = { Text("Every $label") })
                    }
                }
                if (paused) NoteText("Monitoring paused — no readings are being taken.", Modifier.padding(top = 4.dp))
            }
            item {
                GraphCard(
                    title = "CPU load",
                    subtitle = if (s.cpu.load is Reading.Unavailable) "CPU usage is ${(s.cpu.load as Reading.Unavailable).reason.label.lowercase()} on this device" else "Estimated from core frequencies",
                    value = s.cpu.load.valueOrNull?.let { Formatters.percent(it) } ?: "—",
                    values = h.cpu, max = 100f, color = Brand.Green,
                )
            }
            item {
                DpCard {
                    SectionHeader("CPU cores", subtitle = "${s.cpu.coreCount} cores")
                    if (s.cpu.cores.all { it.currentKhz == null }) {
                        InfoRow("Core frequencies", "Restricted by Android")
                    } else {
                        s.cpu.cores.forEach { c ->
                            InfoRow("Core ${c.core}", buildString {
                                append(c.currentKhz?.let { Formatters.mhz(it) } ?: "Offline")
                                c.maxKhz?.let { append(" / ${Formatters.mhz(it)}") }
                            })
                        }
                    }
                    ReadingRow("CPU temperature", s.cpu.temperatureC) { Formatters.celsius(it) + (s.cpu.temperatureSource?.let { src -> " ($src)" } ?: "") }
                    if (s.cpu.temperatureC is Reading.Unavailable) {
                        NoteText("This device does not let apps read the CPU temperature. Battery temperature is shown below instead and is labelled as such.")
                    }
                }
            }
            item {
                GraphCard("RAM used", "${Formatters.bytes(s.memory.usedBytes)} of ${Formatters.bytes(s.memory.totalBytes)} · ${Formatters.bytes(s.memory.availableBytes)} available",
                    Formatters.percent(s.memory.usedFraction * 100), h.ram, 100f, Brand.Teal)
            }
            item {
                GraphCard("Battery temperature", "Reported by the battery sensor",
                    s.battery?.temperatureC?.display { Formatters.celsius(it) } ?: "—", h.temp, 60f, Brand.Amber)
            }
            item {
                DpCard {
                    SectionHeader("Network activity", subtitle = "All apps, from TrafficStats")
                    Row(Modifier.fillMaxWidth()) {
                        BigValue(s.traffic?.let { Formatters.rate(it.rxBytesPerSec) } ?: "Not Supported", "Download", Modifier.weight(1f), Brand.Green)
                        BigValue(s.traffic?.let { Formatters.rate(it.txBytesPerSec) } ?: "Not Supported", "Upload", Modifier.weight(1f), Brand.Teal)
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    val max = ((h.rx + h.tx).maxOrNull() ?: 1f).coerceAtLeast(1024f)
                    LineChart(h.rx, maxValue = max, color = Brand.Green, height = 90.dp)
                    LineChart(h.tx, maxValue = max, color = Brand.Teal, height = 60.dp)
                    InfoRow("Connection", s.network?.type?.label ?: "—")
                    s.network?.wifi?.let { w ->
                        ReadingRow("Wi-Fi signal", w.rssiDbm) { "$it dBm" }
                        ReadingRow("Wi-Fi link speed", w.linkSpeedMbps) { "$it Mbps" }
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("Storage & thermal")
                    InfoRow("Storage used", "${Formatters.bytes(s.storage.usedBytes)} / ${Formatters.bytes(s.storage.totalBytes)}")
                    ReadingRow("Thermal status", s.thermal.level) { it.label }
                    ReadingRow("Thermal headroom", s.thermal.headroom) { Formatters.percent(it * 100) }
                }
            }
        }
    }
}

@Composable
private fun GraphCard(title: String, subtitle: String, value: String, values: List<Float>, max: Float, color: Color) {
    DpCard {
        Row(Modifier.fillMaxWidth()) {
            SectionHeader(title, Modifier.weight(1f), subtitle = subtitle)
            Text(value, style = MaterialTheme.typography.titleLarge, color = color)
        }
        Spacer(Modifier.height(Spacing.sm))
        LineChart(values, maxValue = max, color = color)
    }
}

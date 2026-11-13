package com.webtecit.devicepilot.feature.battery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.EmptyState
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LineChart
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.MetricRing
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.designsystem.color
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.BatteryRepository
import com.webtecit.devicepilot.data.repository.ChargingHistoryRepository
import com.webtecit.devicepilot.domain.model.BatteryStatus
import com.webtecit.devicepilot.domain.model.ChargingSession
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.abs

data class ChargingUi(val status: BatteryStatus? = null, val currentMa: List<Float> = emptyList(), val levels: List<Float> = emptyList())

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ChargingViewModel @Inject constructor(
    battery: BatteryRepository,
    private val history: ChargingHistoryRepository,
    settings: SettingsRepository,
) : ViewModel() {

    val ui: StateFlow<ChargingUi> = settings.settings.map { it.refreshIntervalMs }.distinctUntilChanged()
        .flatMapLatest { battery.observe(it) }
        .filterNotNull()
        .onEach { runCatching { history.sample(it) } }
        .runningFold(ChargingUi()) { acc, s ->
            ChargingUi(
                status = s,
                currentMa = (acc.currentMa + (s.currentNowUa.valueOrNull?.let { abs(it) / 1000f } ?: 0f)).takeLast(60),
                levels = (acc.levels + s.levelPercent.toFloat()).takeLast(60),
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChargingUi())

    val sessions: StateFlow<List<ChargingSession>> = history.recent(30)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun clearHistory() { viewModelScope.launch { history.clear() } }
}

@Composable
fun ChargingScreen(onBack: () -> Unit, viewModel: ChargingViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val sessions by viewModel.sessions.collectAsStateWithLifecycle()
    var confirmClear by remember { mutableStateOf(false) }

    DpScaffold("Battery & Charging", onBack, actions = {
        if (sessions.isNotEmpty()) IconButton(onClick = { confirmClear = true }) { Icon(Icons.Default.DeleteSweep, contentDescription = "Clear charging history") }
    }) { padding ->
        val b = ui.status
        if (b == null) { LoadingState(modifier = Modifier.fillMaxSize()); return@DpScaffold }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                val tone = when {
                    b.isCharging -> Tone.GOOD
                    b.levelPercent <= 15 -> Tone.BAD
                    b.levelPercent <= 30 -> Tone.WARNING
                    else -> Tone.GOOD
                }
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MetricRing(b.levelPercent / 100f, size = 128.dp, color = tone.color()) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("${b.levelPercent}%", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                                Text(b.chargeState.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.width(Spacing.lg))
                        Column(Modifier.weight(1f)) {
                            StatusChip(if (b.isPluggedIn) b.source.label else "On battery", if (b.isPluggedIn) Tone.GOOD else Tone.NEUTRAL)
                            Spacer(Modifier.height(Spacing.sm))
                            ReadingRow("Full in", b.chargeTimeRemainingMs) { Formatters.duration(it) }
                            ReadingRow("Temp", b.temperatureC) { Formatters.celsius(it) }
                        }
                    }
                    if (b.isCharging && b.chargeTimeRemainingMs is Reading.Unavailable) {
                        NoteText("Android has not produced a reliable time-to-full estimate yet, so none is shown.")
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader(if (b.isCharging) "Charging current" else "Battery current", subtitle = "Live, from BatteryManager")
                    val reading = b.currentNowUa
                    Text(
                        reading.display { Formatters.milliAmps(abs(it)) },
                        style = MaterialTheme.typography.headlineSmall,
                        color = Brand.Green,
                    )
                    Spacer(Modifier.height(Spacing.sm))
                    if (reading !is Reading.Unavailable) {
                        LineChart(ui.currentMa, color = Brand.Green, height = 100.dp)
                        b.voltageMv.valueOrNull?.let { mv ->
                            reading.valueOrNull?.let { ua ->
                                InfoRow("Power (est.)", String.format(java.util.Locale.US, "%.1f W", abs(ua) / 1_000_000.0 * mv / 1000.0))
                            }
                        }
                    }
                    NoteText("Charging speed depends on the charger, cable, temperature and battery level. Some phones do not report current, or report it in a different unit — those values are marked as unavailable or estimated.")
                }
            }
            item {
                DpCard {
                    SectionHeader("Battery details")
                    InfoRow("Status", b.chargeState.label)
                    InfoRow("Power source", b.source.label)
                    InfoRow("Health", b.health.label)
                    ReadingRow("Voltage", b.voltageMv) { Formatters.volts(it) }
                    ReadingRow("Temperature", b.temperatureC) { Formatters.celsius(it) }
                    ReadingRow("Technology", b.technology) { it }
                    ReadingRow("Charge counter", b.chargeCounterUah) { "${it / 1000} mAh" }
                    ReadingRow("Capacity", b.capacityEstimateMah) { "$it mAh" }
                    ReadingRow("Cycle count", b.cycleCount) { it.toString() }
                }
            }
            item {
                DpCard {
                    SectionHeader("Battery level", subtitle = "Since this screen opened")
                    LineChart(ui.levels, maxValue = 100f, color = Brand.Teal, height = 90.dp)
                }
            }
            item { SectionHeader("Charging history", subtitle = "Recorded on this phone, kept for 90 days") }
            if (sessions.isEmpty()) {
                item { EmptyState("No charging sessions yet", "Plug in your charger. Devicepilot records when charging starts and stops, and the peak temperature.") }
            }
            items(sessions, key = { it.id }) { session -> SessionCard(session) }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear charging history?") },
            text = { Text("This deletes all ${sessions.size} recorded charging sessions from this phone.") },
            confirmButton = { TextButton(onClick = { viewModel.clearHistory(); confirmClear = false }) { Text("Clear history") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SessionCard(s: ChargingSession) {
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(Formatters.dateTime(s.startTime), style = MaterialTheme.typography.titleSmall)
                NoteText(s.source)
            }
            if (s.endTime == null) StatusChip("In progress", Tone.GOOD)
            else Text(Formatters.duration(s.endTime - s.startTime), style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.height(Spacing.xs))
        InfoRow("Level", "${s.startLevel}% → ${s.endLevel?.let { "$it%" } ?: "…"}")
        s.maxTemperatureC?.let { InfoRow("Peak temperature", Formatters.celsius(it)) }
    }
}

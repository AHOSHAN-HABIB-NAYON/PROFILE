package com.webtecit.devicepilot.feature.network

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CellTower
import androidx.compose.material.icons.filled.Lan
import androidx.compose.material.icons.filled.SignalWifiOff
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.AppInfo
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.BigValue
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.data.repository.NetworkRepository
import com.webtecit.devicepilot.data.repository.SpeedTestRepository
import com.webtecit.devicepilot.domain.model.ConnectionType
import com.webtecit.devicepilot.domain.model.NetworkStatus
import com.webtecit.devicepilot.domain.model.TrafficSnapshot
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SpeedTestUi(
    val running: Boolean = false,
    val phase: String? = null,
    val fraction: Float = 0f,
    val liveBps: Double = 0.0,
    val pingMs: List<Long>? = null,
    val downloadBps: Double? = null,
    val uploadBps: Double? = null,
    val dataUsedBytes: Long = 0,
    val error: String? = null,
    val publicIp: Map<String, String>? = null,
)

@HiltViewModel
class NetworkViewModel @Inject constructor(
    network: NetworkRepository,
    private val speed: SpeedTestRepository,
) : ViewModel() {
    val status: StateFlow<NetworkStatus?> = network.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val traffic: StateFlow<TrafficSnapshot?> = network.traffic(1_000).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val test = MutableStateFlow(SpeedTestUi())
    private var job: Job? = null

    fun runPing() {
        job?.cancel()
        job = viewModelScope.launch {
            test.update { it.copy(running = true, phase = "Ping", error = null) }
            val samples = speed.ping()
            test.update { it.copy(running = false, phase = null, pingMs = samples, error = if (samples.isEmpty()) "No response — check your connection" else null) }
        }
    }

    fun runSpeedTest() {
        job?.cancel()
        job = viewModelScope.launch {
            test.value = SpeedTestUi(running = true, phase = "Ping", publicIp = test.value.publicIp)
            try {
                val ping = speed.ping()
                test.update { it.copy(pingMs = ping) }
                val down = speed.download { p ->
                    if (p is SpeedTestRepository.Progress.Running) test.update { it.copy(phase = p.phase, fraction = p.fraction, liveBps = p.currentBps) }
                }
                test.update { it.copy(downloadBps = down.bitsPerSecond, dataUsedBytes = down.bytes) }
                val up = speed.upload { p ->
                    if (p is SpeedTestRepository.Progress.Running) test.update { it.copy(phase = p.phase, fraction = p.fraction, liveBps = p.currentBps) }
                }
                test.update { it.copy(uploadBps = up.bitsPerSecond, dataUsedBytes = it.dataUsedBytes + up.bytes, running = false, phase = null) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                test.update { it.copy(running = false, phase = null) }
                throw e
            } catch (e: Exception) {
                test.update { it.copy(running = false, phase = null, error = "Speed test failed: ${e.message ?: "network error"}") }
            }
        }
    }

    fun cancel() {
        job?.cancel()
        test.update { it.copy(running = false, phase = null) }
    }

    fun loadPublicIp() {
        viewModelScope.launch {
            val info = runCatching { speed.publicIpInfo() }.getOrNull()
            test.update { it.copy(publicIp = info ?: mapOf("error" to "Could not reach the server")) }
        }
    }
}

@Composable
fun NetworkScreen(onBack: () -> Unit, viewModel: NetworkViewModel = hiltViewModel()) {
    val status by viewModel.status.collectAsStateWithLifecycle()
    val traffic by viewModel.traffic.collectAsStateWithLifecycle()
    val t by viewModel.test.collectAsStateWithLifecycle()
    val context = LocalContext.current

    DpScaffold("Internet & Network", onBack) { padding ->
        val s = status
        if (s == null) { LoadingState(modifier = Modifier.fillMaxSize()); return@DpScaffold }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(
                            when (s.type) {
                                ConnectionType.WIFI -> Icons.Default.Wifi
                                ConnectionType.CELLULAR -> Icons.Default.CellTower
                                ConnectionType.VPN -> Icons.Default.VpnKey
                                ConnectionType.NONE -> Icons.Default.SignalWifiOff
                                else -> Icons.Default.Lan
                            },
                            if (s.connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.width(Spacing.md))
                        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                            Text(s.type.label, style = MaterialTheme.typography.titleMedium)
                            NoteText(if (!s.connected) "No internet connection" else if (s.validated) "Connected to the internet" else "Connected, internet not verified")
                        }
                        StatusChip(if (s.connected && s.validated) "Online" else "Offline", if (s.connected && s.validated) Tone.GOOD else Tone.BAD)
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    InfoRow("Metered", if (s.metered) "Yes (data may cost money)" else "No")
                    ReadingRow("Link estimate ↓", s.downstreamKbps) { Formatters.mbps(it * 1000.0) }
                    ReadingRow("Link estimate ↑", s.upstreamKbps) { Formatters.mbps(it * 1000.0) }
                }
            }
            s.wifi?.let { w ->
                item {
                    DpCard {
                        SectionHeader("Wi-Fi")
                        ReadingRow("Network name", w.ssid) { it }
                        ReadingRow("Signal", w.rssiDbm) { "$it dBm (${signalLabel(it)})" }
                        ReadingRow("Link speed", w.linkSpeedMbps) { "$it Mbps" }
                        ReadingRow("Frequency", w.frequencyMhz) { "$it MHz (${if (it > 5900) "6 GHz" else if (it > 4900) "5 GHz" else "2.4 GHz"})" }
                        ReadingRow("Standard", w.standard) { it }
                        NoteText("Android hides the Wi-Fi name from apps without location permission. Devicepilot does not ask for your location.")
                        Spacer(Modifier.height(Spacing.xs))
                        OutlinedButton(onClick = { SystemIntents.wifi(context) }) { Text("Wi-Fi settings") }
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("Speed test", subtitle = "Runs only when you start it · uses about 33 MB of data")
                    if (t.running) {
                        Text("${t.phase ?: "Testing"}… ${Formatters.mbps(t.liveBps)}", style = MaterialTheme.typography.titleMedium, color = Brand.Green)
                        Spacer(Modifier.height(Spacing.xs))
                        LinearProgressIndicator(progress = { t.fraction }, modifier = Modifier.fillMaxWidth())
                    }
                    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm)) {
                        BigValue(t.pingMs?.takeIf { it.isNotEmpty() }?.let { "${it.average().toLong()} ms" } ?: "—", "Ping", Modifier.weight(1f))
                        BigValue(t.downloadBps?.let { Formatters.mbps(it) } ?: "—", "Download", Modifier.weight(1f), Brand.Green)
                        BigValue(t.uploadBps?.let { Formatters.mbps(it) } ?: "—", "Upload", Modifier.weight(1f), Brand.Teal)
                    }
                    t.pingMs?.takeIf { it.size > 1 }?.let { p ->
                        InfoRow("Jitter", "${(p.max() - p.min())} ms")
                    }
                    t.error?.let { NoteText(it) }
                    if (s.metered && !t.running) NoteText("You are on a metered connection. The test uses mobile data.")
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        if (t.running) OutlinedButton(onClick = viewModel::cancel) { Text("Stop") }
                        else {
                            Button(onClick = viewModel::runSpeedTest, enabled = s.connected) { Text("Start speed test") }
                            OutlinedButton(onClick = viewModel::runPing, enabled = s.connected) { Text("Ping only") }
                        }
                    }
                    if (t.dataUsedBytes > 0) NoteText("Data used by the last test: ${Formatters.bytes(t.dataUsedBytes)}")
                    NoteText("Test server: ${AppInfo.SPEED_TEST_HOST}. Ping is measured as the time to open a connection to 1.1.1.1.")
                }
            }
            item {
                DpCard {
                    SectionHeader("Live traffic", subtitle = "All apps on this phone")
                    Row(Modifier.fillMaxWidth()) {
                        BigValue(traffic?.let { Formatters.rate(it.rxBytesPerSec) } ?: "—", "Receiving", Modifier.weight(1f))
                        BigValue(traffic?.let { Formatters.rate(it.txBytesPerSec) } ?: "—", "Sending", Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    traffic?.let {
                        InfoRow("Received since boot", Formatters.bytes(it.totalRx))
                        InfoRow("Sent since boot", Formatters.bytes(it.totalTx))
                    }
                    OutlinedButton(onClick = { SystemIntents.dataUsage(context) }) { Text("Data usage settings") }
                }
            }
            item {
                DpCard {
                    SectionHeader("Network information")
                    InfoRow("Interface", s.interfaceName ?: "—")
                    if (s.localAddresses.isEmpty()) InfoRow("Local IP", "Not Available")
                    s.localAddresses.forEach { InfoRow(if (it.contains(':')) "Local IPv6" else "Local IPv4", it) }
                    s.dnsServers.forEach { InfoRow("DNS server", it) }
                    Spacer(Modifier.height(Spacing.sm))
                    val ip = t.publicIp
                    if (ip == null) {
                        OutlinedButton(onClick = viewModel::loadPublicIp, enabled = s.connected) { Text("Show public IP") }
                        NoteText("Asks ${AppInfo.SPEED_TEST_HOST} which IP address it sees. Nothing else is sent.")
                    } else {
                        ip["error"]?.let { NoteText(it) }
                        ip["ip"]?.let { InfoRow("Public IP", it) }
                        ip["loc"]?.let { InfoRow("Country", it) }
                        ip["colo"]?.let { InfoRow("Nearest server", it) }
                    }
                }
            }
        }
    }
}

private fun signalLabel(dbm: Int) = when {
    dbm >= -55 -> "excellent"
    dbm >= -67 -> "good"
    dbm >= -75 -> "fair"
    else -> "weak"
}


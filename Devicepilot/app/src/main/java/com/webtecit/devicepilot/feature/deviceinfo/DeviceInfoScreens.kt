package com.webtecit.devicepilot.feature.deviceinfo

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeveloperBoard
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.ScreenshotMonitor
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.ErrorState
import com.webtecit.devicepilot.core.designsystem.ExpandableSection
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.data.repository.DeviceInfoRepository
import com.webtecit.devicepilot.data.repository.ReportExporter
import com.webtecit.devicepilot.domain.model.DisplayInfo
import com.webtecit.devicepilot.domain.model.InfoSection
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

sealed interface DeviceInfoUi {
    data object Loading : DeviceInfoUi
    data class Ready(val sections: List<InfoSection>) : DeviceInfoUi
    data class Error(val message: String) : DeviceInfoUi
}

@HiltViewModel
class DeviceInfoViewModel @Inject constructor(
    val repo: DeviceInfoRepository,
    private val exporter: ReportExporter,
) : ViewModel() {
    private val _ui = MutableStateFlow<DeviceInfoUi>(DeviceInfoUi.Loading)
    val ui: StateFlow<DeviceInfoUi> = _ui.asStateFlow()
    val messages = MutableStateFlow<String?>(null)

    init { load() }

    fun load() {
        viewModelScope.launch {
            _ui.value = DeviceInfoUi.Loading
            _ui.value = try {
                DeviceInfoUi.Ready(repo.report())
            } catch (e: Exception) {
                DeviceInfoUi.Error(e.message ?: "Could not read device information")
            }
        }
    }

    fun text(): String? = (ui.value as? DeviceInfoUi.Ready)?.let { repo.reportAsText(it.sections) }

    fun exportText(uri: android.net.Uri) = export { exporter.writeText(uri, text().orEmpty()) }

    fun exportPdf(uri: android.net.Uri) = export {
        exporter.writePdf(uri, (ui.value as? DeviceInfoUi.Ready)?.sections.orEmpty())
    }

    private fun export(block: suspend () -> Unit) {
        viewModelScope.launch {
            messages.value = try {
                block(); "Report saved"
            } catch (e: Exception) {
                "Could not save the report"
            }
        }
    }

    fun display(): DisplayInfo = repo.display()
}

private fun iconFor(title: String): ImageVector = when (title) {
    "Device" -> Icons.Default.PhoneAndroid
    "Software" -> Icons.Default.Settings
    "Processor" -> Icons.Default.DeveloperBoard
    "Memory & Storage" -> Icons.Default.Memory
    "Display" -> Icons.Default.ScreenshotMonitor
    "Battery" -> Icons.Default.BatteryFull
    "Cameras" -> Icons.Default.CameraAlt
    "Sensors" -> Icons.Default.Sensors
    "Network" -> Icons.Default.Wifi
    else -> Icons.Default.PhoneAndroid
}

private fun copyToClipboard(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("Device report", text))
}

@Composable
fun DeviceInfoScreen(onBack: () -> Unit, viewModel: DeviceInfoViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val msg by viewModel.messages.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }
    val stamp = remember { SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(Date()) }

    val saveTxt = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri -> uri?.let(viewModel::exportText) }
    val savePdf = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri -> uri?.let(viewModel::exportPdf) }

    LaunchedEffect(msg) { msg?.let { snackbar.showSnackbar(it); viewModel.messages.value = null } }

    DpScaffold("Phone Details", onBack, snackbarHostState = snackbar, actions = {
        IconButton(onClick = {
            viewModel.text()?.let { copyToClipboard(context, it); scope.launch { snackbar.showSnackbar("Device information copied") } }
        }) { Icon(Icons.Default.ContentCopy, contentDescription = "Copy information") }
        IconButton(onClick = { viewModel.text()?.let { SystemIntents.shareText(context, "Device report", it) } }) {
            Icon(Icons.Default.Share, contentDescription = "Share device report")
        }
        IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, contentDescription = "More options") }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text("Export as text (.txt)") }, onClick = { menu = false; saveTxt.launch("device-report-$stamp.txt") })
            DropdownMenuItem(text = { Text("Export as PDF") }, onClick = { menu = false; savePdf.launch("device-report-$stamp.pdf") })
        }
    }) { padding ->
        when (val s = ui) {
            DeviceInfoUi.Loading -> LoadingState(modifier = Modifier.fillMaxSize())
            is DeviceInfoUi.Error -> ErrorState(s.message, viewModel::load)
            is DeviceInfoUi.Ready -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                item {
                    DpCard {
                        Text(viewModel.repo.deviceName(), style = MaterialTheme.typography.titleLarge)
                        Text(viewModel.repo.androidVersionLabel(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(Spacing.sm))
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            OutlinedButton(onClick = { saveTxt.launch("device-report-$stamp.txt") }) { Text("Export TXT") }
                            OutlinedButton(onClick = { savePdf.launch("device-report-$stamp.pdf") }) { Text("Export PDF") }
                        }
                    }
                }
                items(s.sections, key = { it.title }) { section ->
                    ExpandableSection(section.title, iconFor(section.title), initiallyExpanded = section.title == "Device") {
                        section.rows.forEach { (k, v) -> InfoRow(k, v) }
                    }
                }
                item {
                    NoteText("Values come from Android system APIs. \"(est.)\" marks calculated values; \"Not Available\" or \"Restricted by Android\" means the phone does not share that value with apps.")
                }
            }
        }
    }
}

// ------------------------------------------------------------------------------------ display

@Composable
fun DisplayScreen(onBack: () -> Unit, viewModel: DeviceInfoViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val d = remember { viewModel.display() }
    DpScaffold("Display", onBack) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DpCard {
                    SectionHeader("Screen")
                    InfoRow("Resolution", "${d.widthPx} × ${d.heightPx} px")
                    InfoRow("Density", "${d.densityDpi} dpi (${d.densityBucket})")
                    InfoRow("Pixel density", String.format(Locale.US, "%.0f × %.0f ppi", d.xdpi, d.ydpi))
                    ReadingRow("Diagonal size", d.diagonalInches) { String.format(Locale.US, "%.1f in", it) }
                    ReadingRow("Wide colour gamut", d.isWideColorGamut) { if (it) "Yes" else "No" }
                    InfoRow("HDR", d.hdrTypes.ifEmpty { listOf("Not supported") }.joinToString())
                }
            }
            item {
                DpCard {
                    SectionHeader("Refresh rate")
                    InfoRow("Current", Formatters.hertz(d.refreshRate))
                    InfoRow("Supported", d.supportedRefreshRates.joinToString { Formatters.hertz(it) })
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        listOf(60f, 90f, 120f, 144f).forEach { hz ->
                            val supported = d.supportedRefreshRates.any { kotlin.math.abs(it - hz) < 1.5f }
                            StatusChip("${hz.toInt()} Hz", if (supported) Tone.GOOD else Tone.NEUTRAL)
                        }
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    if (d.supportedRefreshRates.size > 1) {
                        NoteText("To change the refresh rate: open Settings › Display and look for \"Smooth display\", \"Motion smoothness\" or \"Screen refresh rate\" (the name depends on the manufacturer). Higher rates look smoother but use more battery. The system may lower it in Battery Saver or when hot.")
                    } else {
                        NoteText("This display runs at a single refresh rate. It cannot be changed.")
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    OutlinedButton(onClick = { SystemIntents.display(context) }) { Text("Open display settings") }
                }
            }
            item {
                val text = when (val r = d.diagonalInches) {
                    is Reading.Estimated -> "Size is estimated from the resolution and the DPI the manufacturer reports, so it may differ slightly from the advertised size."
                    else -> "The physical size is not reported by this display."
                }
                NoteText(text)
            }
        }
    }
}

package com.webtecit.devicepilot.ui.device

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.format.DateFormat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BatteryChargingFull
import androidx.compose.material.icons.outlined.Dialpad
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Screenshot
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.SimCard
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.BatteryExtras
import com.webtecit.devicepilot.data.BatterySnapshot
import com.webtecit.devicepilot.data.DisplayInfo
import com.webtecit.devicepilot.data.SimInfo
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.MemorySnapshot
import com.webtecit.devicepilot.domain.StorageSnapshot
import com.webtecit.devicepilot.domain.TemperatureUnit
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.IconBadge
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.batteryHealthRes
import com.webtecit.devicepilot.ui.common.chargeStateRes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Date
import java.util.Locale

private data class Details(
    val name: String,
    val memory: MemorySnapshot,
    val storage: StorageSnapshot?,
    val battery: BatterySnapshot,
    val extras: BatteryExtras,
    val display: DisplayInfo?,
    val sims: List<SimInfo>,
    val imeis: List<String>?,
    val operator: String?,
    val cores: Int,
    val maxFreq: Int?,
    val soc: String?,
    val kernel: String?,
    val baseband: String?,
    val bootTime: Long,
    val uptime: Long,
    val sensors: Int,
    val cameras: Int,
    val features: List<Pair<String, Boolean>>,
    val unit: TemperatureUnit,
    val phonePermission: Boolean,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DeviceInfoScreen() {
    val c = LocalContainer.current
    val context = LocalContext.current
    var reload by remember { mutableIntStateOf(0) }
    val phoneLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { reload++ }
    val details by produceState<Details?>(null, reload) {
        value = withContext(Dispatchers.IO) {
            val r = c.details
            val battery = c.monitor.battery()
            val cpu = c.monitor.cpu()
            Details(
                name = r.deviceName(), memory = c.monitor.memory(), storage = c.monitor.storage(),
                battery = battery, extras = r.batteryExtras(battery), display = r.display(),
                sims = r.sims(), imeis = r.imeis(), operator = r.networkOperator(),
                cores = cpu.cores, maxFreq = cpu.maxFreqMhz.filterNotNull().maxOrNull(), soc = r.soc(),
                kernel = r.kernel(), baseband = r.baseband(), bootTime = r.bootTime(), uptime = r.uptimeMs(),
                sensors = r.sensorCount(), cameras = r.cameraCount(), features = r.features(),
                unit = c.settings.current().temperatureUnit, phonePermission = r.hasPhonePermission(),
            )
        }
    }
    val d = details ?: return
    val na = stringResource(R.string.unavailable)
    val dateTime = remember {
        { t: Long -> DateFormat.getMediumDateFormat(context).format(Date(t)) + " " + DateFormat.getTimeFormat(context).format(Date(t)) }
    }

    ScreenList {
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF1E6BFF), Color(0xFF0B1B3F)))).padding(18.dp)) {
                Column {
                    Text(stringResource(R.string.dd_device_name), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.75f))
                    Text(d.name, style = MaterialTheme.typography.headlineSmall, color = Color.White, fontWeight = FontWeight.Bold)
                    Text("${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}",
                        style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.9f))
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        HeroStat(stringResource(R.string.dd_ram), Formatters.bytes(d.memory.totalBytes), Modifier.weight(1f))
                        HeroStat(stringResource(R.string.dd_storage), d.storage?.let { Formatters.bytes(it.totalBytes) } ?: "—", Modifier.weight(1f))
                        HeroStat(stringResource(R.string.dd_battery), d.battery.percent?.let { "$it%" } ?: "—", Modifier.weight(1f))
                    }
                }
            }
        }
        item {
            Section(Icons.Outlined.Schedule, stringResource(R.string.dd_power_on)) {
                InfoRow(stringResource(R.string.dd_turned_on), dateTime(d.bootTime))
                InfoRow(stringResource(R.string.dd_uptime), Formatters.duration(d.uptime))
                SourceNote(stringResource(R.string.dd_uptime_note))
            }
        }
        item {
            Section(Icons.Outlined.PhoneAndroid, stringResource(R.string.dd_identity)) {
                InfoRow(stringResource(R.string.dd_manufacturer), Build.MANUFACTURER)
                InfoRow(stringResource(R.string.dd_brand), Build.BRAND)
                InfoRow(stringResource(R.string.dd_model), Build.MODEL)
                InfoRow(stringResource(R.string.dd_codename), Build.DEVICE)
                InfoRow(stringResource(R.string.dd_product), Build.PRODUCT)
                InfoRow(stringResource(R.string.dd_hardware), Build.HARDWARE)
                InfoRow(stringResource(R.string.dd_board), Build.BOARD)
            }
        }
        item {
            Section(Icons.Outlined.SimCard, stringResource(R.string.dd_phone_sim)) {
                if (d.imeis != null && d.imeis.isNotEmpty()) {
                    d.imeis.forEachIndexed { i, imei -> InfoRow("IMEI ${i + 1}", imei) }
                } else {
                    Text(stringResource(R.string.dd_imei_restricted), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                    ShortcutButton(stringResource(R.string.dd_show_imei), Icons.Outlined.Dialpad) {
                        SystemSettings.open(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode("*#06#"))))
                    }
                }
                Spacer(Modifier.height(8.dp))
                InfoRow(stringResource(R.string.dd_network_operator), d.operator ?: na)
                InfoRow(stringResource(R.string.dd_sim_slots), d.sims.size.toString())
                d.sims.forEach { sim ->
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.dd_sim_n, sim.slot), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        StatusPill(sim.state, if (sim.state == "Active") Level.GOOD else Level.NEUTRAL)
                    }
                    sim.carrier?.let { InfoRow(stringResource(R.string.dd_carrier), it) }
                    sim.displayName?.let { InfoRow(stringResource(R.string.dd_sim_name), it) }
                    sim.country?.let { InfoRow(stringResource(R.string.dd_country), it) }
                    sim.roaming?.let { InfoRow(stringResource(R.string.dd_roaming), stringResource(if (it) R.string.yes else R.string.no)) }
                }
                if (!d.phonePermission) {
                    Spacer(Modifier.height(6.dp))
                    FilledTonalButton(onClick = { phoneLauncher.launch(Manifest.permission.READ_PHONE_STATE) }) {
                        Text(stringResource(R.string.dd_allow_phone))
                    }
                }
            }
        }
        item {
            val b = d.battery
            val x = d.extras
            Section(Icons.Outlined.BatteryChargingFull, stringResource(R.string.dd_battery_charging)) {
                InfoRow(stringResource(R.string.battery_health_reported), stringResource(batteryHealthRes(b.health)))
                InfoRow(stringResource(R.string.battery_cycles), x.cycleCount?.toString() ?: stringResource(R.string.battery_cycles_unavailable))
                InfoRow(stringResource(R.string.dd_design_capacity), x.designCapacityMah?.let { "$it mAh" } ?: na)
                InfoRow(stringResource(R.string.dd_estimated_capacity), (x.fullCapacityMah ?: x.estimatedFullMah)?.let { "$it mAh" } ?: na)
                InfoRow(stringResource(R.string.dd_state), stringResource(chargeStateRes(b.state)) + (b.plugged?.let { " · $it" } ?: ""))
                InfoRow(stringResource(R.string.dd_charging_power), x.chargingPowerW?.let { String.format(Locale.US, "%.1f W", it) }
                    ?: stringResource(R.string.dd_not_charging))
                InfoRow(stringResource(R.string.dd_charger_max), x.chargerMaxW?.let { String.format(Locale.US, "%.1f W", it) }
                    ?: stringResource(R.string.dd_charger_not_reported))
                InfoRow(stringResource(R.string.battery_temperature), b.celsius?.let { TemperatureUtils.format(it, d.unit) } ?: na)
                InfoRow(stringResource(R.string.battery_voltage), b.voltageMv?.let { "$it mV" } ?: na)
                InfoRow(stringResource(R.string.battery_technology), b.technology ?: na)
                SourceNote(stringResource(R.string.dd_charger_note))
            }
        }
        item {
            Section(Icons.Outlined.Memory, stringResource(R.string.dd_processor_memory)) {
                d.soc?.let { InfoRow(stringResource(R.string.dd_chipset), it) }
                InfoRow(stringResource(R.string.cpu_cores), d.cores.toString())
                InfoRow(stringResource(R.string.dd_max_freq), d.maxFreq?.let { "$it MHz" } ?: na)
                InfoRow(stringResource(R.string.dd_abi), Build.SUPPORTED_ABIS.joinToString(", "))
                InfoRow(stringResource(R.string.dd_ram), "${Formatters.bytes(d.memory.availableBytes)} / ${Formatters.bytes(d.memory.totalBytes)}")
                d.storage?.let { InfoRow(stringResource(R.string.dd_storage), "${Formatters.bytes(it.freeBytes)} / ${Formatters.bytes(it.totalBytes)}") }
            }
        }
        d.display?.let { disp ->
            item {
                Section(Icons.Outlined.Screenshot, stringResource(R.string.dd_display)) {
                    InfoRow(stringResource(R.string.dd_resolution), "${disp.widthPx} × ${disp.heightPx}")
                    InfoRow(stringResource(R.string.dd_density), "${disp.densityDpi} dpi")
                    disp.sizeInches?.let { InfoRow(stringResource(R.string.dd_size), String.format(Locale.US, "%.1f\"", it)) }
                    InfoRow(stringResource(R.string.dd_refresh), String.format(Locale.US, "%.0f Hz (max %.0f Hz)", disp.refreshRate, disp.maxRefreshRate))
                    InfoRow("HDR", stringResource(if (disp.hdr) R.string.yes else R.string.no))
                }
            }
        }
        item {
            Section(Icons.Outlined.Info, stringResource(R.string.dd_software)) {
                InfoRow(stringResource(R.string.dd_android), "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
                InfoRow(stringResource(R.string.dd_security_patch), Build.VERSION.SECURITY_PATCH.ifBlank { na })
                InfoRow(stringResource(R.string.dd_build), Build.DISPLAY)
                InfoRow(stringResource(R.string.dd_build_date), dateTime(Build.TIME))
                InfoRow(stringResource(R.string.dd_kernel), d.kernel ?: na)
                InfoRow(stringResource(R.string.dd_baseband), d.baseband ?: na)
                InfoRow(stringResource(R.string.dd_bootloader), Build.BOOTLOADER)
                InfoRow(stringResource(R.string.dd_fingerprint), Build.FINGERPRINT)
                InfoRow(stringResource(R.string.dd_language), c.details.locale())
                InfoRow(stringResource(R.string.dd_timezone), c.details.timeZone())
            }
        }
        item {
            Section(Icons.Outlined.Tune, stringResource(R.string.dd_hardware_features)) {
                InfoRow(stringResource(R.string.dd_sensors), d.sensors.toString())
                InfoRow(stringResource(R.string.dd_cameras), d.cameras.toString())
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    d.features.forEach { (name, has) -> StatusPill(name, if (has) Level.GOOD else Level.NEUTRAL) }
                }
            }
        }
        item {
            ShortcutButton(stringResource(R.string.dd_share), Icons.Outlined.Share, Modifier.fillMaxWidth()) {
                val text = buildString {
                    appendLine(d.name)
                    appendLine("${Build.MANUFACTURER} ${Build.MODEL} (${Build.DEVICE})")
                    appendLine("Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), patch ${Build.VERSION.SECURITY_PATCH}")
                    d.soc?.let { appendLine("Chipset: $it") }
                    appendLine("CPU: ${d.cores} cores${d.maxFreq?.let { " up to $it MHz" } ?: ""}")
                    appendLine("RAM: ${Formatters.bytes(d.memory.totalBytes)}")
                    d.storage?.let { appendLine("Storage: ${Formatters.bytes(it.totalBytes)}") }
                    d.display?.let { appendLine("Display: ${it.widthPx}x${it.heightPx}, ${it.maxRefreshRate.toInt()} Hz") }
                    appendLine("Battery: ${d.battery.percent ?: "-"}%, cycles ${d.extras.cycleCount ?: "n/a"}")
                    appendLine("— DevicePilot")
                }
                SystemSettings.shareText(context, text, context.getString(R.string.dd_share))
            }
        }
    }
}

@Composable
private fun HeroStat(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.14f)).padding(10.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
        Text(value, style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun Section(icon: ImageVector, title: String, content: @Composable () -> Unit) {
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, size = 32.dp)
            Spacer(Modifier.width(10.dp))
            Text(title, style = MaterialTheme.typography.titleSmall)
        }
        Spacer(Modifier.height(6.dp))
        content()
    }
}

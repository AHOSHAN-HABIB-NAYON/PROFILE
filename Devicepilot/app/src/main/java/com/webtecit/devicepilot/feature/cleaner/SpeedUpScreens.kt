package com.webtecit.devicepilot.feature.cleaner

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Animation
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.BatterySaver
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.DeviceThermostat
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.BulletText
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.LocalStatusColors
import com.webtecit.devicepilot.core.designsystem.MetricRing
import com.webtecit.devicepilot.core.designsystem.NavRow
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
import com.webtecit.devicepilot.core.permissions.rememberOnResumeCheck
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.AppsRepository
import com.webtecit.devicepilot.data.repository.LiveSnapshot
import com.webtecit.devicepilot.data.repository.LiveStatusRepository
import com.webtecit.devicepilot.data.repository.SystemRepository
import com.webtecit.devicepilot.domain.model.AppUsage
import com.webtecit.devicepilot.domain.model.ThermalLevel
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

data class Recommendation(val icon: ImageVector, val title: String, val detail: String, val tone: Tone, val actionLabel: String?, val action: ((Context, (String) -> Unit) -> Unit)?)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class SpeedUpViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    live: LiveStatusRepository,
    settings: SettingsRepository,
    private val apps: AppsRepository,
    private val system: SystemRepository,
) : ViewModel() {

    val snapshot: StateFlow<LiveSnapshot?> = settings.settings.map { maxOf(it.refreshIntervalMs, 2_000) }.distinctUntilChanged()
        .flatMapLatest { live.snapshots(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val usage = MutableStateFlow<Reading<List<AppUsage>>?>(null)

    fun hasUsageAccess() = apps.hasUsageAccess()

    fun loadUsage() {
        viewModelScope.launch { usage.value = apps.recentUsage(24) }
    }

    fun icon(pkg: String, px: Int) = apps.icon(pkg, px)

    fun powerSave() = system.isPowerSaveMode()

    /** Reads the current animation scales (readable without permission; changing them is left to the user). */
    fun animationScales(): List<Pair<String, Float>> = listOf(
        "Window animation" to Settings.Global.WINDOW_ANIMATION_SCALE,
        "Transition animation" to Settings.Global.TRANSITION_ANIMATION_SCALE,
        "Animator duration" to Settings.Global.ANIMATOR_DURATION_SCALE,
    ).map { (label, key) -> label to runCatching { Settings.Global.getFloat(context.contentResolver, key) }.getOrDefault(1f) }

    fun recommendations(s: LiveSnapshot, powerSave: Boolean, scales: List<Pair<String, Float>>): List<Recommendation> = buildList {
        if (s.storage.freeFraction < 0.15f) {
            add(Recommendation(Icons.Default.SdStorage, "Free up storage",
                "Only ${Formatters.percent(s.storage.freeFraction * 100)} free. Android needs free space for updates, caches and smooth app launches.",
                if (s.storage.freeFraction < 0.1f) Tone.BAD else Tone.WARNING, "Clean storage") { _, nav -> nav(Routes.JUNK) })
        }
        if (s.memory.lowMemory || s.memory.availableFraction < 0.15f) {
            add(Recommendation(Icons.Default.Memory, "Memory is tight",
                "${Formatters.bytes(s.memory.availableBytes)} available. Close apps you are not using from the Recents screen, or uninstall apps that run in the background.",
                Tone.WARNING, "See memory") { _, nav -> nav(Routes.RAM_BOOST) })
        }
        val temp = s.battery?.temperatureC?.valueOrNull
        if (temp != null && temp >= 40f) {
            add(Recommendation(Icons.Default.DeviceThermostat, "Phone is warm",
                "Battery at ${Formatters.celsius(temp)}. Android slows the processor when hot to protect the hardware.",
                toneForTemperature(temp), "Cooling tips") { _, nav -> nav(Routes.COOLING) })
        }
        if (!powerSave && (s.battery?.levelPercent ?: 100) <= 20 && s.battery?.isPluggedIn == false) {
            add(Recommendation(Icons.Default.BatterySaver, "Battery is low",
                "Turn on Battery Saver to reduce background activity until you can charge.", Tone.WARNING, "Battery Saver") { c, _ -> SystemIntents.batterySaver(c) })
        }
        if (scales.any { it.second > 0.5f }) {
            add(Recommendation(Icons.Default.Animation, "Shorter animations",
                "Animations are at ${scales.joinToString { String.format(Locale.US, "%.1fx", it.second) }}. Setting them to 0.5x in Developer Options makes the phone feel faster.",
                Tone.INFO, "Show how") { _, nav -> nav(Routes.TIPS) })
        }
        if (android.os.Build.VERSION.SDK_INT < 33) {
            add(Recommendation(Icons.Default.SystemUpdate, "Check for updates",
                "Your phone runs Android ${android.os.Build.VERSION.RELEASE}. Install any system update your manufacturer offers.", Tone.INFO, "Check updates") { c, _ -> SystemIntents.systemUpdate(c) })
        }
        add(Recommendation(Icons.Default.Apps, "Review your apps",
            "Uninstalling apps you no longer use frees storage and stops their background work.", Tone.NEUTRAL, "Open App Manager") { _, nav -> nav(Routes.APPS) })
    }
}

@Composable
private fun rememberUsage(viewModel: SpeedUpViewModel): Pair<Boolean, Reading<List<AppUsage>>?> {
    val granted = rememberOnResumeCheck { viewModel.hasUsageAccess() }
    val usage by viewModel.usage.collectAsStateWithLifecycle()
    LaunchedEffect(granted) { viewModel.loadUsage() }
    return granted to usage
}

// ---------------------------------------------------------------------------------- Speed Up hub

@Composable
fun SpeedUpScreen(onBack: () -> Unit, navigate: (String) -> Unit, viewModel: SpeedUpViewModel = hiltViewModel()) {
    val snap by viewModel.snapshot.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val (usageGranted, usage) = rememberUsage(viewModel)

    DpScaffold("Speed Up", onBack) { padding ->
        val s = snap
        if (s == null) { LoadingState(modifier = Modifier.fillMaxSize()); return@DpScaffold }
        val recs = viewModel.recommendations(s, viewModel.powerSave(), viewModel.animationScales())
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        ActionCard(Icons.Default.RocketLaunch, "RAM Boost", "${Formatters.bytes(s.memory.availableBytes)} free", Brand.Green, Modifier.weight(1f)) { navigate(Routes.RAM_BOOST) }
                        ActionCard(Icons.Default.DeviceThermostat, "Phone Cooling", s.battery?.temperatureC?.display { Formatters.celsius(it) } ?: "—", Brand.Amber, Modifier.weight(1f)) { navigate(Routes.COOLING) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        ActionCard(Icons.Default.CleaningServices, "Smart Clean", "${Formatters.bytes(s.storage.freeBytes)} free", Brand.Teal, Modifier.weight(1f)) { navigate(Routes.JUNK) }
                        ActionCard(Icons.Default.Apps, "Manage Apps", "Uninstall & settings", MaterialTheme.colorScheme.tertiary, Modifier.weight(1f)) { navigate(Routes.APPS) }
                    }
                }
            }
            item { SectionHeader("Recommendations", subtitle = "Based on your phone's current state") }
            items(recs, key = { it.title }) { r ->
                DpCard {
                    Row(verticalAlignment = Alignment.Top) {
                        IconBadge(r.icon, r.tone.color())
                        Spacer(Modifier.width(Spacing.md))
                        Column(Modifier.weight(1f)) {
                            Text(r.title, style = MaterialTheme.typography.titleSmall)
                            Text(r.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (r.actionLabel != null && r.action != null) {
                                Spacer(Modifier.height(Spacing.sm))
                                OutlinedButton(onClick = { r.action.invoke(context, navigate) }) { Text(r.actionLabel) }
                            }
                        }
                    }
                }
            }
            usageSection(usageGranted, usage, viewModel, "Background activity", "Apps you used most in the last 24 hours. Heavy use apps are the usual cause of battery drain and heat.", navigate)
            item {
                DpCard {
                    Text("About \"boosting\"", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(Spacing.xs))
                    NoteText("Android manages memory automatically and reopens closed apps when needed. Killing all apps usually makes the phone slower, because apps must start from scratch. Devicepilot only shows real readings and points you to the settings that make a difference.")
                }
            }
        }
    }
}

@Composable
private fun ActionCard(icon: ImageVector, title: String, value: String, tint: Color, modifier: Modifier, onClick: () -> Unit) {
    DpCard(modifier, onClick = onClick) {
        IconBadge(icon, tint)
        Spacer(Modifier.height(Spacing.sm))
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun LazyListScope.usageSection(
    granted: Boolean,
    usage: Reading<List<AppUsage>>?,
    viewModel: SpeedUpViewModel,
    title: String,
    subtitle: String,
    navigate: (String) -> Unit,
) {
    item { SectionHeader(title, subtitle = subtitle) }
    if (!granted) {
        item {
            DpCard {
                Text("Usage access is off", style = MaterialTheme.typography.titleSmall)
                NoteText("Android only shares app activity with apps you allow in Settings › Usage access. This is optional.")
                Spacer(Modifier.height(Spacing.sm))
                val context = LocalContext.current
                Button(onClick = { SystemIntents.usageAccess(context) }) { Text("Open Usage access") }
            }
        }
        return
    }
    when (usage) {
        null -> item { LoadingState() }
        is Reading.Unavailable -> item { DpCard { InfoRow("App activity", usage.reason.label) } }
        else -> {
            val list = usage.valueOrNull.orEmpty().take(8)
            if (list.isEmpty()) item { DpCard { NoteText("No app was used for more than a minute in the last 24 hours.") } }
            items(list, key = { it.packageName }) { u ->
                DpCard(onClick = { navigate(Routes.appDetail(u.packageName)) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AppIcon(viewModel, u.packageName)
                        Spacer(Modifier.width(Spacing.md))
                        Column(Modifier.weight(1f)) {
                            Text(u.label, style = MaterialTheme.typography.titleSmall)
                            NoteText("Last used ${Formatters.dateTime(u.lastUsed)}")
                        }
                        Text(Formatters.duration(u.foregroundMillis), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun AppIcon(viewModel: SpeedUpViewModel, pkg: String) {
    val px = with(LocalDensity.current) { 36.dp.roundToPx() }
    val bmp by produceState<android.graphics.Bitmap?>(null, pkg) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { viewModel.icon(pkg, px) }
    }
    bmp?.let { Image(it.asImageBitmap(), contentDescription = null, modifier = Modifier.size(36.dp)) }
        ?: IconBadge(Icons.Default.Apps, MaterialTheme.colorScheme.onSurfaceVariant, 36.dp)
}

// ---------------------------------------------------------------------------------- RAM Boost

@Composable
fun RamBoostScreen(onBack: () -> Unit, navigate: (String) -> Unit, viewModel: SpeedUpViewModel = hiltViewModel()) {
    val snap by viewModel.snapshot.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val (usageGranted, usage) = rememberUsage(viewModel)

    DpScaffold("RAM Boost", onBack) { padding ->
        val s = snap
        if (s == null) { LoadingState(modifier = Modifier.fillMaxSize()); return@DpScaffold }
        val m = s.memory
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MetricRing(m.usedFraction, size = 120.dp, color = toneForUsage(m.usedFraction).color()) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(Formatters.percent(m.usedFraction * 100), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                                Text("used", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.width(Spacing.lg))
                        Column(Modifier.weight(1f)) {
                            InfoRow("Total", Formatters.bytes(m.totalBytes))
                            InfoRow("Used", Formatters.bytes(m.usedBytes))
                            InfoRow("Available", Formatters.bytes(m.availableBytes))
                        }
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    InfoRow("Low-memory threshold", Formatters.bytes(m.thresholdBytes))
                    InfoRow("Low-memory state", if (m.lowMemory) "Yes — Android is closing background apps" else "No", valueColor = if (m.lowMemory) Tone.BAD.color() else Tone.GOOD.color())
                }
            }
            item {
                DpCard {
                    Text("How Android uses memory", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(Spacing.xs))
                    BulletText("Unused RAM is wasted RAM: Android keeps recent apps in memory so they reopen instantly.")
                    BulletText("When memory runs low, Android closes the least important background apps by itself.")
                    BulletText("Force-closing apps makes them start again from scratch, which costs more battery and time.")
                    BulletText("If one app keeps using memory or battery, open its App info to force stop, restrict background use or uninstall it.")
                }
            }
            item {
                DpCard {
                    Text("Safe ways to free memory", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(Spacing.xs))
                    BulletText("Close apps you are done with from the Recents screen.")
                    BulletText("Remove widgets and live wallpapers you don't need.")
                    BulletText("Uninstall or disable apps you don't use.")
                    BulletText("Restart the phone if it has been on for many days.")
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        OutlinedButton(onClick = { navigate(Routes.APPS) }) { Text("App Manager") }
                        OutlinedButton(onClick = { SystemIntents.apps(context) }) { Text("System apps list") }
                    }
                }
            }
            usageSection(usageGranted, usage, viewModel, "Most used apps", "Foreground time in the last 24 hours. Android does not let apps see other apps' memory use.", navigate)
        }
    }
}

// ---------------------------------------------------------------------------------- Phone Cooling

@Composable
fun CoolingScreen(onBack: () -> Unit, navigate: (String) -> Unit, viewModel: SpeedUpViewModel = hiltViewModel()) {
    val snap by viewModel.snapshot.collectAsStateWithLifecycle()
    val context = LocalContext.current

    DpScaffold("Phone Cooling", onBack) { padding ->
        val s = snap
        if (s == null) { LoadingState(modifier = Modifier.fillMaxSize()); return@DpScaffold }
        val temp = s.battery?.temperatureC?.valueOrNull
        val tone = temp?.let { toneForTemperature(it) } ?: Tone.NEUTRAL
        val thermal = s.thermal.level.valueOrNull
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            if (tone == Tone.BAD || (thermal != null && thermal >= ThermalLevel.SEVERE)) {
                item {
                    DpCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconBadge(Icons.Default.Warning, LocalStatusColors.current.error)
                            Spacer(Modifier.width(Spacing.md))
                            Column {
                                Text("Your phone is overheating", style = MaterialTheme.typography.titleSmall, color = LocalStatusColors.current.error)
                                NoteText("Stop charging and heavy apps, remove the case and let it rest away from direct sunlight.")
                            }
                        }
                    }
                }
            }
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MetricRing(((temp ?: 0f) / 60f), size = 120.dp, color = tone.color()) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(temp?.let { String.format(Locale.US, "%.1f°", it) } ?: "—", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                                Text("battery", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.width(Spacing.lg))
                        Column(Modifier.weight(1f)) {
                            StatusChip(when (tone) { Tone.BAD -> "Hot"; Tone.WARNING -> "Warm"; Tone.GOOD -> "Normal"; else -> "Unknown" }, tone)
                            Spacer(Modifier.height(Spacing.sm))
                            ReadingRow("Thermal status", s.thermal.level) { it.label }
                            ReadingRow("CPU temp", s.cpu.temperatureC) { Formatters.celsius(it) }
                        }
                    }
                    NoteText("Battery temperature comes from the battery sensor. Devicepilot cannot cool the hardware; it shows what is heating it and how to help it cool down.")
                }
            }
            item {
                val causes = buildList {
                    if (s.battery?.isCharging == true) add("The phone is charging — charging produces heat, fast charging even more.")
                    val load = s.cpu.load.valueOrNull
                    if (load != null && load > 60f) add("The processor is running at high frequency (estimated ${Formatters.percent(load)}).")
                    if (s.memory.availableFraction < 0.15f) add("Memory is nearly full, so Android is busy managing apps.")
                    if (thermal != null && thermal >= ThermalLevel.MODERATE) add("Android reports ${thermal.label.lowercase()} thermal throttling.")
                    val brightness = runCatching { Settings.System.getInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS) }.getOrNull()
                    if (brightness != null && brightness > 200) add("Screen brightness is very high.")
                    if (!viewModel.powerSave() && (temp ?: 0f) >= 40f) add("Battery Saver is off.")
                }
                DpCard {
                    SectionHeader("Possible causes right now")
                    if (causes.isEmpty()) NoteText("Nothing unusual detected. Temperatures up to about 40 °C are normal during use.")
                    causes.forEach { BulletText(it) }
                }
            }
            item {
                DpCard {
                    SectionHeader("How to cool your phone")
                    BulletText("Stop games, video recording and navigation for a few minutes.")
                    BulletText("Unplug the charger, or use a slower charger while the phone is hot.")
                    BulletText("Take off thick cases and keep the phone out of direct sun and off soft surfaces.")
                    BulletText("Lower the screen brightness and turn on Battery Saver.")
                    BulletText("Never put a phone in a fridge or freezer — condensation can damage it.")
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        OutlinedButton(onClick = { SystemIntents.batterySaver(context) }) { Text("Battery Saver") }
                        OutlinedButton(onClick = { SystemIntents.display(context) }) { Text("Brightness") }
                    }
                }
            }
            item {
                NavRow(Icons.Default.Apps, "Check app activity", "See which apps you used most today") { navigate(Routes.SPEED_UP) }
            }
        }
    }
}

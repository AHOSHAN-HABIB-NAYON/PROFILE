package com.webtecit.devicepilot.ui.optimize

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Radar
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.domain.Finding
import com.webtecit.devicepilot.domain.FindingId
import com.webtecit.devicepilot.domain.FindingStatus
import com.webtecit.devicepilot.domain.OptimizationEngine
import com.webtecit.devicepilot.domain.OptimizationInputs
import com.webtecit.devicepilot.domain.SettingsTarget
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.NavRow
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.entrance
import com.webtecit.devicepilot.ui.common.findingLevel
import com.webtecit.devicepilot.ui.common.findingStatusRes
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.Level
import kotlinx.coroutines.yield
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ScanUi(val running: Boolean = false, val progress: Float = 0f, val step: Int = 0, val findings: List<Finding>? = null)

class OptimizeViewModel(private val c: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow(ScanUi())
    val ui = _ui.asStateFlow()

    fun scan() = viewModelScope.launch {
        if (_ui.value.running) return@launch
        _ui.value = ScanUi(running = true)
        val steps = 5
        suspend fun step(i: Int) {
            _ui.value = _ui.value.copy(step = i, progress = i / steps.toFloat())
            yield()
        }
        step(1)
        val storage = c.monitor.storage()
        val memory = c.monitor.memory()
        step(2)
        val battery = c.monitor.battery()
        val thermal = c.monitor.thermal()
        step(3)
        val access = c.usage.hasUsageAccess()
        val now = System.currentTimeMillis()
        val weekly = if (access) c.usage.deviceTotals(UsagePeriods.range(UsagePeriod.LAST_7_DAYS, now, 1))
            .let { t -> if (t.wifiTotal == null && t.mobileTotal == null) null else (t.wifiTotal ?: 0) + (t.mobileTotal ?: 0) } else null
        step(4)
        val unused = if (access) {
            val usage = c.usage.appUsage(UsagePeriods.range(UsagePeriod.LAST_30_DAYS, now, 1))
            c.apps.loadApps().count { a ->
                a.isUserApp && a.launchable &&
                    now - a.firstInstall > 30L * 24 * 3600 * 1000 &&
                    (usage[a.packageName]?.lastUsed ?: 0L) < now - 30L * 24 * 3600 * 1000
            }
        } else null
        val scales = c.monitor.animationScales()
        step(5)
        val findings = OptimizationEngine.analyze(
            OptimizationInputs(
                storage = storage,
                memory = memory,
                batteryCelsius = battery.celsius,
                thermal = if (thermal.supported) thermal.level else null,
                usageAccess = access,
                weeklyDataBytes = weekly,
                animatorScale = scales.third,
                developerOptionsEnabled = c.monitor.developerOptionsEnabled(),
                unusedApps = unused,
                powerSaveMode = battery.powerSave,
                batteryOptimizationSupported = true,
            )
        )
        _ui.value = ScanUi(running = false, progress = 1f, step = steps, findings = findings)
    }
}

@Composable
fun OptimizeScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val vm: OptimizeViewModel = viewModel { OptimizeViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val progress by animateFloatAsState(ui.progress, tween(250), label = "scan")

    ScreenList {
        item { HeroCard(R.drawable.ill_speed, stringResource(R.string.optimize_hero_title), stringResource(R.string.optimize_hero_text)) }
        item {
            DpCard(contentPadding = 6.dp) {
                NavRow(Icons.AutoMirrored.Outlined.MenuBook, stringResource(R.string.title_guide), stringResource(R.string.guide_row_sub)) {
                    navigate(Routes.GUIDE)
                }
            }
        }
        item {
            Button(
                onClick = { haptics.performHapticFeedback(HapticFeedbackType.LongPress); vm.scan() },
                enabled = !ui.running, modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Outlined.Radar, null); Spacer(Modifier.width(8.dp))
                Text(stringResource(if (ui.findings == null) R.string.optimize_scan else R.string.optimize_rescan))
            }
            if (ui.running) {
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                Text(stringResource(scanStepRes(ui.step)), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            }
        }
        val findings = ui.findings
        if (findings != null) {
            val sum = OptimizationEngine.summarize(findings)
            item {
                DpCard {
                    Text(stringResource(R.string.optimize_summary), style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SummaryCount(sum.ok, R.string.finding_ok, Level.GOOD, Modifier.weight(1f))
                        SummaryCount(sum.suggestions, R.string.finding_suggestion, Level.WARN, Modifier.weight(1f))
                        SummaryCount(sum.needsApproval, R.string.finding_needs_approval, Level.INFO, Modifier.weight(1f))
                        SummaryCount(sum.unsupported, R.string.finding_unsupported, Level.NEUTRAL, Modifier.weight(1f))
                    }
                    SourceNote(stringResource(R.string.optimize_honesty))
                }
            }
            item { SectionTitle(stringResource(R.string.optimize_findings)) }
            items(findings.sortedBy { order(it.status) }, key = { it.id.name }) { f ->
                val idx = findings.indexOf(f)
                DpCard(Modifier.entrance(idx)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(findingTitle(f.id)), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        StatusPill(stringResource(findingStatusRes(f.status)), findingLevel(f.status))
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(stringResource(findingText(f)), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (f.target != SettingsTarget.NONE) {
                        TextButton(onClick = {
                            if (f.target == SettingsTarget.APP_LIST) navigate(Routes.UNINSTALL)
                            else SystemSettings.openTarget(context, f.target)
                        }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            Text(stringResource(targetLabel(f.target)))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCount(n: Int, label: Int, level: Level, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$n", style = MaterialTheme.typography.titleLarge, color = levelColor(level))
        Text(stringResource(label), style = MaterialTheme.typography.labelSmall, maxLines = 2,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

private fun order(s: FindingStatus) = when (s) {
    FindingStatus.SUGGESTION -> 0
    FindingStatus.NEEDS_APPROVAL -> 1
    FindingStatus.OK -> 2
    FindingStatus.UNSUPPORTED -> 3
}

private fun scanStepRes(step: Int) = when (step) {
    0, 1 -> R.string.scan_step_storage
    2 -> R.string.scan_step_thermal
    3 -> R.string.scan_step_network
    4 -> R.string.scan_step_apps
    else -> R.string.scan_step_settings
}

private fun findingTitle(id: FindingId) = when (id) {
    FindingId.STORAGE -> R.string.f_storage
    FindingId.MEMORY -> R.string.f_memory
    FindingId.BATTERY_TEMP -> R.string.f_battery_temp
    FindingId.THERMAL -> R.string.f_thermal
    FindingId.NETWORK_USAGE -> R.string.f_network
    FindingId.BACKGROUND_BATTERY -> R.string.f_background
    FindingId.UPDATES -> R.string.f_updates
    FindingId.ANIMATIONS -> R.string.f_animations
    FindingId.UNUSED_APPS -> R.string.f_unused
    FindingId.POWER_SAVER -> R.string.f_power_saver
}

private fun findingText(f: Finding): Int = when (f.id) {
    FindingId.STORAGE -> when (f.status) {
        FindingStatus.OK -> R.string.f_storage_ok
        FindingStatus.UNSUPPORTED -> R.string.f_unsupported_generic
        else -> R.string.f_storage_low
    }
    FindingId.MEMORY -> when (f.status) {
        FindingStatus.OK -> R.string.f_memory_ok
        FindingStatus.UNSUPPORTED -> R.string.f_unsupported_generic
        else -> R.string.f_memory_high
    }
    FindingId.BATTERY_TEMP -> when (f.status) {
        FindingStatus.OK -> R.string.f_battery_temp_ok
        FindingStatus.UNSUPPORTED -> R.string.f_unsupported_generic
        else -> R.string.f_battery_temp_warm
    }
    FindingId.THERMAL -> when (f.status) {
        FindingStatus.OK -> R.string.f_thermal_ok
        FindingStatus.UNSUPPORTED -> R.string.f_thermal_unsupported
        else -> R.string.f_thermal_hot
    }
    FindingId.NETWORK_USAGE -> when (f.status) {
        FindingStatus.OK -> R.string.f_network_ok
        FindingStatus.NEEDS_APPROVAL -> R.string.f_needs_usage_access
        FindingStatus.UNSUPPORTED -> R.string.f_unsupported_generic
        FindingStatus.SUGGESTION -> R.string.f_network_heavy
    }
    FindingId.BACKGROUND_BATTERY -> R.string.f_background_text
    FindingId.UPDATES -> R.string.f_updates_text
    FindingId.ANIMATIONS -> when (f.status) {
        FindingStatus.OK -> R.string.f_animations_ok
        FindingStatus.UNSUPPORTED -> R.string.f_unsupported_generic
        else -> R.string.f_animations_suggest
    }
    FindingId.UNUSED_APPS -> when (f.status) {
        FindingStatus.OK -> R.string.f_unused_ok
        FindingStatus.NEEDS_APPROVAL -> R.string.f_needs_usage_access
        FindingStatus.UNSUPPORTED -> R.string.f_unsupported_generic
        FindingStatus.SUGGESTION -> R.string.f_unused_found
    }
    FindingId.POWER_SAVER -> if (f.status == FindingStatus.UNSUPPORTED) R.string.f_unsupported_generic else R.string.f_power_saver_text
}

private fun targetLabel(t: SettingsTarget) = when (t) {
    SettingsTarget.NONE -> R.string.action_open
    SettingsTarget.STORAGE -> R.string.action_storage_settings
    SettingsTarget.MEMORY_APPS -> R.string.action_manage_apps
    SettingsTarget.BATTERY -> R.string.action_battery_settings
    SettingsTarget.BATTERY_OPTIMIZATION -> R.string.action_battery_optimization
    SettingsTarget.DEVELOPER_OPTIONS -> R.string.action_developer_options
    SettingsTarget.USAGE_ACCESS -> R.string.perm_grant_in_settings
    SettingsTarget.DATA_USAGE -> R.string.action_data_usage
    SettingsTarget.SYSTEM_UPDATE -> R.string.action_system_update
    SettingsTarget.APP_LIST -> R.string.action_review_apps
    SettingsTarget.PLAY_STORE_UPDATES -> R.string.action_app_updates
}

package com.webtecit.devicepilot.ui.optimize

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.BatteryChargingFull
import androidx.compose.material.icons.outlined.DeveloperMode
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.SdStorage
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.Illustration
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.LocalReducedMotion
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GuideScreen() {
    val c = LocalContainer.current
    val context = LocalContext.current
    var devEnabled by remember { mutableStateOf(c.monitor.developerOptionsEnabled()) }
    var scales by remember { mutableStateOf(c.monitor.animationScales()) }
    LifecycleResumeEffect(Unit) {
        devEnabled = c.monitor.developerOptionsEnabled()
        scales = c.monitor.animationScales()
        onPauseOrDispose { }
    }

    ScreenList {
        item { Illustration(R.drawable.ill_guide, height = 130.dp) }
        item { SectionTitle(stringResource(R.string.guide_dev_title)) }
        item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.guide_dev_status), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    StatusPill(stringResource(if (devEnabled) R.string.enabled else R.string.not_enabled),
                        if (devEnabled) Level.GOOD else Level.NEUTRAL)
                }
                Spacer(Modifier.height(8.dp))
                listOf(R.string.guide_dev_1, R.string.guide_dev_2, R.string.guide_dev_3, R.string.guide_dev_4,
                    R.string.guide_dev_5, R.string.guide_dev_6).forEachIndexed { i, s -> NumberedStep(i + 1, stringResource(s)) }
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.action_about_phone), Icons.Outlined.PhoneAndroid) { SystemSettings.aboutPhone(context) }
                    ShortcutButton(stringResource(R.string.action_developer_options), Icons.Outlined.DeveloperMode) { SystemSettings.developerOptions(context) }
                }
                SourceNote(stringResource(R.string.guide_dev_note))
            }
        }
        item { SectionTitle(stringResource(R.string.guide_anim_title)) }
        item {
            DpCard {
                Text(stringResource(R.string.guide_anim_intro), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                val (w, t, a) = scales
                ScaleRow(1, stringResource(R.string.anim_window), w)
                ScaleRow(2, stringResource(R.string.anim_transition), t)
                ScaleRow(3, stringResource(R.string.anim_animator), a)
                Spacer(Modifier.height(12.dp))
                Text(stringResource(R.string.guide_anim_compare), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                AnimationComparison()
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.guide_anim_truth), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                ShortcutButton(stringResource(R.string.action_developer_options), Icons.Outlined.DeveloperMode) { SystemSettings.developerOptions(context) }
            }
        }
        item { SectionTitle(stringResource(R.string.guide_more_title)) }
        item {
            DpCard {
                listOf(R.string.tip_storage, R.string.tip_uninstall, R.string.tip_update, R.string.tip_background,
                    R.string.tip_data, R.string.tip_widgets, R.string.tip_performance_mode, R.string.tip_heat, R.string.tip_restart)
                    .forEachIndexed { i, s -> NumberedStep(i + 1, stringResource(s)) }
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.action_developer_options), Icons.Outlined.DeveloperMode) { SystemSettings.developerOptions(context) }
                    ShortcutButton(stringResource(R.string.action_storage_settings), Icons.Outlined.SdStorage) { SystemSettings.storage(context) }
                    ShortcutButton(stringResource(R.string.action_battery_settings), Icons.Outlined.BatteryChargingFull) { SystemSettings.batterySettings(context) }
                    ShortcutButton(stringResource(R.string.action_manage_apps), Icons.Outlined.Apps) { SystemSettings.appList(context) }
                    ShortcutButton(stringResource(R.string.action_system_update), Icons.Outlined.SystemUpdate) { SystemSettings.systemUpdate(context) }
                }
            }
        }
    }
}

@Composable
private fun NumberedStep(n: Int, text: String) {
    Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center) {
            Text("$n", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ScaleRow(n: Int, name: String, current: Float?) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        NumberedStep(n, name)
        Spacer(Modifier.weight(1f))
        Column(horizontalAlignment = Alignment.End) {
            Text(stringResource(R.string.anim_recommended), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.anim_current, current?.let { "${it}x" } ?: "—"),
                style = MaterialTheme.typography.labelMedium,
                color = if (current != null && current <= 0.5f) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        }
    }
}

/** Two cards sliding at 1x and 0.5x duration to show how the setting feels. */
@Composable
private fun AnimationComparison() {
    val reduced = LocalReducedMotion.current
    val transition = rememberInfiniteTransition(label = "compare")
    val slow by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Reverse), label = "1x")
    val fast by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(600, easing = LinearEasing), RepeatMode.Reverse), label = "0.5x")
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Lane("1x", if (reduced) 0.5f else slow, MaterialTheme.colorScheme.outline)
        Lane("0.5x", if (reduced) 0.5f else fast, MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun Lane(label: String, fraction: Float, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(40.dp))
        BoxWithConstraints(Modifier.weight(1f).height(26.dp).clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)) {
            val travel = maxWidth - 36.dp
            Box(Modifier.offset(x = travel * fraction).padding(3.dp).size(30.dp, 20.dp)
                .clip(RoundedCornerShape(6.dp)).background(color))
        }
    }
}

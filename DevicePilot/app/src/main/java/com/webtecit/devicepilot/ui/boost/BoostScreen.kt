package com.webtecit.devicepilot.ui.boost

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AcUnit
import androidx.compose.material.icons.outlined.BatterySaver
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.BoostResult
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.TemperatureUtils
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LineChart
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.thermalLabelRes
import com.webtecit.devicepilot.ui.common.thermalLevel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private val BoostGradient = listOf(Color(0xFF2A7BFF), Color(0xFF12B5E5))
private val CoolGradient = listOf(Color(0xFF12B5E5), Color(0xFF5EEAD4))

/** Big round action button with a spinning ring while working. */
@Composable
fun BigActionButton(
    label: String,
    sublabel: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    colors: List<Color>,
    working: Boolean,
    onClick: () -> Unit,
) {
    // The ring only animates while working, so nothing redraws when idle.
    val spin = if (working) {
        rememberInfiniteTransition(label = "spin")
            .animateFloat(0f, 360f, infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart), label = "r").value
    } else 0f
    Box(Modifier.size(210.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(210.dp).rotate(spin)) {
            drawArc(
                Brush.sweepGradient(colors + colors.first().copy(alpha = 0.1f)),
                0f, if (working) 300f else 360f, false,
                style = Stroke(width = 10.dp.toPx(), cap = StrokeCap.Round),
            )
        }
        Surface(
            onClick = { if (!working) onClick() },
            shape = CircleShape,
            modifier = Modifier.size(170.dp),
            shadowElevation = 6.dp,
            color = Color.Transparent,
        ) {
            Box(Modifier.background(Brush.linearGradient(colors)), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(icon, null, tint = Color.White, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(6.dp))
                    Text(label, style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Bold)
                    Text(sublabel, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.85f))
                }
            }
        }
    }
}

@Composable
fun BoostScreen() {
    val c = LocalContainer.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var working by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<BoostResult?>(null) }
    val mem = remember(result) { c.monitor.memory() }

    ScreenList {
        item {
            Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                BigActionButton(
                    stringResource(if (working) R.string.boost_working else R.string.boost_button),
                    stringResource(R.string.boost_ram_used, mem.usedPercent),
                    Icons.Outlined.RocketLaunch, BoostGradient, working,
                ) {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    working = true
                    scope.launch { result = c.booster.boost(); working = false }
                }
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.boost_hint), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        }
        item { AnimatedVisibility(result != null) { result?.let { BoostResultCard(it) } } }
        item { SourceNote(stringResource(R.string.boost_note)) }
    }
}

@Composable
private fun BoostResultCard(r: BoostResult) {
    DpCard(color = levelColor(Level.GOOD).copy(alpha = 0.08f)) {
        Text(stringResource(R.string.boost_done), style = MaterialTheme.typography.titleMedium, color = levelColor(Level.GOOD))
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ResultBox(stringResource(R.string.boost_apps_closed), r.appsClosed.toString(), Modifier.weight(1f))
            ResultBox(stringResource(R.string.boost_ram_freed),
                if (r.ramFreed > 0) "+" + Formatters.bytes(r.ramFreed) else "0 B", Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
        InfoRow(stringResource(R.string.boost_free_before), Formatters.bytes(r.availableBefore))
        InfoRow(stringResource(R.string.boost_free_after), Formatters.bytes(r.availableAfter))
        InfoRow(stringResource(R.string.boost_cache), Formatters.bytes(r.cacheFreed))
        if (r.ramFreed <= 0) Text(stringResource(R.string.boost_already_free), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ResultBox(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Cool down: closes background apps (less CPU load), then shows the real battery temperature
 * and Android thermal status for two minutes so the user can see the actual change.
 */
@Composable
fun CoolDownScreen() {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var working by remember { mutableStateOf(false) }
    var runId by remember { androidx.compose.runtime.mutableIntStateOf(0) }
    var closed by remember { mutableStateOf<Int?>(null) }
    val temps = remember { mutableStateListOf<Float>() }
    var thermal by remember { mutableStateOf(c.monitor.thermal()) }
    var secondsLeft by remember { mutableStateOf(0) }
    val settings by c.settings.settings.collectAsStateWithLifecycle(initialValue = com.webtecit.devicepilot.data.AppSettings())
    val unit = settings.temperatureUnit

    LaunchedEffect(runId) {
        if (runId == 0) return@LaunchedEffect
        secondsLeft = 120
        while (isActive && secondsLeft > 0) {
            c.monitor.battery().celsius?.let { temps.add(it) }
            thermal = c.monitor.thermal()
            delay(5_000)
            secondsLeft -= 5
        }
    }

    ScreenList {
        item {
            Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                val now = temps.lastOrNull() ?: c.monitor.battery().celsius
                BigActionButton(
                    stringResource(if (working) R.string.cool_working else R.string.cool_button),
                    now?.let { TemperatureUtils.format(it, unit) } ?: "—",
                    Icons.Outlined.AcUnit, CoolGradient, working || secondsLeft > 0,
                ) {
                    working = true
                    temps.clear()
                    scope.launch {
                        closed = c.booster.boost().appsClosed
                        working = false
                        runId++
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.cool_hint), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        }
        if (closed != null) item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.cool_monitoring), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    if (thermal.supported) StatusPill(stringResource(thermalLabelRes(thermal.level)), thermalLevel(thermal.level))
                }
                Spacer(Modifier.height(6.dp))
                InfoRow(stringResource(R.string.boost_apps_closed), closed.toString())
                temps.firstOrNull()?.let { InfoRow(stringResource(R.string.cool_start_temp), TemperatureUtils.format(it, unit)) }
                temps.lastOrNull()?.let { InfoRow(stringResource(R.string.cool_now_temp), TemperatureUtils.format(it, unit)) }
                if (temps.size >= 2) {
                    val diff = temps.last() - temps.first()
                    InfoRow(stringResource(R.string.cool_change), String.format(java.util.Locale.US, "%+.1f °C", diff))
                    LineChart(temps.toList(), color = MaterialTheme.colorScheme.secondary)
                }
                if (secondsLeft > 0) Text(stringResource(R.string.cool_seconds_left, secondsLeft), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.cool_tips_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.cool_tips), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                ShortcutButton(stringResource(R.string.action_battery_saver), Icons.Outlined.BatterySaver) { SystemSettings.batterySaver(context) }
            }
        }
        item { SourceNote(stringResource(R.string.cool_note)) }
    }
}

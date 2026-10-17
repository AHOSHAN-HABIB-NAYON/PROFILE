package com.webtecit.devicepilot.ui.common

import android.provider.Settings
import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.ui.theme.LocalStatusColors

val LocalContainer = staticCompositionLocalOf<AppContainer> { error("AppContainer not provided") }
val LocalReducedMotion = staticCompositionLocalOf { false }

@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
}

enum class Level { GOOD, WARN, BAD, NEUTRAL, INFO }

@Composable
fun levelColor(level: Level): Color {
    val s = LocalStatusColors.current
    return when (level) {
        Level.GOOD -> s.good
        Level.WARN -> s.warn
        Level.BAD -> s.bad
        Level.NEUTRAL -> s.neutral
        Level.INFO -> MaterialTheme.colorScheme.primary
    }
}

/** Standard scrolling screen: consistent gutters and spacing. */
@Composable
fun ScreenList(
    modifier: Modifier = Modifier,
    state: LazyListState = rememberLazyListState(),
    content: LazyListScope.() -> Unit,
) {
    LazyColumn(
        modifier = modifier,
        state = state,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

/** One-time fade/slide entrance; disabled when the system turns animations off. */
@Composable
fun Modifier.entrance(index: Int = 0): Modifier {
    val reduced = LocalReducedMotion.current
    val anim = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (!reduced) anim.animateTo(1f, tween(durationMillis = 320, delayMillis = (index * 40).coerceAtMost(240), easing = FastOutSlowInEasing))
    }
    val density = LocalDensity.current
    return this.graphicsLayer {
        alpha = anim.value
        translationY = with(density) { (1f - anim.value) * 12.dp.toPx() }
    }
}

@Composable
fun DpCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: Dp = 16.dp,
    color: Color = MaterialTheme.colorScheme.surface,
    content: @Composable ColumnScope.() -> Unit,
) {
    val border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    val inner: @Composable () -> Unit = { Column(Modifier.padding(contentPadding), content = content) }
    if (onClick != null) {
        Surface(onClick = onClick, modifier = modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
            color = color, border = border, shadowElevation = 1.dp, content = inner)
    } else {
        Surface(modifier = modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
            color = color, border = border, shadowElevation = 1.dp, content = inner)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: @Composable (RowScope.() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f))
        trailing?.invoke(this)
    }
}

@Composable
fun StatusPill(text: String, level: Level, modifier: Modifier = Modifier) {
    val c = levelColor(level)
    Row(
        modifier
            .clip(RoundedCornerShape(50))
            .background(c.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(c))
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = c, maxLines = 1)
    }
}

@Composable
fun IconBadge(icon: ImageVector, tint: Color = MaterialTheme.colorScheme.primary, size: Dp = 36.dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(10.dp)).background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(size * 0.55f)) }
}

@Composable
fun RingGauge(
    progress: Float,
    modifier: Modifier = Modifier,
    size: Dp = 120.dp,
    stroke: Dp = 12.dp,
    color: Color = MaterialTheme.colorScheme.primary,
    trackColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    center: @Composable () -> Unit = {},
) {
    val reduced = LocalReducedMotion.current
    val animated by animateFloatAsState(
        targetValue = progress.coerceIn(0f, 1f),
        animationSpec = if (reduced) tween(0) else tween(700, easing = FastOutSlowInEasing),
        label = "ring",
    )
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val w = stroke.toPx()
            val style = Stroke(width = w, cap = StrokeCap.Round)
            val inset = w / 2
            val arcSize = androidx.compose.ui.geometry.Size(this.size.width - w, this.size.height - w)
            val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
            drawArc(trackColor, 135f, 270f, false, topLeft, arcSize, style = style)
            drawArc(
                Brush.sweepGradient(listOf(color.copy(alpha = 0.65f), color, color.copy(alpha = 0.65f))),
                135f, 270f * animated, false, topLeft, arcSize, style = style,
            )
        }
        center()
    }
}

@Composable
fun Meter(progress: Float, color: Color = MaterialTheme.colorScheme.primary, modifier: Modifier = Modifier) {
    val animated by animateFloatAsState(progress.coerceIn(0f, 1f), tween(500), label = "meter")
    LinearProgressIndicator(
        progress = { animated },
        modifier = modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)),
        color = color,
        trackColor = MaterialTheme.colorScheme.surfaceVariant,
        strokeCap = StrokeCap.Round,
        gapSize = 0.dp,
        drawStopIndicator = {},
    )
}

@Composable
fun MetricTile(
    icon: ImageVector,
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    level: Level = Level.INFO,
    progress: Float? = null,
    onClick: (() -> Unit)? = null,
) {
    DpCard(modifier = modifier, onClick = onClick, contentPadding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, tint = levelColor(level), size = 32.dp)
            Spacer(Modifier.width(10.dp))
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(10.dp))
        Text(value, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (progress != null) {
            Spacer(Modifier.height(8.dp))
            Meter(progress, levelColor(level))
        }
        if (subtitle != null) {
            Spacer(Modifier.height(6.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun InfoRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.45f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(0.55f))
    }
}

@Composable
fun SourceNote(text: String, modifier: Modifier = Modifier) {
    Row(modifier.padding(top = 6.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Info, null, Modifier.size(14.dp).padding(top = 2.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Illustration(@DrawableRes res: Int, modifier: Modifier = Modifier, height: Dp = 120.dp) {
    Image(painterResource(res), contentDescription = null, modifier = modifier.fillMaxWidth().height(height))
}

@Composable
fun HeroCard(@DrawableRes illustration: Int, title: String, subtitle: String, modifier: Modifier = Modifier) {
    DpCard(modifier, color = MaterialTheme.colorScheme.surface) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(8.dp))
            Image(painterResource(illustration), null, Modifier.width(120.dp).height(80.dp))
        }
    }
}

@Composable
fun PermissionCard(
    title: String,
    text: String,
    button: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    DpCard(modifier, color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(painterResource(R.drawable.ill_permission), null, Modifier.width(72.dp).height(48.dp))
            Spacer(Modifier.width(8.dp))
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(6.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        Button(onClick = onClick, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) { Text(button) }
    }
}

@Composable
fun EmptyState(@DrawableRes illustration: Int, title: String, text: String, modifier: Modifier = Modifier,
               action: String? = null, onAction: (() -> Unit)? = null) {
    Column(modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(painterResource(illustration), null, Modifier.width(180.dp).height(120.dp))
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 24.dp))
        if (action != null && onAction != null) {
            Spacer(Modifier.height(12.dp))
            FilledTonalButton(onClick = onAction) { Text(action) }
        }
    }
}

@Composable
fun ShortcutButton(text: String, icon: ImageVector? = null, modifier: Modifier = Modifier, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = modifier.heightIn(min = 40.dp),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
        if (icon != null) {
            Icon(icon, null, Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun NavRow(icon: ImageVector, title: String, subtitle: String? = null, tint: Color = MaterialTheme.colorScheme.primary,
           trailing: @Composable (() -> Unit)? = null, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = MaterialTheme.shapes.small, color = Color.Transparent) {
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, tint, 34.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (trailing != null) trailing() else Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun AppIcon(packageName: String, size: Dp = 40.dp) {
    val container = LocalContainer.current
    val px = with(LocalDensity.current) { size.roundToPx() }
    val bitmap by produceState<android.graphics.Bitmap?>(null, packageName) { value = container.apps.icon(packageName, px) }
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.24f)).background(MaterialTheme.colorScheme.surfaceVariant)) {
        bitmap?.let { Image(it.asImageBitmap(), null, Modifier.size(size)) }
    }
}

/** Small line chart drawn on Canvas — no chart library needed. */
@Composable
fun LineChart(values: List<Float>, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    val grid = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier.fillMaxWidth().height(120.dp)) {
        for (i in 0..3) {
            val y = size.height * i / 3f
            drawLine(grid, androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(size.width, y), 1f)
        }
        if (values.size < 2) return@Canvas
        val min = values.min()
        val max = values.max()
        val span = (max - min).takeIf { it > 0.5f } ?: 1f
        val stepX = size.width / (values.size - 1)
        fun y(v: Float) = size.height - ((v - min) / span) * (size.height * 0.8f) - size.height * 0.1f
        val line = Path().apply {
            values.forEachIndexed { i, v -> if (i == 0) moveTo(0f, y(v)) else lineTo(i * stepX, y(v)) }
        }
        val fill = Path().apply {
            addPath(line)
            lineTo(size.width, size.height); lineTo(0f, size.height); close()
        }
        drawPath(fill, Brush.verticalGradient(listOf(color.copy(alpha = 0.25f), Color.Transparent)))
        drawPath(line, color, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit,
                  destructive: Boolean = false) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirm, color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

@Composable
fun ProvideMotion(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalReducedMotion provides rememberReducedMotion(), content = content)
}

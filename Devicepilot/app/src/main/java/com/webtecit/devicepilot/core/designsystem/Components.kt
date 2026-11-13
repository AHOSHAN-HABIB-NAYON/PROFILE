package com.webtecit.devicepilot.core.designsystem

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.core.common.Reading

enum class Tone { GOOD, WARNING, BAD, INFO, NEUTRAL }

@Composable
fun Tone.color(): Color {
    val s = LocalStatusColors.current
    return when (this) {
        Tone.GOOD -> s.success
        Tone.WARNING -> s.warning
        Tone.BAD -> s.error
        Tone.INFO -> MaterialTheme.colorScheme.secondary
        Tone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

@Composable
private fun Tone.containerColors(): Pair<Color, Color> {
    val s = LocalStatusColors.current
    val cs = MaterialTheme.colorScheme
    return when (this) {
        Tone.GOOD -> s.successContainer to s.onSuccessContainer
        Tone.WARNING -> s.warningContainer to s.onWarningContainer
        Tone.BAD -> s.errorContainer to s.onErrorContainer
        Tone.INFO -> cs.secondaryContainer to cs.onSecondaryContainer
        Tone.NEUTRAL -> cs.surfaceContainerHigh to cs.onSurfaceVariant
    }
}

@Composable
fun AppLogo(size: Dp = 40.dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.ic_logo),
        contentDescription = "Devicepilot logo",
        modifier = modifier.size(size),
    )
}

@Composable
fun DpCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(Spacing.lg),
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    val border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    val elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    if (onClick != null) {
        Card(onClick = onClick, modifier = modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, colors = colors, border = border, elevation = elevation) {
            Column(Modifier.padding(contentPadding), content = content)
        }
    } else {
        Card(modifier = modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, colors = colors, border = border, elevation = elevation) {
            Column(Modifier.padding(contentPadding), content = content)
        }
    }
}

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, subtitle: String? = null, action: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = Spacing.sm, bottom = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        action?.invoke()
    }
}

@Composable
fun IconBadge(icon: ImageVector, tint: Color = MaterialTheme.colorScheme.primary, size: Dp = 40.dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(size * 0.55f))
    }
}

@Composable
fun StatusChip(text: String, tone: Tone, modifier: Modifier = Modifier) {
    val (bg, fg) = tone.containerColors()
    Surface(color = bg, contentColor = fg, shape = CircleShape, modifier = modifier) {
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            maxLines = 1,
        )
    }
}

@Composable
fun InfoRow(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color = Color.Unspecified, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(vertical = 7.dp).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.45f),
        )
        Spacer(Modifier.width(Spacing.sm))
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = if (valueColor == Color.Unspecified) MaterialTheme.colorScheme.onSurface else valueColor,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(0.55f),
        )
        trailing?.invoke()
    }
}

/** Shows a [Reading] and tags it as estimated / unavailable so values are never misrepresented. */
@Composable
fun <T> ReadingRow(label: String, reading: Reading<T>, format: (T) -> String) {
    when (reading) {
        is Reading.Measured -> InfoRow(label, format(reading.value))
        is Reading.Estimated -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { InfoRow(label, format(reading.value)) }
            Spacer(Modifier.width(6.dp))
            StatusChip("Est.", Tone.INFO)
        }
        is Reading.Unavailable -> InfoRow(label, reading.reason.label, valueColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f))
    }
}

@Composable
fun MetricRing(
    progress: Float,
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    strokeWidth: Dp = 10.dp,
    color: Color = MaterialTheme.colorScheme.primary,
    trackColor: Color = MaterialTheme.colorScheme.surfaceContainerHigh,
    center: @Composable () -> Unit = {},
) {
    val animated by animateFloatAsState(progress.coerceIn(0f, 1f), tween(700), label = "ring")
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round)
            val inset = strokeWidth.toPx() / 2
            val arcSize = androidx.compose.ui.geometry.Size(this.size.width - inset * 2, this.size.height - inset * 2)
            val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
            drawArc(trackColor, 135f, 270f, false, topLeft, arcSize, style = stroke)
            drawArc(color, 135f, 270f * animated, false, topLeft, arcSize, style = stroke)
        }
        center()
    }
}

@Composable
fun LinearMeter(progress: Float, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    val animated by animateFloatAsState(progress.coerceIn(0f, 1f), tween(600), label = "meter")
    LinearProgressIndicator(
        progress = { animated },
        modifier = modifier.fillMaxWidth().height(8.dp).clip(CircleShape),
        color = color,
        trackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        drawStopIndicator = {},
        gapSize = 0.dp,
    )
}

@Composable
fun UsageMeter(title: String, usedLabel: String, totalLabel: String, progress: Float, tone: Tone = toneForUsage(progress)) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text("$usedLabel / $totalLabel", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(6.dp))
        LinearMeter(progress, color = tone.color())
    }
}

fun toneForUsage(fraction: Float): Tone = when {
    fraction >= 0.9f -> Tone.BAD
    fraction >= 0.75f -> Tone.WARNING
    else -> Tone.GOOD
}

fun toneForTemperature(celsius: Float): Tone = when {
    celsius >= 45f -> Tone.BAD
    celsius >= 40f -> Tone.WARNING
    else -> Tone.GOOD
}

@Composable
fun LineChart(
    values: List<Float>,
    modifier: Modifier = Modifier,
    maxValue: Float? = null,
    color: Color = MaterialTheme.colorScheme.primary,
    height: Dp = 120.dp,
    capacity: Int = 60,
) {
    val grid = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier.fillMaxWidth().height(height).semantics { contentDescription = "Live graph" }) {
        val w = size.width
        val h = size.height
        for (i in 0..3) {
            val y = h * i / 3f
            drawLine(grid, androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(w, y), strokeWidth = 1f)
        }
        if (values.size < 2) return@Canvas
        val max = (maxValue ?: values.max()).takeIf { it > 0f } ?: 1f
        val step = w / (capacity - 1).coerceAtLeast(1)
        val startX = w - step * (values.size - 1)
        val line = Path()
        val fill = Path()
        values.forEachIndexed { i, v ->
            val x = startX + i * step
            val y = h - (v / max).coerceIn(0f, 1f) * h
            if (i == 0) {
                line.moveTo(x, y); fill.moveTo(x, h); fill.lineTo(x, y)
            } else {
                line.lineTo(x, y); fill.lineTo(x, y)
            }
        }
        fill.lineTo(startX + (values.size - 1) * step, h)
        fill.close()
        drawPath(fill, color.copy(alpha = 0.12f))
        drawPath(line, color, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))
    }
}

@Composable
fun QuickActionTile(icon: ImageVector, label: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier,
    ) {
        Column(
            Modifier.padding(vertical = 14.dp, horizontal = 6.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            IconBadge(icon, tint, 42.dp)
            Spacer(Modifier.height(8.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun NavRow(icon: ImageVector, title: String, subtitle: String? = null, tint: Color = MaterialTheme.colorScheme.primary, trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).clickable(onClick = onClick).padding(vertical = 10.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBadge(icon, tint, 38.dp)
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        trailing?.invoke()
    }
}

@Composable
fun ExpandableSection(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    initiallyExpanded: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    var expanded by rememberSaveable(title) { mutableStateOf(initiallyExpanded) }
    DpCard(modifier.animateContentSize(), contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.sm)) {
        Row(
            Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).clickable { expanded = !expanded }.padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconBadge(icon, MaterialTheme.colorScheme.secondary, 36.dp)
            Spacer(Modifier.width(Spacing.md))
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, contentDescription = if (expanded) "Collapse" else "Expand")
        }
        AnimatedVisibility(expanded, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Column(Modifier.padding(bottom = Spacing.sm), content = content)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DpScaffold(
    title: String,
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
    snackbarHostState: SnackbarHostState? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior(rememberTopAppBarState())
    Scaffold(
        modifier = modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { if (snackbarHostState != null) SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                    }
                },
                actions = actions,
                scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        content = content,
    )
}

/** Standard content padding for screen bodies. */
val ScreenPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = Spacing.sm, bottom = Spacing.xxl)

@Composable
fun LoadingState(message: String = "Loading…", modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(Spacing.xxl), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Spacer(Modifier.height(Spacing.md))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun MessageState(
    icon: ImageVector,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    Column(modifier.fillMaxWidth().padding(Spacing.xl), horizontalAlignment = Alignment.CenterHorizontally) {
        IconBadge(icon, tint, 56.dp)
        Spacer(Modifier.height(Spacing.md))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Spacing.xs))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(Spacing.lg))
            Button(onClick = onAction) { Text(actionLabel) }
        }
        if (secondaryLabel != null && onSecondary != null) {
            Spacer(Modifier.height(Spacing.xs))
            OutlinedButton(onClick = onSecondary) { Text(secondaryLabel) }
        }
    }
}

@Composable
fun EmptyState(title: String, message: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) =
    MessageState(Icons.Default.Inbox, title, message, actionLabel = actionLabel, onAction = onAction)

@Composable
fun ErrorState(message: String, onRetry: (() -> Unit)? = null) =
    MessageState(Icons.Default.ErrorOutline, "Something went wrong", message, actionLabel = onRetry?.let { "Try again" }, onAction = onRetry, tint = LocalStatusColors.current.error)

@Composable
fun PermissionState(
    title: String,
    rationale: String,
    onGrant: () -> Unit,
    grantLabel: String = "Allow access",
    onOpenSettings: (() -> Unit)? = null,
) = MessageState(
    Icons.Default.Lock, title, rationale,
    actionLabel = grantLabel, onAction = onGrant,
    secondaryLabel = onOpenSettings?.let { "Open app settings" }, onSecondary = onOpenSettings,
    tint = MaterialTheme.colorScheme.secondary,
)

@Composable
fun BulletText(text: String) {
    Row(Modifier.padding(vertical = 3.dp)) {
        Text("•", color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun NoteText(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}

@Composable
fun BigValue(value: String, label: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurface) {
    Column(modifier, horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.Center) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color, maxLines = 1)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

package com.webtecit.filepilot.core.designsystem

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.PriorityHigh
import androidx.compose.material.icons.rounded.RestoreFromTrash
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.io.File
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

enum class FeedbackKind { SAVED, DELETED, DELETED_PERMANENT, ERROR }

data class FeedbackEvent(
    val kind: FeedbackKind,
    val title: String,
    val detail: String = "",
    /** When set, an Undo button is offered. */
    val undo: (suspend () -> Unit)? = null,
    /** A saved file, so the popup can offer Open and Share. */
    val file: File? = null,
    /** Extra line under the details (e.g. "Kept in Recycle Bin for 30 days"). */
    val note: String? = null,
    val id: Long = System.nanoTime(),
)

/** App-wide "Saved" / "Deleted" confirmation shown as a popup in the middle of the screen. */
object Feedback {
    private val _current = MutableStateFlow<FeedbackEvent?>(null)
    val current: StateFlow<FeedbackEvent?> = _current

    fun deleted(title: String, detail: String = "", undo: (suspend () -> Unit)? = null) =
        show(FeedbackEvent(FeedbackKind.DELETED, title, detail, undo, note = if (undo != null) "Kept in Recycle Bin for 30 days" else null))

    fun deletedPermanently(title: String, detail: String = "") = show(FeedbackEvent(FeedbackKind.DELETED_PERMANENT, title, detail))

    fun saved(title: String = "Saved!", detail: String = "", file: File? = null) = show(FeedbackEvent(FeedbackKind.SAVED, title, detail, file = file))

    fun error(title: String, detail: String = "") = show(FeedbackEvent(FeedbackKind.ERROR, title, detail))

    fun show(event: FeedbackEvent) { _current.value = event }

    internal fun clear(id: Long) {
        if (_current.value?.id == id) _current.value = null
    }
}

private val Green = listOf(Color(0xFF3DDC9F), Color(0xFF12936A))
private val Red = listOf(Color(0xFFFF7A86), Color(0xFFD9364A))
private val Gray = listOf(Color(0xFF7A84A3), Color(0xFF3E4762))
private val Amber = listOf(Color(0xFFFFC15C), Color(0xFFF08A12))

/** Place once, above the app's content. */
@Composable
fun FeedbackHost() {
    val event by Feedback.current.collectAsState()
    var visible by remember { mutableStateOf(false) }
    var shown by remember { mutableStateOf<FeedbackEvent?>(null) }
    val haptics = LocalHapticFeedback.current
    val timer = remember { Animatable(1f) }

    LaunchedEffect(event?.id) {
        val e = event ?: return@LaunchedEffect
        shown = e
        visible = true
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        // Longer when there's something to press (Undo, Open).
        val ms = if (e.undo != null || e.file != null) 5000 else 3000
        timer.snapTo(1f)
        timer.animateTo(0f, tween(ms, easing = LinearEasing))
        visible = false
        delay(300)
        Feedback.clear(e.id)
    }
    fun close() {
        visible = false
        shown?.let { e -> Feedback.clear(e.id) }
    }

    AnimatedVisibility(visible, enter = fadeIn(tween(180)), exit = fadeOut(tween(220))) {
        Box(
            Modifier.fillMaxSize().background(Color(0xFF0E1222).copy(alpha = 0.45f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { close() },
        )
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AnimatedVisibility(
            visible = visible,
            enter = scaleIn(initialScale = 0.75f, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = 400f)) + fadeIn(),
            exit = scaleOut(targetScale = 0.92f) + fadeOut(),
        ) {
            shown?.let { FeedbackCard(it, timer.value, onClose = ::close) }
        }
    }
}

@Composable
private fun FeedbackCard(event: FeedbackEvent, timeLeft: Float, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = when (event.kind) {
        FeedbackKind.SAVED -> Green
        FeedbackKind.DELETED -> Red
        FeedbackKind.DELETED_PERMANENT -> Gray
        FeedbackKind.ERROR -> Amber
    }
    val accent = colors[1]
    Surface(
        shape = RoundedCornerShape(30.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 20.dp,
        modifier = Modifier.padding(horizontal = 20.dp).widthIn(max = 440.dp).fillMaxWidth().testTag("feedback_card")
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
    ) {
        Column(Modifier.padding(horizontal = 22.dp, vertical = 26.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Badge(event.kind, colors, event.id)
            Spacer(Modifier.height(14.dp))
            Text(event.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            if (event.detail.isNotEmpty() && event.file == null) {
                Spacer(Modifier.height(4.dp))
                Text(event.detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            event.file?.let { f ->
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val style = kindStyle(com.webtecit.filepilot.core.storage.FileTypes.kindOf(f.name, false))
                    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(style.tint.copy(alpha = 0.75f), style.tint))), contentAlignment = Alignment.Center) {
                        Icon(style.icon, null, tint = Color.White, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(f.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            event.detail.ifEmpty { f.parentFile?.name.orEmpty() },
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            event.note?.let {
                Spacer(Modifier.height(12.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.RestoreFromTrash, null, tint = Palette.Green, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val file = event.file
                val undo = event.undo
                when {
                    file != null -> {
                        CardButton("Share", Icons.Rounded.Share, filled = false, accent = accent, modifier = Modifier.weight(1f)) {
                            runCatching {
                                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                                com.webtecit.filepilot.core.storage.FileIntents.share(context, listOf(uri), listOf(com.webtecit.filepilot.core.storage.FileTypes.mimeOf(file.name)))
                            }
                            onClose()
                        }
                        CardButton("Open", Icons.AutoMirrored.Rounded.OpenInNew, filled = true, colors = colors, modifier = Modifier.weight(1f).testTag("feedback_open")) {
                            runCatching {
                                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                                com.webtecit.filepilot.core.storage.FileIntents.open(context, uri, com.webtecit.filepilot.core.storage.FileTypes.mimeOf(file.name), forceChooser = false)
                            }
                            onClose()
                        }
                    }
                    undo != null -> {
                        CardButton("Done", null, filled = false, accent = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f)) { onClose() }
                        CardButton("Undo", Icons.AutoMirrored.Rounded.Undo, filled = false, accent = accent, outlined = true, modifier = Modifier.weight(1f).testTag("undo")) {
                            onClose()
                            scope.launch { undo() }
                        }
                    }
                    else -> CardButton(if (event.kind == FeedbackKind.ERROR) "Close" else "Done", null, filled = false, accent = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f)) { onClose() }
                }
            }
            Spacer(Modifier.height(14.dp))
            // Time left before the popup closes itself.
            Box(Modifier.fillMaxWidth().height(3.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                Box(Modifier.fillMaxWidth(timeLeft.coerceIn(0f, 1f)).height(3.dp).clip(CircleShape).background(accent))
            }
        }
    }
}

@Composable
private fun CardButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    filled: Boolean,
    modifier: Modifier,
    accent: Color = Color.Unspecified,
    colors: List<Color> = Green,
    outlined: Boolean = false,
    onClick: () -> Unit,
) {
    val bg = when {
        filled -> Modifier.background(Brush.linearGradient(colors))
        outlined -> Modifier.background(accent.copy(alpha = 0.08f))
        else -> Modifier.background(MaterialTheme.colorScheme.surfaceContainerHigh)
    }
    Row(
        modifier.height(48.dp).clip(RoundedCornerShape(15.dp)).then(bg)
            .then(if (outlined) Modifier.background(Color.Transparent) else Modifier)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        val fg = if (filled) Color.White else accent
        if (icon != null) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(label, color = fg, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
    }
}

/** The animated round badge: check that draws itself, bin with a moving lid, etc. */
@Composable
private fun Badge(kind: FeedbackKind, colors: List<Color>, key: Long) {
    val pop = remember(key) { Animatable(0f) }
    val draw = remember(key) { Animatable(0f) }
    val burst = remember(key) { Animatable(0f) }
    LaunchedEffect(key) {
        launch { pop.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = 320f)) }
        launch { draw.animateTo(1f, tween(480, delayMillis = 160, easing = FastOutSlowInEasing)) }
        burst.animateTo(1f, tween(900, delayMillis = 300, easing = FastOutSlowInEasing))
    }
    val accent = colors[1]
    Box(Modifier.size(136.dp), contentAlignment = Alignment.Center) {
        // soft glow and ring
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = 0.20f), Color.Transparent)), radius = size.minDimension / 2)
            drawCircle(accent.copy(alpha = 0.28f * pop.value), radius = size.minDimension * 0.38f, style = Stroke(2.dp.toPx()))
            if (kind == FeedbackKind.SAVED) {
                // coloured sparks flying out
                val sparks = listOf(Color(0xFFFFC15C), Color(0xFF2F6BFF), Color(0xFFE0457B), Color(0xFF7C4DFF), Color(0xFF2BC48A), Color(0xFFFFC15C))
                val c = Offset(size.width / 2, size.height / 2)
                sparks.forEachIndexed { i, col ->
                    val angle = Math.toRadians((i * 60 + 25).toDouble())
                    val r = size.minDimension * (0.30f + 0.18f * burst.value)
                    val p = Offset(c.x + (cos(angle) * r).toFloat(), c.y + (sin(angle) * r).toFloat())
                    drawCircle(col.copy(alpha = (1f - burst.value * 0.6f)), radius = (3.5f + (i % 2) * 1.5f).dp.toPx(), center = p)
                }
            }
            if (kind == FeedbackKind.DELETED) {
                // two pages falling into the bin
                val fall = draw.value
                listOf(-1f, 1f).forEach { side ->
                    val x = size.width / 2 + side * size.width * (0.32f - 0.22f * fall)
                    val y = size.height * (0.14f + 0.30f * fall)
                    rotate(side * 20f * (1 - fall), Offset(x, y)) {
                        drawRoundRect(
                            Color.White, topLeft = Offset(x - 8.dp.toPx(), y - 10.dp.toPx()), size = Size(16.dp.toPx(), 20.dp.toPx()),
                            cornerRadius = CornerRadius(4.dp.toPx()), alpha = 1f - fall,
                        )
                        drawRoundRect(
                            accent.copy(alpha = 0.5f * (1f - fall)), topLeft = Offset(x - 8.dp.toPx(), y - 10.dp.toPx()), size = Size(16.dp.toPx(), 20.dp.toPx()),
                            cornerRadius = CornerRadius(4.dp.toPx()), style = Stroke(1.5.dp.toPx()),
                        )
                    }
                }
            }
        }
        Box(
            Modifier.size(80.dp).graphicsLayer {
                val s = 0.55f + 0.45f * pop.value
                scaleX = s
                scaleY = s
                rotationZ = if (kind == FeedbackKind.DELETED) (1f - burst.value) * 6f * sin(burst.value * 12f) else 0f
            }.clip(CircleShape).background(Brush.linearGradient(colors)),
            contentAlignment = Alignment.Center,
        ) {
            when (kind) {
                FeedbackKind.SAVED -> Canvas(Modifier.size(42.dp)) {
                    val path = Path().apply {
                        moveTo(size.width * 0.18f, size.height * 0.53f)
                        lineTo(size.width * 0.42f, size.height * 0.76f)
                        lineTo(size.width * 0.84f, size.height * 0.28f)
                    }
                    val measure = PathMeasure().apply { setPath(path, false) }
                    val part = Path()
                    measure.getSegment(0f, measure.length * draw.value, part, true)
                    drawPath(part, Color.White, style = Stroke(5.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
                FeedbackKind.DELETED -> Canvas(Modifier.size(40.dp)) {
                    val w = size.width
                    val h = size.height
                    // body
                    val body = Path().apply {
                        moveTo(w * 0.24f, h * 0.36f)
                        lineTo(w * 0.76f, h * 0.36f)
                        lineTo(w * 0.70f, h * 0.88f)
                        lineTo(w * 0.30f, h * 0.88f)
                        close()
                    }
                    drawPath(body, Color.White)
                    for (i in 0..2) {
                        val x = w * (0.40f + i * 0.10f)
                        drawLine(colors[1].copy(alpha = 0.55f), Offset(x, h * 0.46f), Offset(x, h * 0.78f), 2.dp.toPx(), StrokeCap.Round)
                    }
                    // lid opens then closes
                    val open = if (draw.value < 0.5f) draw.value * 2 else (1 - draw.value) * 2
                    rotate(-30f * open, Offset(w * 0.20f, h * 0.28f)) {
                        drawRoundRect(Color.White, topLeft = Offset(w * 0.18f, h * 0.24f), size = Size(w * 0.64f, h * 0.08f), cornerRadius = CornerRadius(h * 0.04f))
                        drawRoundRect(Color.White, topLeft = Offset(w * 0.42f, h * 0.16f), size = Size(w * 0.16f, h * 0.08f), cornerRadius = CornerRadius(h * 0.03f))
                    }
                }
                FeedbackKind.DELETED_PERMANENT -> Icon(Icons.Rounded.DeleteForever, null, tint = Color.White, modifier = Modifier.size(40.dp))
                FeedbackKind.ERROR -> Icon(Icons.Rounded.PriorityHigh, null, tint = Color.White, modifier = Modifier.size(40.dp))
            }
        }
    }
}

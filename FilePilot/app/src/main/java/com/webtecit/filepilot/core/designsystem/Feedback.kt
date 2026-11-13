package com.webtecit.filepilot.core.designsystem

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

enum class FeedbackKind { DELETED, SAVED }

data class FeedbackEvent(
    val kind: FeedbackKind,
    val title: String,
    val detail: String = "",
    /** When set, an Undo button is offered for a few seconds after the animation. */
    val undo: (suspend () -> Unit)? = null,
    val id: Long = System.nanoTime(),
)

/** App-wide "Deleted" / "Saved" confirmation with an animation, shown above every screen. */
object Feedback {
    private val _current = MutableStateFlow<FeedbackEvent?>(null)
    val current: StateFlow<FeedbackEvent?> = _current

    fun deleted(title: String, detail: String = "", undo: (suspend () -> Unit)? = null) =
        show(FeedbackEvent(FeedbackKind.DELETED, title, detail, undo))

    fun saved(title: String = "Saved", detail: String = "") = show(FeedbackEvent(FeedbackKind.SAVED, title, detail))

    fun show(event: FeedbackEvent) { _current.value = event }

    internal fun clear(id: Long) {
        if (_current.value?.id == id) _current.value = null
    }
}

/** Place once, above the app's content. */
@Composable
fun FeedbackHost() {
    val event by Feedback.current.collectAsState()
    var cardVisible by remember { mutableStateOf(false) }
    var undoVisible by remember { mutableStateOf(false) }
    var shown by remember { mutableStateOf<FeedbackEvent?>(null) }
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(event?.id) {
        val e = event ?: return@LaunchedEffect
        shown = e
        undoVisible = false
        cardVisible = true
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        delay(1300)
        cardVisible = false
        if (e.undo != null) {
            undoVisible = true
            delay(5000)
            undoVisible = false
        }
        delay(300)
        Feedback.clear(e.id)
    }

    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = cardVisible,
            enter = scaleIn(initialScale = 0.7f, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)) + fadeIn(),
            exit = scaleOut(targetScale = 0.9f) + fadeOut(),
            modifier = Modifier.align(Alignment.Center),
        ) {
            shown?.let { FeedbackCard(it) }
        }
        AnimatedVisibility(
            visible = undoVisible,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp).padding(bottom = 76.dp),
        ) {
            val e = shown
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.inverseSurface,
                shadowElevation = 8.dp,
                modifier = Modifier.widthIn(max = 480.dp),
            ) {
                Row(Modifier.padding(start = 16.dp, end = 6.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        e?.title.orEmpty(), color = MaterialTheme.colorScheme.inverseOnSurface,
                        style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(8.dp))
                    TextButton(
                        onClick = {
                            undoVisible = false
                            e?.undo?.let { u -> scope.launch { u() } }
                        },
                        modifier = Modifier.testTag("undo"),
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.Undo, null, tint = MaterialTheme.colorScheme.inversePrimary, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Undo", color = MaterialTheme.colorScheme.inversePrimary, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun FeedbackCard(event: FeedbackEvent) {
    val deleted = event.kind == FeedbackKind.DELETED
    val colors = if (deleted) listOf(Color(0xFFF0566B), Color(0xFFD02F45)) else listOf(Color(0xFF2BC48A), Palette.Green)
    val ring = if (deleted) Color(0xFFE0455A) else Palette.Green
    val draw = remember(event.id) { Animatable(0f) }
    val bounce = remember(event.id) { Animatable(0f) }
    LaunchedEffect(event.id) {
        launch { draw.animateTo(1f, tween(450, delayMillis = 120, easing = FastOutSlowInEasing)) }
        bounce.animateTo(1f, spring(dampingRatio = 0.35f, stiffness = 300f))
    }
    Surface(
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 16.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        modifier = Modifier.width(220.dp).testTag("feedback_card"),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(86.dp).clip(CircleShape).background(ring.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.size(62.dp).graphicsLayer {
                        val s = 0.6f + 0.4f * bounce.value
                        scaleX = s
                        scaleY = s
                    }.clip(CircleShape).background(Brush.linearGradient(colors)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (deleted) {
                        Icon(
                            Icons.Rounded.Delete, null, tint = Color.White,
                            modifier = Modifier.size(32.dp).graphicsLayer { rotationZ = (1f - bounce.value) * -25f },
                        )
                    } else {
                        // A check mark that draws itself.
                        Canvas(Modifier.size(34.dp)) {
                            val path = Path().apply {
                                moveTo(size.width * 0.16f, size.height * 0.54f)
                                lineTo(size.width * 0.42f, size.height * 0.78f)
                                lineTo(size.width * 0.86f, size.height * 0.26f)
                            }
                            val measure = PathMeasure().apply { setPath(path, false) }
                            val part = Path()
                            measure.getSegment(0f, measure.length * draw.value, part, true)
                            drawPath(part, Color.White, style = Stroke(5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(event.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            if (event.detail.isNotEmpty()) {
                Text(
                    event.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

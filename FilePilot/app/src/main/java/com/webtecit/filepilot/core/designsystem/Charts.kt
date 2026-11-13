package com.webtecit.filepilot.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

data class ChartSegment(val label: String, val value: Float, val color: Color)

/** A ring chart; segments are drawn clockwise from the top with small gaps between them. */
@Composable
fun DonutChart(
    segments: List<ChartSegment>,
    modifier: Modifier = Modifier,
    size: Dp = 160.dp,
    thickness: Dp = 18.dp,
    trackColor: Color = MaterialTheme.colorScheme.surfaceContainerHighest,
    center: @Composable () -> Unit = {},
) {
    val total = segments.sumOf { it.value.toDouble() }.toFloat()
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = thickness.toPx()
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            val topLeft = Offset(stroke / 2, stroke / 2)
            drawArc(trackColor, 0f, 360f, false, topLeft, arcSize, style = Stroke(stroke))
            if (total > 0f) {
                var start = -90f
                val gap = if (segments.count { it.value > 0f } > 1) 2f else 0f
                segments.forEach { s ->
                    val sweep = s.value / total * 360f
                    if (sweep > gap) {
                        drawArc(s.color, start + gap / 2, sweep - gap, false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Butt))
                    }
                    start += sweep
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) { center() }
    }
}

/** A single-value progress ring. */
@Composable
fun ProgressRing(
    fraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    thickness: Dp = 10.dp,
    trackColor: Color = MaterialTheme.colorScheme.surfaceContainerHighest,
    center: @Composable () -> Unit = {},
) {
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = thickness.toPx()
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            val topLeft = Offset(stroke / 2, stroke / 2)
            drawArc(trackColor, 0f, 360f, false, topLeft, arcSize, style = Stroke(stroke))
            drawArc(color, -90f, 360f * fraction.coerceIn(0f, 1f), false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) { center() }
    }
}

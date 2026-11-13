package com.webtecit.filepilot.core.designsystem

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

/** A radar-style scanning animation with pulsing rings and file icons circling the centre. */
@Composable
fun ScanAnimation(
    title: String,
    detail: String,
    modifier: Modifier = Modifier,
    size: Dp = 200.dp,
) {
    val animations = LocalAnimationsEnabled.current
    val t = rememberInfiniteTransition(label = "scan")
    val sweep by t.animateFloat(0f, 360f, infiniteRepeatable(tween(if (animations) 1800 else 100000, easing = LinearEasing)), label = "sweep")
    val pulse by t.animateFloat(0f, 1f, infiniteRepeatable(tween(if (animations) 1600 else 100000, easing = LinearEasing), RepeatMode.Restart), label = "pulse")
    val primary = MaterialTheme.colorScheme.primary
    val tertiary = MaterialTheme.colorScheme.tertiary
    Column(modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(size), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(size)) {
                val r = this.size.minDimension / 2
                listOf(pulse, (pulse + 0.5f) % 1f).forEach { p ->
                    drawCircle(primary.copy(alpha = (1f - p) * 0.35f), radius = r * (0.35f + 0.65f * p), style = Stroke(2.dp.toPx()))
                }
                drawCircle(primary.copy(alpha = 0.08f), radius = r)
                drawCircle(primary.copy(alpha = 0.18f), radius = r * 0.66f, style = Stroke(1.dp.toPx()))
                drawCircle(primary.copy(alpha = 0.18f), radius = r * 0.33f, style = Stroke(1.dp.toPx()))
                rotate(sweep) {
                    drawArc(
                        Brush.sweepGradient(listOf(primary.copy(alpha = 0f), primary.copy(alpha = 0f), tertiary.copy(alpha = 0.55f)), center = center),
                        startAngle = -90f, sweepAngle = 90f, useCenter = true,
                        topLeft = Offset(center.x - r, center.y - r), size = androidx.compose.ui.geometry.Size(r * 2, r * 2),
                    )
                }
            }
            val icons = listOf(Icons.Rounded.Image, Icons.Rounded.Movie, Icons.Rounded.MusicNote, Icons.Rounded.Description, Icons.Rounded.Folder)
            icons.forEachIndexed { i, icon ->
                val angle = Math.toRadians((sweep * 0.5 + i * 72.0))
                val rad = size.value * 0.36f
                Icon(
                    icon, null, tint = if (i % 2 == 0) primary else tertiary,
                    modifier = Modifier.offset(x = (cos(angle) * rad).dp, y = (sin(angle) * rad).dp).size(20.dp),
                )
            }
            AppLogo(size * 0.28f)
        }
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Text(
            detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
    }
}

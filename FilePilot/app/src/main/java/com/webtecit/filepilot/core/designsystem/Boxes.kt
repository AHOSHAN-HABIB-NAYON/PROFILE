package com.webtecit.filepilot.core.designsystem

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** The app's icon colours: one calm set used on every screen. */
object Palette {
    val Blue = Color(0xFF2F6BFF)
    val Pink = Color(0xFFE0457B)
    val Orange = Color(0xFFE88A12)
    val Green = Color(0xFF1A9D6B)
    val Purple = Color(0xFF7C4DFF)
    val Cyan = Color(0xFF0E93B0)
    val Slate = Color(0xFF4B5470)
    val Red = Color(0xFFE0455A)
    val Navy = Color(0xFF1A45C9)
}

/** Fades and slides content in once, a little later for each [index], so grids appear one by one. */
@Composable
fun Modifier.enterAnimation(index: Int = 0): Modifier {
    val animations = LocalAnimationsEnabled.current
    val progress = remember { Animatable(if (animations) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (animations) {
            delay(45L * index.coerceAtMost(12))
            progress.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
        }
    }
    return this.graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 22.dp.toPx()
        val s = 0.94f + 0.06f * progress.value
        scaleX = s
        scaleY = s
    }
}

/**
 * The standard square box used for categories and tools: white card, coloured icon tile,
 * one-line label and an optional second line. Every box in a grid has the same size.
 */
@Composable
fun GridBox(
    label: String,
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    height: Dp = 88.dp,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f, label = "press")
    Surface(
        onClick = onClick,
        interactionSource = interaction,
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        shadowElevation = 1.dp,
        modifier = modifier.height(height).graphicsLayer { scaleX = scale; scaleY = scale },
    ) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 4.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            IconTile(icon, tint, size = 40.dp)
            Spacer(Modifier.height(7.dp))
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Lays items out in equal columns; every cell gets the same width, and cells appear one by one. */
@Composable
fun <T> EqualGrid(
    items: List<T>,
    columns: Int,
    spacing: Dp = 8.dp,
    modifier: Modifier = Modifier,
    cell: @Composable (item: T, modifier: Modifier) -> Unit,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(spacing)) {
        items.chunked(columns).forEachIndexed { r, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
                row.forEachIndexed { c, item ->
                    cell(item, Modifier.weight(1f).enterAnimation(r * columns + c))
                }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

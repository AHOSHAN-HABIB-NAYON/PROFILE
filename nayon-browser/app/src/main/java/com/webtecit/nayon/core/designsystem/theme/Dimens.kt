package com.webtecit.nayon.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** 4dp-based spacing scale. */
object Spacing {
    val xxs = 2.dp
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val xxxl = 48.dp

    /** Horizontal gutter for screen content. */
    val gutter = 16.dp
}

object Radius {
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
}

object IconSize {
    val sm = 18.dp
    val md = 24.dp
    val lg = 32.dp
    val xl = 48.dp
}

object Layout {
    /** Content never stretches wider than this on tablets / landscape, keeping lines readable. */
    val maxContentWidth = 640.dp
    /** Minimum touch target (Material / accessibility guidance). */
    val minTouchTarget = 48.dp
    /** Minimum width of one theme card before the grid adds a column. */
    val themeCardMinWidth = 150.dp
}

val NayonShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(Radius.sm),
    medium = RoundedCornerShape(Radius.md),
    large = RoundedCornerShape(Radius.lg),
    extraLarge = RoundedCornerShape(Radius.xl),
)

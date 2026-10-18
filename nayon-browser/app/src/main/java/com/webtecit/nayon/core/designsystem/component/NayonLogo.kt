package com.webtecit.nayon.core.designsystem.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Brand colours of the NAYON monogram. Identical in every theme, like the launcher icon. */
object NayonBrand {
    val cyan = Color(0xFF22D3EE)
    val blue = Color(0xFF3B82F6)
    val violet = Color(0xFF8B5CF6)
}

/**
 * The NAYON "N" monogram, drawn from the same geometry as the launcher icon
 * (a 108-unit viewport, content between 28 and 80).
 */
@Composable
fun NayonLogo(modifier: Modifier = Modifier, size: Dp = 48.dp) {
    Canvas(modifier.size(size)) {
        // Map the icon's 26..82 region onto the canvas so the mark fills it.
        val unit = this.size.minDimension / 56f
        fun p(x: Float, y: Float) = Offset((x - 26f) * unit, (y - 26f) * unit)

        val n = Path().apply {
            val pts = listOf(33f to 76f, 33f to 32f, 45f to 32f, 63f to 58f, 63f to 32f,
                75f to 32f, 75f to 76f, 63f to 76f, 45f to 50f, 45f to 76f)
            pts.forEachIndexed { i, (x, y) -> val o = p(x, y); if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) }
            close()
        }
        drawPath(
            n,
            Brush.linearGradient(
                0f to NayonBrand.cyan, 0.55f to NayonBrand.blue, 1f to NayonBrand.violet,
                start = p(33f, 32f), end = p(75f, 76f),
            ),
        )
        val stroke = Stroke(width = 2.5f * unit, cap = StrokeCap.Round)
        drawPath(
            Path().apply {
                val a = p(28f, 64f); moveTo(a.x, a.y)
                val c1 = p(22f, 52f); val c2 = p(30f, 40f); val e = p(46f, 35f)
                cubicTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y)
            },
            NayonBrand.violet.copy(alpha = 0.6f), style = stroke,
        )
        drawPath(
            Path().apply {
                val a = p(80f, 44f); moveTo(a.x, a.y)
                val c1 = p(86f, 56f); val c2 = p(78f, 68f); val e = p(62f, 73f)
                cubicTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y)
            },
            NayonBrand.cyan.copy(alpha = 0.6f), style = stroke,
        )
    }
}

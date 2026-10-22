package com.oryzenx.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.oryzenx.app.data.Fmt
import com.oryzenx.app.ui.theme.Ox

@Immutable
data class Candle(val time: Long, val open: Double, val high: Double, val low: Double, val close: Double)

/**
 * Candlestick chart drawn directly on a Canvas: no allocation per frame beyond the path, redraws only when
 * data or the selected candle changes (smooth on 90/120 Hz displays). Long-press and drag shows a crosshair.
 * Doubles are used for drawing coordinates only; displayed prices come from the decimal strings.
 */
@Composable
fun CandlestickChart(candles: List<Candle>, height: Dp = 260.dp, priceDecimals: Int? = null, description: String = "") {
    val c = Ox.colors
    var selected by remember(candles) { mutableStateOf<Int?>(null) }
    if (candles.isEmpty()) return
    val minP = candles.minOf { it.low }
    val maxP = candles.maxOf { it.high }
    val range = (maxP - minP).takeIf { it > 0 } ?: 1.0
    Box(Modifier.fillMaxWidth().height(height).semantics { contentDescription = description }) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(height)
                .pointerInput(candles) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = { o -> selected = ((o.x / size.width) * candles.size).toInt().coerceIn(0, candles.lastIndex) },
                        onDrag = { change, _ -> selected = ((change.position.x / size.width) * candles.size).toInt().coerceIn(0, candles.lastIndex) },
                        onDragEnd = { selected = null }, onDragCancel = { selected = null },
                    )
                }
                .pointerInput(candles) { detectTapGestures(onTap = { selected = null }) },
        ) {
            val w = size.width
            val h = size.height
            val top = 12f
            val bottom = h - 8f
            fun y(p: Double) = (top + (1 - (p - minP) / range) * (bottom - top)).toFloat()
            for (i in 1..3) {
                val gy = top + (bottom - top) * i / 4f
                drawLine(c.border, Offset(0f, gy), Offset(w, gy), strokeWidth = 1f)
            }
            val step = w / candles.size
            val body = (step * 0.62f).coerceAtLeast(1.5f)
            candles.forEachIndexed { i, k ->
                val x = step * i + step / 2
                val color = if (k.close >= k.open) c.gain else c.loss
                drawLine(color, Offset(x, y(k.high)), Offset(x, y(k.low)), strokeWidth = (step * 0.12f).coerceIn(1f, 2.5f))
                val t = y(maxOf(k.open, k.close))
                val b = y(minOf(k.open, k.close))
                drawRect(color, Offset(x - body / 2, t), Size(body, (b - t).coerceAtLeast(1.5f)))
            }
            val last = candles.last()
            drawLine(c.text3, Offset(0f, y(last.close)), Offset(w, y(last.close)), strokeWidth = 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
            selected?.let { i ->
                val x = step * i + step / 2
                drawLine(c.text2, Offset(x, 0f), Offset(x, h), strokeWidth = 1f)
            }
        }
        val sel = selected?.let { candles[it] }
        if (sel != null) {
            Text(
                "O ${Fmt.price(sel.open.toBigDecimal().toPlainString(), priceDecimals)}  H ${Fmt.price(sel.high.toBigDecimal().toPlainString(), priceDecimals)}  L ${Fmt.price(sel.low.toBigDecimal().toPlainString(), priceDecimals)}  C ${Fmt.price(sel.close.toBigDecimal().toPlainString(), priceDecimals)}",
                style = MaterialTheme.typography.bodySmall, color = c.text2, modifier = Modifier.align(Alignment.TopStart),
            )
        } else {
            Text(Fmt.price(maxP.toBigDecimal().toPlainString(), priceDecimals), style = MaterialTheme.typography.bodySmall, color = c.text3, modifier = Modifier.align(Alignment.TopEnd))
            Text(Fmt.price(minP.toBigDecimal().toPlainString(), priceDecimals), style = MaterialTheme.typography.bodySmall, color = c.text3, modifier = Modifier.align(Alignment.BottomEnd))
        }
    }
}

/** Area/line chart for portfolio net-value history. */
@Composable
fun AreaChart(values: List<Double>, height: Dp = 160.dp, description: String = "") {
    val c = Ox.colors
    if (values.size < 2) return
    val min = values.min()
    val max = values.max()
    val range = (max - min).takeIf { it > 0 } ?: 1.0
    Canvas(Modifier.fillMaxWidth().height(height).semantics { contentDescription = description }) {
        val step = size.width / (values.size - 1)
        fun y(v: Double) = (8f + (1 - (v - min) / range) * (size.height - 16f)).toFloat()
        val line = Path().apply {
            moveTo(0f, y(values[0]))
            values.forEachIndexed { i, v -> if (i > 0) lineTo(step * i, y(v)) }
        }
        val fill = Path().apply {
            addPath(line)
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        drawPath(fill, Brush.verticalGradient(listOf(c.primary.copy(alpha = 0.22f), c.primary.copy(alpha = 0f))))
        drawPath(line, c.primary, style = Stroke(width = 2.2.dp.toPx()))
    }
}

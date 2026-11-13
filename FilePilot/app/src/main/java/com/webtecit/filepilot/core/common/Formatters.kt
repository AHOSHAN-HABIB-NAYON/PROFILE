package com.webtecit.filepilot.core.common

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

object Formatters {
    private val units = arrayOf("B", "KB", "MB", "GB", "TB", "PB")

    /** Decimal units (1 KB = 1000 B), the same as Android's own storage settings. */
    fun size(bytes: Long): String {
        if (bytes < 0) return "—"
        if (bytes < 1000) return "$bytes B"
        var value = bytes.toDouble()
        var unit = 0
        while (abs(value) >= 1000 && unit < units.lastIndex) {
            value /= 1000.0
            unit++
        }
        val text = if (value >= 100) String.format(Locale.US, "%.0f", value)
        else String.format(Locale.US, "%.1f", value)
        return "$text ${units[unit]}"
    }

    fun date(millis: Long): String {
        if (millis <= 0) return "—"
        return SimpleDateFormat("d MMM yyyy, HH:mm", Locale.ENGLISH).format(Date(millis))
    }

    fun shortDate(millis: Long): String {
        if (millis <= 0) return "—"
        return SimpleDateFormat("d MMM yyyy", Locale.ENGLISH).format(Date(millis))
    }

    fun count(n: Int, singular: String, plural: String = singular + "s"): String =
        "$n ${if (n == 1) singular else plural}"

    fun duration(millis: Long): String {
        val totalSeconds = millis / 1000
        val h = totalSeconds / 3600
        val m = (totalSeconds % 3600) / 60
        val s = totalSeconds % 60
        return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s)
        else String.format(Locale.US, "%d:%02d", m, s)
    }

    fun percent(fraction: Float): String = "${(fraction.coerceIn(0f, 1f) * 100).toInt()}%"
}

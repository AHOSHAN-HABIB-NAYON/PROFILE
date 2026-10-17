package com.webtecit.devicepilot.domain

import java.util.Locale
import kotlin.math.abs

/** Pure formatting helpers. Kept free of Android classes so they can be unit-tested. */
object Formatters {

    private val units = arrayOf("B", "KB", "MB", "GB", "TB", "PB")

    /** Binary (1024-based) human-readable size, e.g. 1536 -> "1.5 KB". */
    fun bytes(value: Long, locale: Locale = Locale.US): String {
        if (value < 0) return "—"
        if (value < 1024) return "$value B"
        var size = value.toDouble()
        var unit = 0
        while (size >= 1024 && unit < units.lastIndex) {
            size /= 1024
            unit++
        }
        val pattern = if (size >= 100) "%.0f %s" else if (size >= 10) "%.1f %s" else "%.2f %s"
        return String.format(locale, pattern, size, units[unit])
    }

    fun percent(part: Long, total: Long): Int {
        if (total <= 0) return 0
        return ((part.toDouble() / total.toDouble()) * 100.0).coerceIn(0.0, 100.0).toInt()
    }

    fun oneDecimal(value: Float, locale: Locale = Locale.US): String =
        String.format(locale, "%.1f", value)

    /** Formats a duration in milliseconds as "2h 05m" / "12m" / "45s". */
    fun duration(ms: Long): String {
        val totalSec = abs(ms) / 1000
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return when {
            h > 0 -> String.format(Locale.US, "%dh %02dm", h, m)
            m > 0 -> "${m}m"
            else -> "${s}s"
        }
    }
}

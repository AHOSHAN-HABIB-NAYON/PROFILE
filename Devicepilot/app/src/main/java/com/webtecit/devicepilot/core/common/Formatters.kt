package com.webtecit.devicepilot.core.common

import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.pow

object Formatters {

    /** Binary-unit size formatting (1 KB = 1024 B), matching how Android shows storage. */
    fun bytes(bytes: Long): String {
        if (bytes < 0) return "—"
        if (bytes < 1024) return "$bytes B"
        val exp = (ln(bytes.toDouble()) / ln(1024.0)).toInt().coerceAtMost(5)
        val unit = "KMGTP"[exp - 1]
        val value = bytes / 1024.0.pow(exp)
        return if (value >= 100) String.format(Locale.US, "%.0f %sB", value, unit)
        else String.format(Locale.US, "%.1f %sB", value, unit)
    }

    fun percent(value: Float, decimals: Int = 0): String =
        String.format(Locale.US, "%.${decimals}f%%", value)

    fun celsius(value: Float): String = String.format(Locale.US, "%.1f °C", value)

    fun volts(millivolts: Int): String = String.format(Locale.US, "%.2f V", millivolts / 1000f)

    fun milliAmps(microAmps: Long): String = String.format(Locale.US, "%d mA", microAmps / 1000)

    fun hertz(value: Float): String = String.format(Locale.US, "%.0f Hz", value)

    fun mhz(khz: Long): String = String.format(Locale.US, "%.0f MHz", khz / 1000f)

    fun mbps(bitsPerSecond: Double): String = when {
        bitsPerSecond >= 1_000_000 -> String.format(Locale.US, "%.1f Mbps", bitsPerSecond / 1_000_000)
        bitsPerSecond >= 1_000 -> String.format(Locale.US, "%.0f Kbps", bitsPerSecond / 1_000)
        else -> String.format(Locale.US, "%.0f bps", bitsPerSecond)
    }

    fun rate(bytesPerSecond: Long): String = "${bytes(bytesPerSecond)}/s"

    fun duration(millis: Long): String {
        val totalMinutes = abs(millis) / 60_000
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return when {
            hours > 0 -> "${hours}h ${minutes}m"
            minutes > 0 -> "${minutes}m"
            else -> "<1m"
        }
    }

    fun dateTime(epochMillis: Long): String =
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(epochMillis))

    fun date(epochMillis: Long): String =
        DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))
}

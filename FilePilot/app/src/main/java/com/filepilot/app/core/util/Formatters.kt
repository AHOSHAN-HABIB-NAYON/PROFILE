package com.filepilot.app.core.util

import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ln
import kotlin.math.pow

object Format {
    /** Human readable size using 1024-based units, e.g. "4.2 MB". */
    fun size(bytes: Long): String {
        if (bytes < 0) return "—"
        if (bytes < 1024) return "$bytes B"
        val units = arrayOf("KB", "MB", "GB", "TB", "PB")
        val exp = (ln(bytes.toDouble()) / ln(1024.0)).toInt().coerceIn(1, units.size)
        val value = bytes / 1024.0.pow(exp)
        val pattern = if (value >= 100) "%.0f %s" else if (value >= 10) "%.1f %s" else "%.2f %s"
        return String.format(Locale.getDefault(), pattern, value, units[exp - 1])
    }

    // DateFormat is costly to create and not thread-safe: keep one per thread.
    private val dateFormat = object : ThreadLocal<DateFormat>() {
        override fun initialValue(): DateFormat = DateFormat.getDateInstance(DateFormat.MEDIUM)
    }
    private val dateTimeFormat = object : ThreadLocal<DateFormat>() {
        override fun initialValue(): DateFormat = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT)
    }

    fun date(millis: Long): String =
        if (millis <= 0) "—" else dateFormat.get()!!.format(Date(millis))

    fun dateTime(millis: Long): String =
        if (millis <= 0) "—" else dateTimeFormat.get()!!.format(Date(millis))

    fun items(count: Int): String = if (count == 1) "1 item" else "$count items"

    fun percent(part: Long, total: Long): String =
        if (total <= 0) "0%" else "${(part * 100 / total).coerceIn(0, 100)}%"
}

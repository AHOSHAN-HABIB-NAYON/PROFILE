package com.oryzenx.app.data

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Display formatting only. Stored values are never changed by the display language. */
object Fmt {
    var zone: ZoneId = runCatching { ZoneId.of("Asia/Dhaka") }.getOrDefault(ZoneOffset.UTC)

    private fun locale(): Locale = if (I18n.locale == "bn") Locale.forLanguageTag("bn-BD") else Locale.US

    fun dec(v: String?): BigDecimal? = v?.trim()?.takeIf { it.isNotEmpty() }?.toBigDecimalOrNull()

    private fun nf(min: Int, max: Int): NumberFormat = NumberFormat.getNumberInstance(locale()).apply {
        minimumFractionDigits = min; maximumFractionDigits = max; roundingMode = RoundingMode.HALF_UP
    }

    fun usd(v: String?): String {
        val d = dec(v) ?: return "—"
        val abs = d.abs()
        val max = when { abs.signum() == 0 || abs >= BigDecimal.ONE -> 2; abs < BigDecimal("0.01") -> 8; else -> 4 }
        val s = "$" + nf(if (abs >= BigDecimal.ONE || abs.signum() == 0) 2 else 2.coerceAtMost(max), max).format(abs)
        return if (d.signum() < 0) "−$s" else s
    }

    fun signedUsd(v: String?): String {
        val d = dec(v) ?: return "—"
        return when (d.signum()) { 1 -> "+" + usd(d.toPlainString()); -1 -> "−" + usd(d.abs().toPlainString()); else -> usd("0") }
    }

    fun price(v: String?, decimals: Int? = null): String {
        val d = dec(v) ?: return "—"
        val dp = decimals ?: when { d < BigDecimal("0.0001") -> 10; d < BigDecimal.ONE -> 6; else -> 2 }
        return "$" + nf(minOf(2, dp), maxOf(2, dp)).format(d)
    }

    fun qty(v: String?, max: Int = 8): String = dec(v)?.let { nf(0, max).format(it) } ?: "—"
    fun int(v: Any?): String = (v?.toString()?.toBigDecimalOrNull() ?: BigDecimal.ZERO).let { nf(0, 0).format(it) }

    fun pct(v: String?, signed: Boolean = false): String {
        val d = dec(v) ?: return "—"
        val s = nf(2, 2).format(d.abs()) + "%"
        return when { d.signum() < 0 -> "−$s"; signed && d.signum() > 0 -> "+$s"; else -> s }
    }

    /** -1 loss, 0 neutral, +1 gain — UI maps this to red/green plus the explicit sign. */
    fun sign(v: String?): Int = dec(v)?.signum() ?: 0

    fun parseUtc(v: String?): Instant? {
        if (v.isNullOrBlank()) return null
        return runCatching {
            if (v.length == 10) LocalDate.parse(v).atTime(12, 0).toInstant(ZoneOffset.UTC)
            else LocalDateTime.parse(v.replace(' ', 'T').removeSuffix("Z")).toInstant(ZoneOffset.UTC)
        }.getOrNull()
    }

    fun date(v: String?): String = parseUtc(v)?.let { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale()).withZone(zone).format(it) } ?: "—"
    fun dateTime(v: String?): String = parseUtc(v)?.let { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale()).withZone(zone).format(it) } ?: "—"

    fun ago(v: String?): String {
        val i = parseUtc(v) ?: return "—"
        val s = (System.currentTimeMillis() - i.toEpochMilli()) / 1000
        val n: Long; val unit: String
        when {
            s < 60 -> { n = maxOf(s, 0); unit = if (I18n.locale == "bn") "সেকেন্ড" else "s" }
            s < 3600 -> { n = s / 60; unit = if (I18n.locale == "bn") "মিনিট" else "min" }
            s < 86400 -> { n = s / 3600; unit = if (I18n.locale == "bn") "ঘণ্টা" else "h" }
            else -> { n = s / 86400; unit = if (I18n.locale == "bn") "দিন" else "d" }
        }
        return if (I18n.locale == "bn") "${int(n)} $unit আগে" else "$n $unit ago"
    }

    fun tzLabel(): String = zone.id
}

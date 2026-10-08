package com.ahoshan.joma.ui

import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val BN_DIGITS = "০১২৩৪৫৬৭৮৯"

fun bnDigits(text: String): String = buildString(text.length) {
    for (c in text) append(if (c in '0'..'9') BN_DIGITS[c - '0'] else c)
}

/** Converts Bengali digits typed on a Bengali keyboard back to ASCII for the API. */
fun asciiDigits(text: String): String = buildString(text.length) {
    for (c in text) {
        val index = BN_DIGITS.indexOf(c)
        append(if (index >= 0) '0' + index else c)
    }
}

/** "125050.50" → "১,২৫,০৫০.৫০" with Bangladeshi lakh grouping. */
fun taka(amount: String): String {
    val parts = amount.split('.')
    val whole = parts[0].trimStart('-')
    val fraction = parts.getOrNull(1)?.padEnd(2, '0')?.take(2) ?: "00"
    val last3 = whole.takeLast(3)
    val rest = whole.dropLast(3)
    val grouped = if (rest.isEmpty()) last3 else rest.reversed().chunked(2).joinToString(",").reversed() + "," + last3
    return bnDigits((if (amount.startsWith("-")) "-" else "") + grouped + "." + fraction)
}

private val serverTime = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
private val shownTime = DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.forLanguageTag("bn-BD"))

/** Server times are Asia/Dhaka, e.g. "2026-10-08 14:30:00" → "৮ অক্টো, ২:৩০ PM". */
fun shortDate(text: String): String = runCatching {
    bnDigits(LocalDateTime.parse(text, serverTime).format(shownTime))
}.getOrElse { bnDigits(text.take(16)) }

val methodNames = mapOf(
    "bkash" to "বিকাশ",
    "nagad" to "নগদ",
    "rocket" to "রকেট",
    "card" to "কার্ড",
    "bank" to "ব্যাংক",
)

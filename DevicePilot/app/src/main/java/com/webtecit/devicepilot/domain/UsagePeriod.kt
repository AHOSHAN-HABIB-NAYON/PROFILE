package com.webtecit.devicepilot.domain

import java.util.Calendar
import java.util.TimeZone

enum class UsagePeriod { TODAY, LAST_7_DAYS, LAST_30_DAYS, BILLING_CYCLE }

data class TimeRange(val start: Long, val end: Long)

object UsagePeriods {

    private const val DAY = 24L * 60 * 60 * 1000

    fun range(period: UsagePeriod, now: Long, billingDay: Int, tz: TimeZone = TimeZone.getDefault()): TimeRange {
        val cal = Calendar.getInstance(tz).apply { timeInMillis = now }
        return when (period) {
            UsagePeriod.TODAY -> TimeRange(startOfDay(cal), now)
            UsagePeriod.LAST_7_DAYS -> TimeRange(now - 7 * DAY, now)
            UsagePeriod.LAST_30_DAYS -> TimeRange(now - 30 * DAY, now)
            UsagePeriod.BILLING_CYCLE -> TimeRange(billingStart(cal, billingDay.coerceIn(1, 28)), now)
        }
    }

    private fun startOfDay(source: Calendar): Long = (source.clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    private fun billingStart(source: Calendar, day: Int): Long {
        val c = source.clone() as Calendar
        if (c.get(Calendar.DAY_OF_MONTH) < day) c.add(Calendar.MONTH, -1)
        c.set(Calendar.DAY_OF_MONTH, day)
        return startOfDay(c)
    }
}

data class AppDataUsage(
    val uid: Int,
    val label: String,
    val packageName: String?,
    val wifiRx: Long,
    val wifiTx: Long,
    val mobileRx: Long,
    val mobileTx: Long,
) {
    val total: Long get() = wifiRx + wifiTx + mobileRx + mobileTx
    val wifiTotal: Long get() = wifiRx + wifiTx
    val mobileTotal: Long get() = mobileRx + mobileTx
}

object UsageMath {
    fun topConsumers(list: List<AppDataUsage>, limit: Int): List<AppDataUsage> =
        list.filter { it.total > 0 }.sortedByDescending { it.total }.take(limit)

    fun shareOf(part: Long, total: Long): Float = if (total <= 0) 0f else (part.toFloat() / total).coerceIn(0f, 1f)
}

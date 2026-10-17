package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.AppDataUsage
import com.webtecit.devicepilot.domain.UsageMath
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class UsageTest {
    private val utc = TimeZone.getTimeZone("UTC")
    private fun at(y: Int, m: Int, d: Int, h: Int = 12) = Calendar.getInstance(utc).apply {
        clear(); set(y, m - 1, d, h, 0, 0)
    }.timeInMillis

    @Test fun today() {
        val now = at(2026, 3, 15, 18)
        assertEquals(at(2026, 3, 15, 0), UsagePeriods.range(UsagePeriod.TODAY, now, 1, utc).start)
    }
    @Test fun lastSevenDays() {
        val now = at(2026, 3, 15)
        assertEquals(now - 7L * 86_400_000, UsagePeriods.range(UsagePeriod.LAST_7_DAYS, now, 1, utc).start)
    }
    @Test fun billingCycleThisMonth() =
        assertEquals(at(2026, 3, 10, 0), UsagePeriods.range(UsagePeriod.BILLING_CYCLE, at(2026, 3, 15), 10, utc).start)
    @Test fun billingCyclePreviousMonth() =
        assertEquals(at(2026, 2, 20, 0), UsagePeriods.range(UsagePeriod.BILLING_CYCLE, at(2026, 3, 15), 20, utc).start)
    @Test fun billingCycleAcrossYear() =
        assertEquals(at(2025, 12, 28, 0), UsagePeriods.range(UsagePeriod.BILLING_CYCLE, at(2026, 1, 3), 28, utc).start)

    @Test fun topConsumers() {
        val list = listOf(
            AppDataUsage(1, "a", null, 10, 0, 0, 0),
            AppDataUsage(2, "b", null, 0, 0, 500, 5),
            AppDataUsage(3, "c", null, 0, 0, 0, 0),
            AppDataUsage(4, "d", null, 100, 100, 0, 0),
        )
        val top = UsageMath.topConsumers(list, 2)
        assertEquals(listOf(2, 4), top.map { it.uid })
        assertEquals(505L, top[0].mobileTotal)
    }
    @Test fun share() {
        assertEquals(0.5f, UsageMath.shareOf(5, 10), 0.0001f)
        assertEquals(0f, UsageMath.shareOf(5, 0), 0.0001f)
    }
}

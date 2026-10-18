package com.webtecit.nayon.theme

import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.Brightness
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import com.webtecit.nayon.core.designsystem.theme.isInDarkPeriod
import com.webtecit.nayon.core.designsystem.theme.resolveBrightness
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeResolutionTest {

    private fun hm(h: Int, m: Int = 0) = h * 60 + m

    @Test fun darkPeriodWrapsPastMidnight() {
        val start = hm(19); val end = hm(7)
        assertTrue(isInDarkPeriod(hm(19), start, end))
        assertTrue(isInDarkPeriod(hm(23, 59), start, end))
        assertTrue(isInDarkPeriod(hm(0), start, end))
        assertTrue(isInDarkPeriod(hm(6, 59), start, end))
        assertFalse(isInDarkPeriod(hm(7), start, end))
        assertFalse(isInDarkPeriod(hm(12), start, end))
        assertFalse(isInDarkPeriod(hm(18, 59), start, end))
    }

    @Test fun darkPeriodWithinSameDay() {
        val start = hm(13); val end = hm(15)
        assertFalse(isInDarkPeriod(hm(12, 59), start, end))
        assertTrue(isInDarkPeriod(hm(13), start, end))
        assertTrue(isInDarkPeriod(hm(14, 30), start, end))
        assertFalse(isInDarkPeriod(hm(15), start, end))
    }

    @Test fun equalStartAndEndMeansNoDarkPeriod() {
        assertFalse(isInDarkPeriod(hm(8), hm(8), hm(8)))
        assertFalse(isInDarkPeriod(hm(20), hm(8), hm(8)))
    }

    @Test fun systemModeFollowsDevice() {
        val s = AppearanceSettings(mode = ThemeMode.SYSTEM)
        assertEquals(Brightness.DARK, resolveBrightness(s, systemDark = true, minuteOfDay = 0))
        assertEquals(Brightness.LIGHT, resolveBrightness(s, systemDark = false, minuteOfDay = 0))
    }

    @Test fun explicitModesIgnoreDevice() {
        for (systemDark in listOf(true, false)) {
            assertEquals(Brightness.LIGHT, resolveBrightness(AppearanceSettings(mode = ThemeMode.LIGHT), systemDark, 0))
            assertEquals(Brightness.DARK, resolveBrightness(AppearanceSettings(mode = ThemeMode.DARK), systemDark, 0))
            assertEquals(Brightness.AMOLED, resolveBrightness(AppearanceSettings(mode = ThemeMode.AMOLED), systemDark, 0))
        }
    }

    @Test fun scheduledModeUsesTimeAndAmoledOption() {
        val s = AppearanceSettings(mode = ThemeMode.SCHEDULED, darkStartMinute = hm(20), darkEndMinute = hm(6))
        assertEquals(Brightness.LIGHT, resolveBrightness(s, systemDark = true, minuteOfDay = hm(12)))
        assertEquals(Brightness.DARK, resolveBrightness(s, systemDark = false, minuteOfDay = hm(22)))
        assertEquals(Brightness.AMOLED,
            resolveBrightness(s.copy(scheduleUsesAmoled = true), systemDark = false, minuteOfDay = hm(22)))
    }
}

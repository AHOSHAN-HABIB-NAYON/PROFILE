package com.webtecit.nayon.browser

import com.webtecit.nayon.feature.browser.sceneForHour
import org.junit.Assert.assertEquals
import org.junit.Test

class TimeOfDayTest {
    @Test
    fun hoursMapToMorningAfternoonEveningNight() {
        // 0 = morning, 1 = afternoon, 2 = evening, 3 = night
        assertEquals(3, sceneForHour(1)) // 1:43 AM is night, not evening
        assertEquals(3, sceneForHour(4))
        assertEquals(0, sceneForHour(5))
        assertEquals(0, sceneForHour(11))
        assertEquals(1, sceneForHour(12))
        assertEquals(1, sceneForHour(16))
        assertEquals(2, sceneForHour(17))
        assertEquals(2, sceneForHour(19))
        assertEquals(3, sceneForHour(20))
        assertEquals(3, sceneForHour(23))
    }
}

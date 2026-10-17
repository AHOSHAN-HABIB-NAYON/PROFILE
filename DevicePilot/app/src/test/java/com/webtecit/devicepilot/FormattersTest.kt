package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.Formatters
import org.junit.Assert.assertEquals
import org.junit.Test

class FormattersTest {
    @Test fun bytesSmall() = assertEquals("512 B", Formatters.bytes(512))
    @Test fun bytesKb() = assertEquals("1.50 KB", Formatters.bytes(1536))
    @Test fun bytesGb() = assertEquals("4.00 GB", Formatters.bytes(4L * 1024 * 1024 * 1024))
    @Test fun bytesLarge() = assertEquals("120 GB", Formatters.bytes(120L * 1024 * 1024 * 1024))
    @Test fun bytesNegative() = assertEquals("—", Formatters.bytes(-1))
    @Test fun percent() {
        assertEquals(25, Formatters.percent(1, 4))
        assertEquals(0, Formatters.percent(1, 0))
        assertEquals(100, Formatters.percent(10, 5))
    }
    @Test fun duration() {
        assertEquals("45s", Formatters.duration(45_000))
        assertEquals("12m", Formatters.duration(12 * 60_000L))
        assertEquals("2h 05m", Formatters.duration((2 * 3600 + 5 * 60) * 1000L))
    }
}

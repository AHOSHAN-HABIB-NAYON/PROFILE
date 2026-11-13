package com.webtecit.devicepilot.core

import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.core.common.safeReading
import com.webtecit.devicepilot.core.navigation.Routes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormattersTest {
    @Test fun bytes() {
        assertEquals("512 B", Formatters.bytes(512))
        assertEquals("1.0 KB", Formatters.bytes(1024))
        assertEquals("1.5 MB", Formatters.bytes(1_572_864))
        assertEquals("128 GB", Formatters.bytes(128L * 1024 * 1024 * 1024))
        assertEquals("—", Formatters.bytes(-1))
    }

    @Test fun units() {
        assertEquals("3.85 V", Formatters.volts(3850))
        assertEquals("36.5 °C", Formatters.celsius(36.5f))
        assertEquals("1500 mA", Formatters.milliAmps(1_500_000))
        assertEquals("25.0 Mbps", Formatters.mbps(25_000_000.0))
        assertEquals("1800 MHz", Formatters.mhz(1_800_000))
    }

    @Test fun duration() {
        assertEquals("<1m", Formatters.duration(30_000))
        assertEquals("5m", Formatters.duration(5 * 60_000L))
        assertEquals("2h 3m", Formatters.duration((2 * 60 + 3) * 60_000L))
    }
}

class ReadingTest {
    @Test fun display() {
        assertEquals("42", Reading.Measured(42).display { it.toString() })
        assertEquals("42 (est.)", Reading.Estimated(42, "x").display { it.toString() })
        assertEquals("Restricted by Android", Reading.Unavailable(UnavailableReason.RESTRICTED).display { "never" })
    }

    @Test fun mapKeepsKind() {
        val e = Reading.Estimated(2, "m").map { it * 2 }
        assertTrue(e is Reading.Estimated && e.value == 4 && e.method == "m")
        val u: Reading<Int> = Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        assertNull(u.map { it * 2 }.valueOrNull)
    }

    @Test fun ofNullable() {
        assertEquals(Reading.Measured(1), Reading.ofNullable(1))
        assertEquals(Reading.Unavailable(UnavailableReason.NOT_AVAILABLE), Reading.ofNullable<Int>(null))
    }

    @Test fun safeReadingMapsExceptions() {
        assertEquals(Reading.Unavailable(UnavailableReason.RESTRICTED), safeReading<Int> { throw SecurityException() })
        assertEquals(Reading.Unavailable(UnavailableReason.NOT_AVAILABLE), safeReading<Int> { error("boom") })
    }
}

class RoutesTest {
    @Test fun routes() {
        assertEquals("files/LARGE", Routes.files("LARGE"))
        assertEquals("diagnostic/TOUCH", Routes.diagnosticTest("TOUCH"))
        assertEquals("legal/privacy", Routes.legal("privacy"))
        assertEquals(5, Routes.topLevel.size)
        assertTrue(Routes.HOME in Routes.topLevel && Routes.SETTINGS in Routes.topLevel)
    }
}

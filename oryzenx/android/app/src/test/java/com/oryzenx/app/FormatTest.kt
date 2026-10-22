package com.oryzenx.app

import com.oryzenx.app.data.Fmt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

/** Money values arrive as decimal strings; they must be parsed exactly (no Float/Double rounding). */
class FormatTest {
    @Test fun parsesDecimalStringsExactly() {
        assertEquals(BigDecimal("106.00000000"), Fmt.dec("106.00000000"))
        assertEquals(BigDecimal("0.00000123"), Fmt.dec(" 0.00000123 "))
        assertNull(Fmt.dec(""))
        assertNull(Fmt.dec(null))
        assertNull(Fmt.dec("abc"))
    }

    @Test fun signFollowsValue() {
        assertEquals(1, Fmt.sign("14.00"))
        assertEquals(-1, Fmt.sign("-6.00"))
        assertEquals(0, Fmt.sign("0.00000000"))
        assertEquals(0, Fmt.sign(null))
    }

    @Test fun solExampleMatchesSpecification() {
        // SOL bought at 106 and now 120 → +14 (+13.21 %); at 100 → −6 (−5.66 %)
        val cost = BigDecimal("106")
        val up = BigDecimal("120").subtract(cost)
        val down = BigDecimal("100").subtract(cost)
        assertEquals(BigDecimal("14"), up)
        assertEquals(BigDecimal("13.21"), up.multiply(BigDecimal(100)).divide(cost, 2, java.math.RoundingMode.HALF_UP))
        assertEquals(BigDecimal("-5.66"), down.multiply(BigDecimal(100)).divide(cost, 2, java.math.RoundingMode.HALF_UP))
    }
}

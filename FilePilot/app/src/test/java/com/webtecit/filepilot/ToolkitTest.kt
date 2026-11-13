package com.webtecit.filepilot

import com.webtecit.filepilot.feature.toolkit.MediaTools
import com.webtecit.filepilot.feature.toolkit.QrKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolkitTest {
    @Test fun parsesPageRanges() {
        assertEquals(listOf(0, 1, 2, 4), MediaTools.parsePages("1-3, 5", 10))
        assertEquals(listOf(7, 8, 9), MediaTools.parsePages("8-", 10))
        assertEquals(listOf(0, 1), MediaTools.parsePages("-2", 10))
        assertEquals(listOf(4, 3, 2), MediaTools.parsePages("5-3", 10))
        assertEquals(listOf(0, 1), MediaTools.parsePages("1,1,2", 10))
    }

    @Test fun rejectsBadPageRanges() {
        for (bad in listOf("", "0", "11", "a", "1-2-3", "3-12")) {
            val e = runCatching { MediaTools.parsePages(bad, 10) }.exceptionOrNull()
            assertTrue("\"$bad\" should be rejected", e is IllegalArgumentException)
        }
    }

    @Test fun buildsQrPayloads() {
        assertEquals("https://webtecit.com", MediaTools.qrPayload(QrKind.URL, mapOf("url" to "webtecit.com")))
        assertEquals("http://a.b", MediaTools.qrPayload(QrKind.URL, mapOf("url" to "http://a.b")))
        assertEquals("WIFI:T:WPA;S:Home\\;Net;P:p\\:1;;", MediaTools.qrPayload(QrKind.WIFI, mapOf("ssid" to "Home;Net", "password" to "p:1")))
        assertEquals("WIFI:T:nopass;S:Cafe;;", MediaTools.qrPayload(QrKind.WIFI, mapOf("ssid" to "Cafe", "security" to "None")))
        assertEquals("tel:+8801", MediaTools.qrPayload(QrKind.PHONE, mapOf("phone" to " +8801 ")))
        assertEquals("SMSTO:123:hi", MediaTools.qrPayload(QrKind.SMS, mapOf("phone" to "123", "message" to "hi")))
        assertEquals("MECARD:N:Nayon;TEL:1;;", MediaTools.qrPayload(QrKind.CONTACT, mapOf("name" to "Nayon", "phone" to "1")))
    }
}

class DevUtilsTest {
    private val d = com.webtecit.filepilot.feature.toolkit.DevUtils

    @Test fun formatsAndMinifiesJson() {
        assertEquals("{\n  \"a\": 1,\n  \"b\": [\n    true,\n    \"x,y\"\n  ],\n  \"c\": {}\n}", d.formatJson("""{"a":1,"b":[true,"x,y"],"c":{}}""", 2))
        assertEquals("""{"a":1,"b":[1,2]}""", d.formatJson("{ \"a\" : 1 ,\n \"b\" : [ 1 , 2 ] }", 0))
        assertTrue(runCatching { d.formatJson("{\"a\":1", 2) }.isFailure)
        assertTrue(runCatching { d.formatJson("[1,2}", 2) }.isFailure)
    }

    @Test fun base64RoundTrips() {
        for (s in listOf("", "f", "fo", "foo", "foob", "fooba", "foobar", "নয়ন ✓")) {
            assertEquals(s, d.base64Decode(d.base64Encode(s)))
        }
        assertEquals("Zm9vYmFy", d.base64Encode("foobar"))
        assertEquals("Zm9vYg==", d.base64Encode("foob"))
        assertEquals("Zm9vYg", d.base64Encode("foob", urlSafe = true))
        assertTrue(runCatching { d.base64Decode("@@@") }.isFailure)
    }

    @Test fun hashesAndColours() {
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", d.hash("abc", "SHA-1"))
        assertEquals("900150983cd24fb0d6963f7d28e17f72", d.hash("abc", "MD5"))
        assertTrue(d.color("#2F6BFF").contains("rgb(47, 107, 255)"))
        assertTrue(d.color("rgb(255, 0, 0)").contains("#FF0000"))
        assertTrue(d.numberBases("0xFF").contains("Decimal  255"))
        assertTrue(d.numberBases("10").contains("0b1010"))
    }

    @Test fun passwordsUseChosenSets() {
        repeat(20) {
            val p = d.password(12, upper = true, lower = false, digits = true, symbols = false)
            assertEquals(12, p.length)
            assertTrue(p.all { it.isUpperCase() || it.isDigit() })
            assertTrue(p.any { it.isDigit() } && p.any { it.isUpperCase() })
        }
        assertTrue(runCatching { d.password(10, false, false, false, false) }.isFailure)
    }

    @Test fun regexAndText() {
        assertTrue(d.regexTest("(\\d+)", "a1 b22", ignoreCase = false).startsWith("2 matches"))
        assertEquals("No matches.", d.regexTest("z", "abc", ignoreCase = false))
        assertEquals("a\nb", d.removeDuplicateLines("a\nb\na"))
        assertEquals("Hello World", d.titleCase("hELLO wORLD"))
    }
}

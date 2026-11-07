package com.webtecit.nayon.data

import com.webtecit.nayon.data.webhub.WebHubRepository
import com.webtecit.nayon.data.webhub.WebSite
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)   // org.json comes from the Android framework
class WebHubTest {

    @Test
    fun encodeDecodeRoundTrip() {
        val list = listOf(WebSite(1, "A, \"B\"", "https://a.com", "Work", 5), WebSite(2, "C", "https://c.org"))
        assertEquals(list, WebHubRepository.decode(WebHubRepository.encode(list)))
    }

    @Test
    fun namesComeFromTheAddress() {
        assertEquals("Github", WebHubRepository.nameFor("https://github.com/x"))
        assertEquals("Bbc", WebHubRepository.nameFor("https://www.bbc.co.uk/news"))
        assertEquals("Facebook", WebHubRepository.nameFor("https://m.facebook.com"))
    }

    @Test
    fun categoriesAreSuggested() {
        assertEquals("Social", WebHubRepository.suggestCategory("https://m.facebook.com"))
        assertEquals("Finance", WebHubRepository.suggestCategory("https://www.tradingview.com/chart"))
        assertEquals("Finance", WebHubRepository.suggestCategory("https://mybank.example"))
        assertEquals("Video", WebHubRepository.suggestCategory("https://youtube.com"))
        assertEquals("", WebHubRepository.suggestCategory("https://example.com"))
    }

    @Test
    fun sameSiteIgnoresWwwAndSlash() {
        assertTrue(WebHubRepository.sameSite("https://www.example.com/", "http://example.com"))
        assertFalse(WebHubRepository.sameSite("https://example.com", "https://example.org"))
    }
}

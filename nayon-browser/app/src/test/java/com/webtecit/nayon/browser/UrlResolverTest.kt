package com.webtecit.nayon.browser

import com.webtecit.nayon.core.browser.SearchEngine
import com.webtecit.nayon.core.browser.SearchTemplates
import com.webtecit.nayon.core.browser.SearchTemplates.Validation
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.data.settings.BrowserPreferences
import com.webtecit.nayon.feature.browser.BrowserViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlResolverTest {
    private val google = SearchEngine.GOOGLE.template
    private fun resolve(s: String) = UrlResolver.resolve(s, google)

    @Test fun blankInputIsIgnored() {
        assertNull(resolve(""))
        assertNull(resolve("   "))
    }

    @Test fun fullUrlsAreKept() {
        assertEquals("https://webtecit.com", resolve("https://webtecit.com"))
        assertEquals("http://example.com/a?b=c", resolve("  http://example.com/a?b=c "))
    }

    @Test fun bareDomainsGetHttps() {
        assertEquals("https://webtecit.com", resolve("webtecit.com"))
        assertEquals("https://www.google.com/maps", resolve("www.google.com/maps"))
        assertEquals("https://sub.example.co.uk:8443/x", resolve("sub.example.co.uk:8443/x"))
        assertEquals("https://192.168.0.1", resolve("192.168.0.1"))
        assertEquals("https://localhost:8080", resolve("localhost:8080"))
    }

    @Test fun wordsAndSentencesAreSearched() {
        assertEquals("https://www.google.com/search?q=kotlin", resolve("kotlin"))
        assertEquals("https://www.google.com/search?q=what+is+kotlin%3F", resolve("what is kotlin?"))
        assertEquals("https://www.google.com/search?q=%E0%A6%AC%E0%A6%BE%E0%A6%82%E0%A6%B2%E0%A6%BE", resolve("বাংলা"))
    }

    @Test fun dangerousSchemesAreSearchedNotLoaded() {
        for (s in listOf("javascript://alert(1)", "file:///sdcard/secret.txt", "content://contacts/people")) {
            assertTrue(s, resolve(s)!!.startsWith("https://www.google.com/search?q="))
        }
    }

    @Test fun usesSelectedSearchEngine() {
        assertEquals("https://duckduckgo.com/?q=nayon", UrlResolver.resolve("nayon", SearchEngine.DUCKDUCKGO.template))
    }

    @Test fun webUrlDetection() {
        assertTrue(UrlResolver.isWebUrl("https://a.com"))
        assertTrue(UrlResolver.isWebUrl("HTTP://a.com"))
        assertFalse(UrlResolver.isWebUrl("intent://x"))
        assertFalse(UrlResolver.isWebUrl(null))
    }

    @Test fun recentSearchesAreReadFromResultPages() {
        assertEquals("kotlin flow", UrlResolver.searchQueryOf("https://www.google.com/search?q=kotlin+flow&oq=x"))
        assertEquals("বাংলা", UrlResolver.searchQueryOf("https://duckduckgo.com/?q=%E0%A6%AC%E0%A6%BE%E0%A6%82%E0%A6%B2%E0%A6%BE"))
        assertEquals("nayon", UrlResolver.searchQueryOf("https://search.yahoo.com/search?p=nayon"))
        assertNull(UrlResolver.searchQueryOf("https://www.google.com/maps?q=dhaka"))
        assertNull(UrlResolver.searchQueryOf("https://webtecit.com/?q=hello"))
        assertNull(UrlResolver.searchQueryOf(null))
    }

    @Test fun displayHostStripsWww() {
        assertEquals("webtecit.com", UrlResolver.displayHost("https://www.webtecit.com/about"))
        assertEquals("", UrlResolver.displayHost(null))
    }

    @Test fun customTemplateValidation() {
        assertEquals(Validation.OK, SearchTemplates.validate("https://search.example.com/?q=%s"))
        assertEquals(Validation.EMPTY, SearchTemplates.validate(" "))
        assertEquals(Validation.NOT_HTTPS, SearchTemplates.validate("http://example.com/?q=%s"))
        assertEquals(Validation.MISSING_PLACEHOLDER, SearchTemplates.validate("https://example.com/?q="))
        assertEquals(Validation.INVALID_URL, SearchTemplates.validate("https://nohost/?q=%s"))
    }

    @Test fun invalidCustomTemplateFallsBackToGoogle() {
        val prefs = BrowserPreferences(searchEngine = SearchEngine.CUSTOM, customSearchTemplate = "nope")
        assertEquals(SearchEngine.GOOGLE.template, prefs.searchTemplate)
        val ok = prefs.copy(customSearchTemplate = "https://s.example.org/find?q=%s")
        assertEquals("https://s.example.org/find?q=%s", ok.searchTemplate)
    }

    @Test fun desktopUserAgentRemovesMobileMarkers() {
        val mobile = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36"
        val desktop = BrowserViewModel.desktopUserAgent(mobile)
        assertFalse(desktop.contains("Android"))
        assertFalse(desktop.contains("Mobile"))
        assertFalse(desktop.contains("Version/4.0"))
        assertTrue(desktop.contains("X11; Linux x86_64"))
        assertTrue(desktop.contains("Chrome/126.0.0.0"))
    }
}

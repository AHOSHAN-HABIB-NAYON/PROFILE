package com.webtecit.nayon.browser

import com.webtecit.nayon.feature.browser.BrowserViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CompletionTest {
    private val candidates = listOf("cakricircular.com", "chatgpt.com", "chakri circular", "Coinmarketcap")

    @Test
    fun picksTheMostUsedMatch() {
        assertEquals("cakricircular.com", BrowserViewModel.bestCompletion(candidates, "ca"))
        assertEquals("chatgpt.com", BrowserViewModel.bestCompletion(candidates, "ch"))
        assertEquals("chakri circular", BrowserViewModel.bestCompletion(candidates, "chak"))
    }

    @Test
    fun ignoresCaseAndNeedsSomethingLonger() {
        assertEquals("Coinmarketcap", BrowserViewModel.bestCompletion(candidates, "COIN"))
        assertNull(BrowserViewModel.bestCompletion(candidates, "chatgpt.com"))
        assertNull(BrowserViewModel.bestCompletion(candidates, ""))
        assertNull(BrowserViewModel.bestCompletion(candidates, "zz"))
    }
}

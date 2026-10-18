package com.webtecit.nayon.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.webtecit.nayon.data.browser.BrowserDatabase
import com.webtecit.nayon.data.browser.BrowsingRepository
import com.webtecit.nayon.data.browser.SavedTab
import com.webtecit.nayon.feature.history.dayKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.util.Calendar

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class BrowsingRepositoryTest {
    private lateinit var db: BrowserDatabase
    private var now = 1_000_000L
    private lateinit var repo: BrowsingRepository

    @Before fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), BrowserDatabase::class.java)
            .allowMainThreadQueries().build()
        repo = BrowsingRepository(db.historyDao(), db.bookmarkDao(), db.savedTabDao()) { now }
    }

    @After fun tearDown() = db.close()

    @Test fun recordsVisitsNewestFirstAndMergesQuickReloads() = runTest {
        repo.recordVisit("https://a.com", "A")
        now += 1_000
        repo.recordVisit("https://a.com", "A again")   // within a minute -> merged
        now += 120_000
        repo.recordVisit("https://b.com", "B")
        val list = repo.recentHistory().first()
        assertEquals(listOf("https://b.com", "https://a.com"), list.map { it.url })
        assertEquals("A again", list[1].title)
    }

    @Test fun titleUpdatesAndSearch() = runTest {
        repo.recordVisit("https://webtecit.com", "")
        repo.updateTitle("https://webtecit.com", "WebTecIT")
        assertEquals("WebTecIT", repo.searchHistory("tecit").first().single().title)
        assertTrue(repo.searchHistory("zzz").first().isEmpty())
    }

    @Test fun deleteAndClearHistory() = runTest {
        repo.recordVisit("https://a.com", "A"); now += 120_000
        repo.recordVisit("https://b.com", "B")
        val first = repo.recentHistory().first().first()
        repo.deleteHistory(first.id)
        assertEquals(1, repo.recentHistory().first().size)
        repo.clearHistory()
        assertTrue(repo.recentHistory().first().isEmpty())
    }

    @Test fun bookmarksAreUniquePerUrl() = runTest {
        repo.addBookmark("https://a.com", "A")
        repo.addBookmark("https://a.com", "A renamed")
        assertEquals(listOf("A renamed"), repo.bookmarks().first().map { it.title })
        assertEquals(setOf("https://a.com"), repo.bookmarkedUrls().first().toSet())
        repo.removeBookmark("https://a.com")
        assertTrue(repo.bookmarks().first().isEmpty())
    }

    @Test fun bookmarkWithoutTitleUsesUrl() = runTest {
        repo.addBookmark("https://x.org", " ")
        assertEquals("https://x.org", repo.bookmarks().first().single().title)
    }

    @Test fun savedTabsReplaceInOrder() = runTest {
        repo.saveTabs(listOf(SavedTab("1", "https://a.com", "A", 0, false), SavedTab("2", null, "", 1, true)))
        repo.saveTabs(listOf(SavedTab("3", "https://c.com", "C", 0, true)))
        assertEquals(listOf("3"), repo.loadSavedTabs().map { it.id })
    }

    @Test fun searchSuggestionsParseOpenSearchFormat() {
        val parsed = com.webtecit.nayon.core.browser.SearchSuggestions.parse("""["nay",["nayon","nayon browser","nayon"],[],{}]""")
        assertEquals(listOf("nayon", "nayon browser"), parsed)
        assertTrue(com.webtecit.nayon.core.browser.SearchSuggestions.parse("not json").isEmpty())
    }

    @Test fun historyDayBuckets() {
        val cal = Calendar.getInstance().apply { set(2026, Calendar.MARCH, 10, 15, 0) }
        val nowMs = cal.timeInMillis
        assertEquals(0L, dayKey(nowMs - 60_000, nowMs))
        cal.add(Calendar.DAY_OF_MONTH, -1)
        assertEquals(1L, dayKey(cal.timeInMillis, nowMs))
        cal.add(Calendar.DAY_OF_MONTH, -3)
        assertTrue(dayKey(cal.timeInMillis, nowMs) > 1L)
    }
}

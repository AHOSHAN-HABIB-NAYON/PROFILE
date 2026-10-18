package com.appfix.core.search

import com.appfix.core.TestFixtures
import com.appfix.core.patch.ChangeApplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ProjectSearchTest {
    @Test
    fun `search and replace across files`() {
        val ws = TestFixtures.copySample()
        val r = ProjectSearch.search(ws, SearchQuery("tap_me"))
        assertEquals(setOf("app/src/main/res/layout/activity_main.xml", "app/src/main/res/values/strings.xml"), r.matches.map { it.path }.toSet())
        val words = ProjectSearch.search(ws, SearchQuery("taps", wholeWord = true, caseSensitive = true, extensions = setOf("kt")))
        assertTrue(words.matches.all { it.path.endsWith("MainActivity.kt") })
        assertEquals(3, words.matches.size)
        val regex = ProjectSearch.search(ws, SearchQuery("""R\.id\.(\w+)""", regex = true))
        assertEquals(2, regex.matches.size)

        val change = ProjectSearch.replaceAll(ws, SearchQuery("Sample Notes", extensions = setOf("xml")), "Notes Pro")
        assertEquals(1, change.changes.size)
        ChangeApplier(ws, File(ws.parentFile, "h")).apply(change)
        assertTrue(File(ws, "app/src/main/res/values/strings.xml").readText().contains("<string name=\"app_name\">Notes Pro</string>"))
        val limited = ProjectSearch.search(ws, SearchQuery("a", maxResults = 5))
        assertTrue(limited.truncated)
        assertEquals(5, limited.matches.size)
    }
}

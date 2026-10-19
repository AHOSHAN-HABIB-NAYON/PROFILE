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

/** Robolectric supplies the real org.json used by the parser. */
@org.junit.runner.RunWith(org.robolectric.RobolectricTestRunner::class)
@org.robolectric.annotation.Config(sdk = [34])
class GoogleAccountsParseTest {
    @Test
    fun readsNameEmailAndPhotoOfFirstSignedInAccount() {
        val body = """["gaia.l.a.r",[["gaia.l.a",1,"Out User","out@gmail.com","https://lh3.googleusercontent.com/a/x",1,1,0,null,1,"1",null,null,null,1],
            ["gaia.l.a",1,"Nayon","nayon@gmail.com","https://lh3.googleusercontent.com/a/y",1,1,0,null,1,"2",null,null,null,0]]]"""
        val parsed = com.webtecit.nayon.data.browser.GoogleAccounts.parse(body)
        assertEquals(Triple("Nayon", "nayon@gmail.com", "https://lh3.googleusercontent.com/a/y"), parsed)
    }

    @Test
    fun emptyListMeansSignedOut() {
        assertEquals(null, com.webtecit.nayon.data.browser.GoogleAccounts.parse("""["gaia.l.a.r",[]]"""))
    }
}

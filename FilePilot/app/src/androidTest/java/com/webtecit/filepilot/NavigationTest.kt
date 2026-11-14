package com.webtecit.filepilot

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.assertIsDisplayed
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.webtecit.filepilot.TestSupport.waitForText
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.Timeout
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NavigationTest {
    private val rule = createEmptyComposeRule()

    @get:Rule val chain: RuleChain = RuleChain
        .outerRule(Timeout.builder().withTimeout(120, TimeUnit.SECONDS).withLookingForStuckThread(true).build())
        .around(rule)

    private var scenario: ActivityScenario<MainActivity>? = null

    @Before fun launch() {
        TestSupport.setFirstLaunch(onboardingDone = true, setupDone = true)
        scenario = ActivityScenario.launch(MainActivity::class.java)
        rule.waitForText("Categories")
    }

    @After fun close() { scenario?.close() }

    @Test fun visitsEveryTabAndAbout() {
        rule.onNodeWithTag("tab_Files").performClick()
        rule.waitForText("Add SD card, USB drive or folder")
        rule.onNodeWithTag("tab_Tools").performClick()
        rule.waitForText("Everything works offline")
        rule.onNodeWithTag("tab_Library").performClick()
        rule.waitForText("No favorites yet")
        rule.onNodeWithTag("tab_Settings").performClick()
        rule.waitForText("Appearance")
        rule.onNodeWithTag("settings_list").performScrollToNode(hasText("About FilePilot"))
        rule.onNodeWithText("About FilePilot").performClick()
        rule.waitForText("MD AHOSHAN HABIB NAYON")
        rule.waitForText("Webtecit Apps")
    }

    @Test fun codeStudioShowsStartScreen() {
        TestSupport.grantAllFilesAccess()
        rule.onNodeWithTag("home_list").performScrollToKey("tools")
        rule.onNodeWithTag("qt_CODE_STUDIO").performClick()
        rule.waitForText("New file")
        rule.onNodeWithTag("new_file").assertIsDisplayed()
        rule.onNodeWithText("Choose a language").assertIsDisplayed()
        // The real screen pixels, not just the Compose tree: the dark "New file" card must be visible
        // (a stray WebView once painted white over it while the semantics still said "displayed").
        rule.waitForIdle()
        Thread.sleep(800)
        val bounds = rule.onNodeWithTag("new_file").fetchSemanticsNode().boundsInWindow
        val shot = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        val loc = IntArray(2)
        scenario!!.onActivity { it.window.decorView.getLocationOnScreen(loc) }
        val x = (loc[0] + bounds.left + 12).toInt().coerceIn(0, shot.width - 1)
        val y = (loc[1] + bounds.center.y).toInt().coerceIn(0, shot.height - 1)
        val px = shot.getPixel(x, y)
        val lum = (android.graphics.Color.red(px) * 299 + android.graphics.Color.green(px) * 587 + android.graphics.Color.blue(px) * 114) / 1000
        org.junit.Assert.assertTrue("New file card is not visible on screen (pixel luminance $lum at $x,$y)", lum < 110)
    }

    @Test fun switchesToDarkThemeAndBack() {
        rule.onNodeWithTag("tab_Settings").performClick()
        rule.waitForText("Appearance")
        rule.onNodeWithText("Dark").performClick()
        rule.waitForText("Appearance")
        rule.onNodeWithText("Light").performClick()
        rule.waitForText("Appearance")
    }
}

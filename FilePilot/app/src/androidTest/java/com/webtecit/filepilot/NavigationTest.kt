package com.webtecit.filepilot

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasText
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
        rule.waitForText("Storage Analyzer")
        rule.onNodeWithTag("tab_Library").performClick()
        rule.waitForText("No favorites yet")
        rule.onNodeWithTag("tab_Settings").performClick()
        rule.waitForText("APPEARANCE")
        rule.onNodeWithTag("settings_list").performScrollToNode(hasText("About FilePilot"))
        rule.onNodeWithText("About FilePilot").performClick()
        rule.waitForText("MD AHOSHAN HABIB NAYON")
        rule.waitForText("Webtecit Apps")
    }

    @Test fun switchesToDarkThemeAndBack() {
        rule.onNodeWithTag("tab_Settings").performClick()
        rule.waitForText("APPEARANCE")
        rule.onNodeWithText("Dark").performClick()
        rule.waitForText("APPEARANCE")
        rule.onNodeWithText("Light").performClick()
        rule.waitForText("APPEARANCE")
    }
}

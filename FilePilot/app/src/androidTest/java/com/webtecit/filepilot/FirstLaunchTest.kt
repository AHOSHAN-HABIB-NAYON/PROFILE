package com.webtecit.filepilot

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.webtecit.filepilot.TestSupport.waitForText
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.Timeout
import org.junit.runner.RunWith

/** Splash → onboarding → (permission explanation → permission screen, when access is missing) → Home. */
@RunWith(AndroidJUnit4::class)
class FirstLaunchTest {
    private val rule = createEmptyComposeRule()

    @get:Rule val chain: RuleChain = RuleChain
        .outerRule(Timeout.builder().withTimeout(120, TimeUnit.SECONDS).withLookingForStuckThread(true).build())
        .around(rule)

    private var scenario: ActivityScenario<MainActivity>? = null

    @After fun close() { scenario?.close() }

    @Test fun completesFirstLaunch() {
        TestSupport.setFirstLaunch(onboardingDone = false, setupDone = false)
        scenario = ActivityScenario.launch(MainActivity::class.java)

        rule.waitForText("Manage everything")
        rule.onNodeWithText("Next").performClick()
        rule.waitForText("Code & run websites")
        rule.onNodeWithText("Next").performClick()
        rule.waitForText("Clean, secure, analyze")
        rule.onNodeWithText("Get started").performClick()

        // One file-access page follows the intro unless access is already on; "Not now" skips it.
        rule.waitUntil(30_000) {
            rule.onAllNodesWithText("Not now").fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodesWithText("Categories").fetchSemanticsNodes().isNotEmpty()
        }
        if (rule.onAllNodesWithText("Not now").fetchSemanticsNodes().isNotEmpty()) {
            rule.onNodeWithText("Allow file access").assertExists()
            rule.onNodeWithText("Not now").performClick()
        }
        rule.waitForText("Categories")
        rule.waitForText("Internal storage")
    }
}

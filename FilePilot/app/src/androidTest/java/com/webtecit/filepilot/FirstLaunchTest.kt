package com.webtecit.filepilot

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
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

/** Splash → onboarding → permission explanation → permission screen → Home, without granting access. */
@RunWith(AndroidJUnit4::class)
class FirstLaunchTest {
    private val rule = createEmptyComposeRule()

    @get:Rule val chain: RuleChain = RuleChain
        .outerRule(Timeout.builder().withTimeout(120, TimeUnit.SECONDS).withLookingForStuckThread(true).build())
        .around(rule)

    private var scenario: ActivityScenario<MainActivity>? = null

    @After fun close() { scenario?.close() }

    @Test fun completesFirstLaunchWithLimitedAccess() {
        TestSupport.setAllFilesAccess(false)
        TestSupport.setFirstLaunch(onboardingDone = false, setupDone = false)
        scenario = ActivityScenario.launch(MainActivity::class.java)

        rule.waitForText("File Manager")
        rule.onNodeWithText("Next").performClick()
        rule.waitForText("Code Studio")
        rule.onNodeWithText("Skip").performClick()

        rule.waitForText("Storage access")
        rule.onNodeWithText("Continue").performScrollTo().performClick()

        rule.waitForText("Continue with limited access")
        rule.onNodeWithTag("permissions_continue").performScrollTo().performClick()

        rule.waitForText("Allow storage access")
        rule.waitForText("Storage")
    }
}

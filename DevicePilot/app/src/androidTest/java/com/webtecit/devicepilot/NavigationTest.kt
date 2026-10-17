package com.webtecit.devicepilot

import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Starts the real app, passes onboarding and visits every bottom-navigation tab. */
@RunWith(AndroidJUnit4::class)
class NavigationTest {

    val rule = androidx.compose.ui.test.junit4.createEmptyComposeRule()
    private var scenario: androidx.test.core.app.ActivityScenario<MainActivity>? = null

    // A stuck test fails with a thread dump instead of hanging the whole run.
    @get:Rule val chain: org.junit.rules.RuleChain = org.junit.rules.RuleChain
        .outerRule(
            org.junit.rules.Timeout.builder()
                .withTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
                .withLookingForStuckThread(true)
                .build()
        )
        .around(rule)

    @org.junit.After fun close() { scenario?.close() }

    @Before fun skipOnboarding() {
        // The permission walk-through opens system dialogs and settings screens; it is covered
        // manually, so mark it done before launching the app.
        val context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
        kotlinx.coroutines.runBlocking { DevicePilotApp.container(context).settings.setPermissionsSetupDone() }
        scenario = androidx.test.core.app.ActivityScenario.launch(MainActivity::class.java)
        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Skip").fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodesWithText("Your device").fetchSemanticsNodes().isNotEmpty()
        }
        if (rule.onAllNodesWithText("Skip").fetchSemanticsNodes().isNotEmpty()) {
            rule.onNodeWithText("Skip").performClick()
            // Last onboarding page: accept the Privacy Policy and Disclaimer.
            rule.waitUntil(5_000) { rule.onAllNodes(androidx.compose.ui.test.hasTestTag("agree")).fetchSemanticsNodes().isNotEmpty() }
            rule.onNode(androidx.compose.ui.test.hasTestTag("agree")).performClick()
            rule.onNodeWithText("Get started").performClick()
        }
        // First start: the permission setup screen opens; it can be skipped.
        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Skip for now").fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodesWithText("Your device").fetchSemanticsNodes().isNotEmpty()
        }
        if (rule.onAllNodesWithText("Skip for now").fetchSemanticsNodes().isNotEmpty()) {
            rule.onNodeWithText("Skip for now").performScrollTo().performClick()
        }
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Your device").fetchSemanticsNodes().isNotEmpty() }
    }

    private fun openTab(label: String, expectTitle: String) {
        rule.onAllNodesWithText(label)[0].performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText(expectTitle).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun visitsAllTabs() {
        openTab("Apps", "Apps Manager")
        openTab("Network", "Network Usage")
        openTab("Temperature", "Android thermal status")
        openTab("Optimize", "Scan & optimize")
        openTab("Home", "Your device")
    }

    @Test fun opensSettingsAndAbout() {
        rule.onNodeWithContentDescriptionSafe("Settings")
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Official developer").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithContentDescriptionSafe("About")
        rule.waitUntil(5_000) { rule.onAllNodesWithText("MD. AHOSHAN HABIB NAYON").fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun optimizeScanProducesFindings() {
        openTab("Optimize", "Scan & optimize")
        rule.onAllNodesWithText("Scan & optimize").fetchSemanticsNodes()
        rule.onAllNodesWithText("Scan & optimize").let { nodes ->
            // The hero title and the button share the text; the button is the clickable one.
            nodes[nodes.fetchSemanticsNodes().size - 1].performClick()
        }
        rule.waitUntil(15_000) { rule.onAllNodesWithText("Summary").fetchSemanticsNodes().isNotEmpty() }
    }

    private fun androidx.compose.ui.test.junit4.ComposeTestRule.onNodeWithContentDescriptionSafe(desc: String) {
        onAllNodes(androidx.compose.ui.test.hasContentDescription(desc))[0].performClick()
    }
}

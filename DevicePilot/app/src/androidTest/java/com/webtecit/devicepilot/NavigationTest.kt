package com.webtecit.devicepilot

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Starts the real app, passes onboarding and visits every bottom-navigation tab. */
@RunWith(AndroidJUnit4::class)
class NavigationTest {

    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Before fun skipOnboarding() {
        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Skip").fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodesWithText("Performance").fetchSemanticsNodes().isNotEmpty()
        }
        if (rule.onAllNodesWithText("Skip").fetchSemanticsNodes().isNotEmpty()) {
            rule.onNodeWithText("Skip").performClick()
        }
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Performance").fetchSemanticsNodes().isNotEmpty() }
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
        openTab("Home", "Performance")
    }

    @Test fun opensSettingsAndAbout() {
        rule.onNodeWithContentDescriptionSafe("Settings")
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Appearance").fetchSemanticsNodes().isNotEmpty() }
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

    private fun androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, *>.onNodeWithContentDescriptionSafe(desc: String) {
        onAllNodes(androidx.compose.ui.test.hasContentDescription(desc))[0].performClick()
    }
}

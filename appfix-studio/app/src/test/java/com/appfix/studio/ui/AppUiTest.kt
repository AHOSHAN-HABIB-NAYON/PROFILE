package com.appfix.studio.ui

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.unit.dp
import com.appfix.studio.MainActivity
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Drives the real app UI under Robolectric: bottom navigation, importing the bundled sample,
 * opening project tools, and basic accessibility checks on every screen visited.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class AppUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    private fun tab(label: String) = SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab) and hasText(label)

    /** Every clickable element needs a label for TalkBack and a reasonably sized touch target. */
    private fun assertAccessible(screen: String) {
        rule.waitForIdle()
        val problems = mutableListOf<String>()
        fun visit(n: SemanticsNode) {
            val c = n.config
            if (c.contains(SemanticsActions.OnClick) && c.getOrNull(SemanticsProperties.Disabled) == null) {
                val label = (c.getOrNull(SemanticsProperties.ContentDescription).orEmpty() + c.getOrNull(SemanticsProperties.Text).orEmpty().map { it.text } +
                    listOfNotNull(c.getOrNull(SemanticsActions.OnClick)?.label)).joinToString().trim()
                val density = rule.density
                val w = with(density) { n.size.width.toDp() }
                val h = with(density) { n.size.height.toDp() }
                if (label.isEmpty()) problems += "unlabelled clickable at ${n.boundsInRoot}"
                if (n.size.width > 0 && (w < 44.dp || h < 44.dp)) problems += "small touch target '$label' ${w}x$h"
            }
            n.children.forEach(::visit)
        }
        visit(rule.onRoot(useUnmergedTree = false).fetchSemanticsNode())
        assertTrue("$screen: ${problems.joinToString("; ")}", problems.isEmpty())
    }

    @Test fun `bottom navigation reaches every top-level screen`() {
        rule.onNodeWithText("Fix it. Customise it. Rebuild it.").assertExists()
        assertAccessible("Home")
        rule.onNode(tab("Projects")).performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Projects").fetchSemanticsNodes().size >= 2 }
        assertAccessible("Projects")
        rule.onNode(tab("Repair")).performClick()
        rule.onNodeWithText("Repair center").assertExists()
        assertAccessible("Repair")
        rule.onNode(tab("Settings")).performClick()
        rule.onNodeWithText("Theme").assertExists()
        assertAccessible("Settings")
        rule.onNode(tab("Editor")).performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Editor").fetchSemanticsNodes().size >= 2 }
        assertAccessible("Editor")
        rule.onNode(tab("Home")).performClick()
        rule.onNodeWithText("Fix it. Customise it. Rebuild it.").assertExists()
    }

    @Test fun `import the sample and open the assistant and repair tools`() {
        rule.onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Sample app"))
        rule.onNodeWithText("Sample app").performClick()
        rule.waitUntil(30_000) { rule.onAllNodesWithText("AI assistant").fetchSemanticsNodes().isNotEmpty() }
        assertAccessible("Project")
        rule.onNodeWithText("AI assistant").performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("AI is not set up", substring = true).fetchSemanticsNodes().isNotEmpty() }
        assertAccessible("Assistant")
        rule.onNodeWithText("Set up").performClick()
        rule.onNodeWithText("AI provider").assertExists()
        rule.onNodeWithText("Cancel").performClick()
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Visual editor").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Visual editor").performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("activity_main", substring = true).fetchSemanticsNodes().isNotEmpty() }
        assertAccessible("Visual editor")
    }
}

package com.webtecit.filepilot

import android.os.Build
import android.os.Environment
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.webtecit.filepilot.TestSupport.waitForText
import java.io.File
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.Timeout
import org.junit.runner.RunWith

/** Opens internal storage, creates a folder, then selects and deletes it through the UI. */
@RunWith(AndroidJUnit4::class)
class FileOperationsUiTest {
    private val rule = createEmptyComposeRule()

    @get:Rule val chain: RuleChain = RuleChain
        .outerRule(Timeout.builder().withTimeout(150, TimeUnit.SECONDS).withLookingForStuckThread(true).build())
        .around(rule)

    private var scenario: ActivityScenario<MainActivity>? = null
    private val folderName = "FilePilotUiTest_${System.currentTimeMillis()}"

    @Before fun setUp() {
        assumeTrue("All files access is granted through appops on Android 11+", Build.VERSION.SDK_INT >= 30)
        TestSupport.setAllFilesAccess(true)
        TestSupport.setFirstLaunch(onboardingDone = true, setupDone = true)
        scenario = ActivityScenario.launch(MainActivity::class.java)
        rule.waitForText("Internal storage")
    }

    @After fun tearDown() {
        scenario?.close()
        File(Environment.getExternalStorageDirectory(), folderName).deleteRecursively()
    }

    @Test fun createsAndDeletesAFolder() {
        rule.onAllNodesWithText("Internal storage")[0].performClick()
        rule.waitUntil(15_000) { rule.onAllNodesWithText("folder", substring = true).fetchSemanticsNodes().isNotEmpty() }

        rule.onNodeWithContentDescription("Create").performClick()
        rule.onNodeWithText("New folder").performClick()
        rule.onNodeWithTag("name_field").performTextInput(folderName)
        rule.onNodeWithText("Create").performClick()

        rule.waitUntil(15_000) { File(Environment.getExternalStorageDirectory(), folderName).isDirectory }
        rule.onNodeWithTag("file_list").performScrollToNode(hasText(folderName))
        rule.waitForText(folderName)

        rule.onNodeWithText(folderName).performTouchInput { longClick() }
        rule.waitForText("1 selected")
        rule.onNodeWithText("Delete").performClick()
        rule.waitForText("Delete permanently")
        rule.onNodeWithText("Delete permanently").performClick()

        rule.waitUntil(20_000) { !File(Environment.getExternalStorageDirectory(), folderName).exists() }
        rule.waitUntil(15_000) { rule.onAllNodesWithText(folderName).fetchSemanticsNodes().isEmpty() }
    }
}

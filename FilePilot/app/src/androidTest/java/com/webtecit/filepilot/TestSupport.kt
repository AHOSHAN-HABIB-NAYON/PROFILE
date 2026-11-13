package com.webtecit.filepilot

import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.platform.app.InstrumentationRegistry
import com.webtecit.filepilot.core.common.AppEntryPoint
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.runBlocking

object TestSupport {
    val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    fun prefs() = EntryPointAccessors.fromApplication(context.applicationContext, AppEntryPoint::class.java).preferences()

    fun setFirstLaunch(onboardingDone: Boolean, setupDone: Boolean) = runBlocking {
        prefs().setOnboardingDone(onboardingDone)
        prefs().setPermissionsSetupDone(setupDone)
    }

    /** Grants or resets "All files access" (Android 11+) through the shell. */
    fun setAllFilesAccess(allow: Boolean) {
        val mode = if (allow) "allow" else "default"
        shell("appops set ${context.packageName} MANAGE_EXTERNAL_STORAGE $mode")
    }

    fun shell(command: String) {
        val pfd = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)
        android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).use { it.readBytes() }
    }

    fun ComposeTestRule.waitForText(text: String, timeoutMs: Long = 15_000) {
        waitUntil(timeoutMs) { onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }
}

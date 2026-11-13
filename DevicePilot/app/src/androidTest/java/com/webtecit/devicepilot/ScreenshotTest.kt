package com.webtecit.devicepilot

import android.content.Intent
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.webtecit.devicepilot.data.ThemeMode
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Captures real screenshots of the main screens for the README / store listing.
 * Files go to /data/local/tmp/dp_shots (CI pulls them with adb). Play-edition files are
 * prefixed "play-" so the Google Play listing shows exactly the Play edition.
 */
@RunWith(AndroidJUnit4::class)
class ScreenshotTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    private fun shell(cmd: String) {
        instrumentation.uiAutomation.executeShellCommand(cmd).use { pfd ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).use { it.readBytes() }
        }
    }

    @Test fun captureMainScreens() {
        runBlocking {
            val s = DevicePilotApp.container(context).settings
            s.setOnboardingDone()
            s.setPermissionsSetupDone()
            s.setTheme(ThemeMode.LIGHT)
        }
        shell("appops set ${context.packageName} GET_USAGE_STATS allow")
        shell("mkdir -p /data/local/tmp/dp_shots")
        // A typical everyday battery state instead of the emulator's "100 % charging".
        // Demo phone name (one word: the shell command is not quote-aware) shown on the Home card (Settings → About phone → Device name).
        shell("settings put global device_name Aurora")
        shell("dumpsys battery unplug")
        shell("dumpsys battery set level 78")
        shell("dumpsys battery set temp 318")
        val prefix = if (BuildConfig.FULL) "" else "play-"
        val screens = listOf(
            "01-home" to null, "02-device-details" to "device", "03-boost" to "boost", "04-cool-down" to "cool",
            "05-cleaner" to "cleaner", "06-battery" to "battery", "07-temperature" to "temperature",
            "08-apps" to "apps", "09-running-apps" to "running", "10-optimize" to "optimize",
            "11-settings" to "settings", "12-about" to "about",
        )
        for ((name, route) in screens) {
            val intent = Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            if (route != null) intent.putExtra(MainActivity.EXTRA_ROUTE, route)
            ActivityScenario.launch<MainActivity>(intent).use {
                Thread.sleep(3_000) // let data load and entrance animations finish
                shell("screencap -p /data/local/tmp/dp_shots/$prefix$name.png")
            }
        }
        shell("dumpsys battery reset")
    }
}

package com.webtecit.devicepilot

import android.content.Context
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.core.designsystem.DevicepilotTheme
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.data.repository.BatteryRepository
import com.webtecit.devicepilot.data.repository.DeviceInfoRepository
import com.webtecit.devicepilot.data.repository.NetworkRepository
import com.webtecit.devicepilot.data.repository.SystemRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Runs the repositories against the real device / emulator APIs. */
@RunWith(AndroidJUnit4::class)
class DeviceRepositoriesTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val system = SystemRepository(context)
    private val battery = BatteryRepository(context)
    private val network = NetworkRepository(context)

    @Test fun memoryAndStorageAreReal() {
        val mem = system.memory()
        assertTrue(mem.totalBytes > 0 && mem.availableBytes in 0..mem.totalBytes)
        val st = system.storage()
        assertTrue(st.totalBytes > 0 && st.freeBytes in 0..st.totalBytes)
    }

    @Test fun cpuReadingNeverCrashes() {
        val cpu = system.cpu()
        assertTrue(cpu.coreCount > 0)
        // On Android 8+ load is either estimated or explicitly restricted — never "measured".
        assertTrue(cpu.load is Reading.Estimated || cpu.load is Reading.Unavailable)
    }

    @Test fun batteryIsReadable() {
        val b = battery.current()
        assertNotNull(b)
        assertTrue(b!!.levelPercent in 0..100)
    }

    @Test fun deviceReportHasAllSections() = runBlocking {
        val repo = DeviceInfoRepository(context, system, battery, network)
        val titles = repo.report().map { it.title }
        assertTrue(titles.containsAll(listOf("Device", "Software", "Processor", "Memory & Storage", "Display", "Network")))
        assertTrue(repo.reportAsText(repo.report()).contains("Devicepilot"))
    }
}

@RunWith(AndroidJUnit4::class)
class ComponentsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun unavailableReadingShowsReason() {
        compose.setContent {
            DevicepilotTheme {
                DpCard {
                    Text("Battery")
                    ReadingRow("Cycle count", Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)) { it.toString() }
                }
            }
        }
        compose.onNodeWithText("Not Supported").assertIsDisplayed()
        compose.onNodeWithText("Cycle count").assertIsDisplayed()
    }
}

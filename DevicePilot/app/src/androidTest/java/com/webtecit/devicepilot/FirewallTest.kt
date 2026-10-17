package com.webtecit.devicepilot

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.firewall.FirewallController
import com.webtecit.devicepilot.firewall.FirewallPhase
import com.webtecit.devicepilot.firewall.FirewallState
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Starts the real VpnService. DevicePilot itself is always routed into the tunnel, so a TCP
 * connection from this (same-UID) test process must be refused immediately by the RST logic.
 */
@RunWith(AndroidJUnit4::class)
class FirewallTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    private fun shell(cmd: String) {
        instrumentation.uiAutomation.executeShellCommand(cmd).close()
    }

    private fun waitFor(phase: FirewallPhase, timeoutMs: Long = 10_000): Boolean {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) {
            if (FirewallState.status.value.phase == phase) return true
            Thread.sleep(100)
        }
        return false
    }

    @After fun tearDown() {
        instrumentation.runOnMainSync { runCatching { FirewallController.stop(context) } }
        waitFor(FirewallPhase.OFF)
        runBlocking { DevicePilotApp.container(context).settings.clearRules() }
    }

    @Test fun blocksTrafficOfTunneledAppAndStopsCleanly() {
        // Grant VPN consent the same way the system dialog does (test-only shortcut).
        shell("appops set ${context.packageName} ACTIVATE_VPN allow")
        Thread.sleep(500)
        assertNull("VPN consent should be granted for the test", FirewallController.consentIntent(context))

        // Android only lets a foreground app start services, so bring the app to the front first.
        val scenario = androidx.test.core.app.ActivityScenario.launch(MainActivity::class.java)
        Thread.sleep(1000)
        try {
            runBlockingTest()
        } finally {
            instrumentation.runOnMainSync { runCatching { FirewallController.stop(context) } }
            waitFor(FirewallPhase.OFF)
            scenario.close()
        }
    }

    private fun runBlockingTest() {
        runBlocking { DevicePilotApp.container(context).settings.setRule(AppRule("com.android.chrome", true, true)) }
        instrumentation.runOnMainSync { FirewallController.start(context) }
        assertTrue("firewall did not become active: ${FirewallState.status.value}", waitFor(FirewallPhase.ACTIVE))
        Thread.sleep(1000)

        val started = System.currentTimeMillis()
        try {
            Socket().use { it.connect(InetSocketAddress("1.1.1.1", 443), 8_000) }
            fail("Connection should be blocked by the firewall")
        } catch (e: IOException) {
            val took = System.currentTimeMillis() - started
            // A RST makes the connect fail fast instead of timing out.
            assertTrue("blocked connection took $took ms: $e", took < 7_000)
        }
        assertTrue(FirewallState.status.value.droppedPackets > 0)

        instrumentation.runOnMainSync { FirewallController.stop(context) }
        assertTrue(waitFor(FirewallPhase.OFF))
        assertEquals(FirewallPhase.OFF, FirewallState.status.value.phase)
    }
}

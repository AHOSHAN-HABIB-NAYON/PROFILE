package com.webtecit.devicepilot

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.webtecit.devicepilot.data.install.ApkInspection
import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.domain.TemperatureUnit
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class DataLayerTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val c get() = DevicePilotApp.container(context)

    @Test fun settingsPersist() = runBlocking {
        c.settings.setTemperatureUnit(TemperatureUnit.FAHRENHEIT)
        assertEquals(TemperatureUnit.FAHRENHEIT, c.settings.current().temperatureUnit)
        c.settings.setTemperatureUnit(TemperatureUnit.CELSIUS)
        assertEquals(TemperatureUnit.CELSIUS, c.settings.current().temperatureUnit)
    }

    @Test fun firewallRulesPersist() = runBlocking {
        c.settings.setRule(AppRule("com.example.test", true, false))
        assertEquals(AppRule("com.example.test", true, false), c.settings.current().firewallRules["com.example.test"])
        c.settings.setRule(AppRule("com.example.test", false, false))
        assertNull(c.settings.current().firewallRules["com.example.test"])
    }

    @Test fun realDeviceReadings() {
        val m = c.monitor.memory()
        assertTrue(m.totalBytes > 0 && m.availableBytes in 1..m.totalBytes)
        val s = c.monitor.storage()
        assertNotNull(s)
        assertTrue(s!!.totalBytes >= s.freeBytes)
        val b = c.monitor.battery()
        // Values are either real or null — never invented.
        b.percent?.let { assertTrue(it in 0..100) }
        b.celsius?.let { assertTrue(it > -30f && it < 95f) }
        c.monitor.thermal() // must not crash on any API level
        c.monitor.thermalZones().forEach { assertTrue(it.celsius > -30f && it.celsius < 150f) }
    }

    @Test fun installedAppsAreListed() = runBlocking {
        val apps = c.apps.loadApps()
        assertTrue(apps.any { it.packageName == context.packageName })
        assertTrue(c.apps.isInstalled(context.packageName))
        assertFalse(c.apps.isInstalled("com.example.does.not.exist"))
    }

    @Test fun inspectsOwnApk() = runBlocking {
        val apk = File(context.applicationInfo.sourceDir)
        val result = c.apkInspector.inspect(Uri.fromFile(apk))
        assertTrue(result is ApkInspection.Valid)
        val d = (result as ApkInspection.Valid).details
        assertEquals(context.packageName, d.packageName)
        assertTrue(d.isUpdate)
        assertFalse(d.signatureMismatch)
        assertNotNull(d.signerSha256)
    }

    @Test fun nonApkIsRejected() = runBlocking {
        val f = File(context.cacheDir, "not-an-apk.apk").apply { writeText("hello") }
        val result = c.apkInspector.inspect(Uri.fromFile(f))
        assertTrue(result is ApkInspection.Invalid)
    }

    @Test fun usageDataWithoutPermissionIsNullNotFake() = runBlocking {
        if (!c.usage.hasUsageAccess()) {
            val range = com.webtecit.devicepilot.domain.UsagePeriods.range(
                com.webtecit.devicepilot.domain.UsagePeriod.TODAY, System.currentTimeMillis(), 1)
            assertNull(c.usage.perAppUsage(range))
            assertTrue(c.usage.appUsage(range).isEmpty())
        }
    }
}

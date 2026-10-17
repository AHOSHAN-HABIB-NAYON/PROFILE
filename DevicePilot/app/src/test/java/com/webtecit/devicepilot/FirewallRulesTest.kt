package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.domain.FirewallRules
import com.webtecit.devicepilot.domain.Transport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FirewallRulesTest {
    private val rules = listOf(
        AppRule("com.example.video", blockWifi = true, blockMobile = true),
        AppRule("com.example.game", blockWifi = false, blockMobile = true),
        AppRule("com.example.sync", blockWifi = true, blockMobile = false),
        AppRule("com.webtecit.devicepilot", blockWifi = true, blockMobile = true),
    )

    @Test fun encodeDecodeRoundTrip() {
        val r = AppRule("com.example.app", true, false)
        assertEquals(r, FirewallRules.decode(FirewallRules.encode(r)))
    }
    @Test fun rejectsGarbage() {
        assertNull(FirewallRules.decode("nonsense"))
        assertNull(FirewallRules.decode("|1|1"))
        assertNull(FirewallRules.decode("not a package|1|1"))
    }
    @Test fun inactiveRulesAreDropped() {
        val set = FirewallRules.encodeAll(listOf(AppRule("com.a.b", false, false), AppRule("com.c.d", true, false)))
        assertEquals(1, set.size)
        assertEquals(setOf("com.c.d"), FirewallRules.decodeAll(set).keys)
    }
    @Test fun wifiTransport() = assertEquals(setOf("com.example.video", "com.example.sync"),
        FirewallRules.packagesToBlock(rules, Transport.WIFI, "com.webtecit.devicepilot"))
    @Test fun mobileTransport() = assertEquals(setOf("com.example.video", "com.example.game"),
        FirewallRules.packagesToBlock(rules, Transport.MOBILE, "com.webtecit.devicepilot"))
    @Test fun ethernetUsesWifiRule() = assertEquals(FirewallRules.packagesToBlock(rules, Transport.WIFI, "x.y"),
        FirewallRules.packagesToBlock(rules, Transport.OTHER, "x.y"))
    @Test fun unknownTransportBlocksEither() = assertEquals(4, FirewallRules.packagesToBlock(rules, Transport.NONE, "x.y").size)
    @Test fun neverBlocksOwnPackage() = assertFalse(
        FirewallRules.packagesToBlock(rules, Transport.WIFI, "com.webtecit.devicepilot").contains("com.webtecit.devicepilot"))
    @Test fun packageNameValidation() {
        assertTrue(FirewallRules.isValidPackageName("com.google.android.youtube"))
        assertFalse(FirewallRules.isValidPackageName("nodots"))
        assertFalse(FirewallRules.isValidPackageName("1com.bad"))
    }
}

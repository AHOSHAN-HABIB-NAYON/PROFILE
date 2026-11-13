package com.webtecit.devicepilot.firewall

import android.content.Context
import android.content.Intent
import android.net.VpnService

object FirewallController {

    /** Non-null when Android still needs the user's VPN consent. */
    fun consentIntent(context: Context): Intent? = VpnService.prepare(context)

    fun start(context: Context) {
        context.startService(Intent(context, FirewallVpnService::class.java).setAction(FirewallVpnService.ACTION_START))
    }

    fun reload(context: Context) {
        if (FirewallState.status.value.phase == FirewallPhase.ACTIVE) {
            context.startService(Intent(context, FirewallVpnService::class.java).setAction(FirewallVpnService.ACTION_RELOAD))
        }
    }

    fun stop(context: Context) {
        context.startService(Intent(context, FirewallVpnService::class.java).setAction(FirewallVpnService.ACTION_STOP))
    }
}

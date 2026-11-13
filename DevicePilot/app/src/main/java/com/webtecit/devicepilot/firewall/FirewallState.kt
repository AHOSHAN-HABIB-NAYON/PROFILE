package com.webtecit.devicepilot.firewall

import com.webtecit.devicepilot.domain.Transport
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class FirewallPhase { OFF, STARTING, ACTIVE, PAUSED, PERMISSION_REQUIRED, ERROR }

data class FirewallStatus(
    val phase: FirewallPhase = FirewallPhase.OFF,
    val transport: Transport = Transport.NONE,
    val blockedNow: Set<String> = emptySet(),
    val droppedPackets: Long = 0,
    val resetsSent: Long = 0,
    val since: Long = 0,
    val error: String? = null,
)

object FirewallState {
    private val _status = MutableStateFlow(FirewallStatus())
    val status: StateFlow<FirewallStatus> = _status.asStateFlow()

    fun set(s: FirewallStatus) { _status.value = s }
    fun update(block: (FirewallStatus) -> FirewallStatus) = _status.update(block)
}

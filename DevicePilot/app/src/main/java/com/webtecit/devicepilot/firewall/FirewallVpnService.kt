package com.webtecit.devicepilot.firewall

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import com.webtecit.devicepilot.DevicePilotApp
import com.webtecit.devicepilot.MainActivity
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.domain.FirewallRules
import com.webtecit.devicepilot.domain.Transport
import com.webtecit.devicepilot.work.Notifier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * Local, on-device firewall built on Android's VpnService.
 *
 * Only the apps the user blocks are routed into the tunnel (addAllowedApplication), so every
 * other app keeps using the normal network directly and is never touched. Packets from
 * blocked apps are dropped; TCP connection attempts are answered with a reset so the app
 * fails fast. No traffic is forwarded to any server, logged or inspected.
 *
 * Wi-Fi and mobile rules are applied by watching the underlying (non-VPN) networks and
 * rebuilding the tunnel's app list when the active transport changes.
 */
class FirewallVpnService : VpnService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    private var tun: ParcelFileDescriptor? = null
    private var reader: Thread? = null
    private var rules: Map<String, AppRule> = emptyMap()
    private var appliedKey: String? = null
    private var stopping = false
    private var rulesJob: Job? = null

    private val networks = ConcurrentHashMap<Network, NetworkCapabilities>()
    private lateinit var connectivity: ConnectivityManager
    private var callbackRegistered = false

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            networks[network] = caps
            applyRules()
        }

        override fun onLost(network: Network) {
            networks.remove(network)
            applyRules()
        }
    }

    override fun onCreate() {
        super.onCreate()
        connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdown(userInitiated = true)
                return START_NOT_STICKY
            }
            ACTION_RELOAD -> scope.launch { loadRulesAndApply() }
            // ACTION_START, or a start by the system (always-on VPN).
            else -> start()
        }
        return START_STICKY
    }

    private fun start() {
        stopping = false
        FirewallState.update { it.copy(phase = FirewallPhase.STARTING, error = null) }
        if (!callbackRegistered) {
            // A default NetworkRequest excludes VPN networks, so we only see real transports.
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            runCatching { connectivity.registerNetworkCallback(request, networkCallback) }
                .onSuccess { callbackRegistered = true }
        }
        if (rulesJob?.isActive == true) {
            applyRules()
            return
        }
        rulesJob = scope.launch {
            // React to rule edits while running.
            DevicePilotApp.container(this@FirewallVpnService).settings.settings
                .map { it.firewallRules }
                .distinctUntilChanged()
                .collect { r ->
                    rules = r
                    applyRules()
                }
        }
    }

    private suspend fun loadRulesAndApply() {
        rules = DevicePilotApp.container(this).settings.current().firewallRules
        appliedKey = null
        applyRules()
    }

    private fun currentTransport(): Transport {
        val caps = networks.values
        return when {
            caps.any { it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) } -> Transport.WIFI
            caps.any { it.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) } -> Transport.OTHER
            caps.any { it.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) } -> Transport.MOBILE
            caps.isNotEmpty() -> Transport.OTHER
            else -> Transport.NONE
        }
    }

    private fun underlyingNetwork(transport: Transport): Network? = networks.entries.firstOrNull { (_, c) ->
        when (transport) {
            Transport.WIFI -> c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
            Transport.MOBILE -> c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
            Transport.OTHER -> true
            Transport.NONE -> false
        }
    }?.key

    private fun applyRules() = synchronized(lock) {
        if (stopping) return@synchronized
        val transport = currentTransport()
        val block = FirewallRules.packagesToBlock(rules.values, transport, packageName)
        val key = transport.name + ":" + block.sorted().joinToString(",")
        if (key == appliedKey && tun != null) return@synchronized
        establish(transport, block)
        appliedKey = key
    }

    private fun establish(transport: Transport, block: Set<String>) {
        val builder = Builder()
            .setSession(getString(R.string.firewall_session_name))
            .setMtu(1500)
            .addAddress(TUN_V4, 32)
            .addRoute("0.0.0.0", 0)
            .addDnsServer(DNS_V4)
        runCatching { builder.addAddress(TUN_V6, 128).addRoute("::", 0) }
        // DevicePilot itself is always inside the tunnel. It needs no internet, and this keeps
        // the allow-list non-empty: an empty allow-list would route EVERY app into the VPN.
        builder.addAllowedApplication(packageName)
        val applied = mutableSetOf<String>()
        for (pkg in block) {
            try {
                builder.addAllowedApplication(pkg)
                applied += pkg
            } catch (_: PackageManager.NameNotFoundException) {
                // App was uninstalled; skip it.
            }
        }
        underlyingNetwork(transport)?.let { builder.setUnderlyingNetworks(arrayOf(it)) }
        val configure = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_ROUTE, "firewall"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        builder.setConfigureIntent(configure)

        val newTun = try {
            builder.establish()
        } catch (t: Throwable) {
            Log.w(TAG, "establish failed", t)
            FirewallState.update { it.copy(phase = FirewallPhase.ERROR, error = t.message) }
            return
        }
        if (newTun == null) {
            FirewallState.update { it.copy(phase = FirewallPhase.PERMISSION_REQUIRED) }
            return
        }
        val old = tun
        tun = newTun
        startReader(newTun)
        // Closing the old descriptor after the new one is up avoids a gap in blocking.
        runCatching { old?.close() }
        FirewallState.update {
            it.copy(
                phase = FirewallPhase.ACTIVE,
                transport = transport,
                blockedNow = applied,
                since = if (it.phase == FirewallPhase.ACTIVE) it.since else System.currentTimeMillis(),
                error = null,
            )
        }
    }

    private fun startReader(pfd: ParcelFileDescriptor) {
        val t = Thread({
            val input = FileInputStream(pfd.fileDescriptor)
            val output = FileOutputStream(pfd.fileDescriptor)
            val buf = ByteArray(32767)
            try {
                while (!Thread.currentThread().isInterrupted) {
                    val n = input.read(buf)
                    if (n <= 0) {
                        if (n < 0) break
                        continue
                    }
                    var reset = false
                    PacketTools.buildTcpReset(buf, n)?.let {
                        output.write(it)
                        reset = true
                    }
                    FirewallState.update { s ->
                        s.copy(droppedPackets = s.droppedPackets + 1, resetsSent = s.resetsSent + if (reset) 1 else 0)
                    }
                }
            } catch (_: Exception) {
                // Descriptor closed (rule change or stop) – this reader is finished.
            }
        }, "dp-firewall")
        val previous = reader
        reader = t
        t.isDaemon = true
        t.start()
        previous?.interrupt()
    }

    private fun shutdown(userInitiated: Boolean) {
        synchronized(lock) {
            stopping = true
            rulesJob?.cancel()
            rulesJob = null
            reader?.interrupt()
            reader = null
            runCatching { tun?.close() }
            tun = null
            appliedKey = null
        }
        if (callbackRegistered) {
            runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
            callbackRegistered = false
        }
        if (userInitiated) FirewallState.set(FirewallStatus(phase = FirewallPhase.OFF))
        stopSelf()
    }

    /** Called when the user disconnects in system settings or another VPN app takes over. */
    override fun onRevoke() {
        FirewallState.set(FirewallStatus(phase = FirewallPhase.PAUSED))
        scope.launch {
            val s = DevicePilotApp.container(this@FirewallVpnService).settings.current()
            if (s.notifyFirewall && s.firewallWanted) Notifier.firewallInterrupted(this@FirewallVpnService)
        }
        shutdown(userInitiated = false)
    }

    override fun onDestroy() {
        if (!stopping) shutdown(userInitiated = false)
        if (FirewallState.status.value.phase == FirewallPhase.ACTIVE ||
            FirewallState.status.value.phase == FirewallPhase.STARTING
        ) {
            FirewallState.set(FirewallStatus(phase = FirewallPhase.OFF))
        }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.webtecit.devicepilot.firewall.START"
        const val ACTION_STOP = "com.webtecit.devicepilot.firewall.STOP"
        const val ACTION_RELOAD = "com.webtecit.devicepilot.firewall.RELOAD"
        private const val TAG = "DPFirewall"
        private const val TUN_V4 = "10.215.0.1"
        private const val DNS_V4 = "10.215.0.53"
        private const val TUN_V6 = "fd8f:dc1a:7e00::1"
    }
}

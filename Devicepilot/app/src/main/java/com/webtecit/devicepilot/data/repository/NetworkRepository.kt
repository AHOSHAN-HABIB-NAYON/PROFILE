package com.webtecit.devicepilot.data.repository

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.TrafficStats
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.SystemClock
import com.webtecit.devicepilot.core.common.AppInfo
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.domain.model.ConnectionType
import com.webtecit.devicepilot.domain.model.NetworkStatus
import com.webtecit.devicepilot.domain.model.TrafficSnapshot
import com.webtecit.devicepilot.domain.model.WifiDetails
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

@Singleton
class NetworkRepository @Inject constructor(@ApplicationContext private val context: Context) {

    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager?

    fun current(): NetworkStatus {
        val network = cm.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }
        val link = network?.let { cm.getLinkProperties(it) }
        return build(caps, link)
    }

    /** Emits whenever the default network or its capabilities change. */
    fun observe(): Flow<NetworkStatus> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(current()) }
            override fun onLost(network: Network) { trySend(current()) }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { trySend(current()) }
            override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) { trySend(current()) }
        }
        trySend(current())
        try {
            cm.registerDefaultNetworkCallback(callback)
        } catch (e: Exception) {
            cm.registerNetworkCallback(NetworkRequest.Builder().build(), callback)
        }
        awaitClose { runCatching { cm.unregisterNetworkCallback(callback) } }
    }.conflate()

    private fun build(caps: NetworkCapabilities?, link: LinkProperties?): NetworkStatus {
        if (caps == null) {
            return NetworkStatus(false, ConnectionType.NONE, false, false,
                Reading.Unavailable(UnavailableReason.NOT_AVAILABLE), Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
                null, emptyList(), emptyList(), null)
        }
        val type = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> ConnectionType.VPN
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> ConnectionType.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> ConnectionType.CELLULAR
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> ConnectionType.ETHERNET
            else -> ConnectionType.OTHER
        }
        val down = caps.linkDownstreamBandwidthKbps
        val up = caps.linkUpstreamBandwidthKbps
        return NetworkStatus(
            connected = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
            type = type,
            validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
            downstreamKbps = if (down > 0) Reading.Estimated(down, "Android link estimate") else Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
            upstreamKbps = if (up > 0) Reading.Estimated(up, "Android link estimate") else Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
            wifi = if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) wifiDetails(caps) else null,
            localAddresses = link?.linkAddresses?.map { it.address.hostAddress ?: "" }?.filter { it.isNotBlank() } ?: emptyList(),
            dnsServers = link?.dnsServers?.mapNotNull { it.hostAddress } ?: emptyList(),
            interfaceName = link?.interfaceName,
        )
    }

    @Suppress("DEPRECATION")
    private fun wifiDetails(caps: NetworkCapabilities): WifiDetails {
        val info: WifiInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            caps.transportInfo as? WifiInfo ?: runCatching { wifiManager?.connectionInfo }.getOrNull()
        } else runCatching { wifiManager?.connectionInfo }.getOrNull()
        if (info == null) {
            val na = Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
            return WifiDetails(na, na, na, na, na)
        }
        // Android hides the SSID unless the app holds location permission. Devicepilot does not request it.
        val ssid = info.ssid?.trim('"')
        val ssidReading: Reading<String> =
            if (ssid.isNullOrBlank() || ssid == "<unknown ssid>" || ssid == WifiManager.UNKNOWN_SSID.trim('<', '>'))
                Reading.Unavailable(UnavailableReason.RESTRICTED) else Reading.Measured(ssid)
        val standard: Reading<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            when (info.wifiStandard) {
                4 -> Reading.Measured("Wi-Fi 4 (802.11n)")
                5 -> Reading.Measured("Wi-Fi 5 (802.11ac)")
                6 -> Reading.Measured("Wi-Fi 6 (802.11ax)")
                7 -> Reading.Measured("802.11ad")
                8 -> Reading.Measured("Wi-Fi 7 (802.11be)")
                1 -> Reading.Measured("Legacy (802.11a/b/g)")
                else -> Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
            }
        } else Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        return WifiDetails(
            ssid = ssidReading,
            rssiDbm = info.rssi.takeIf { it in -127..0 }?.let { Reading.Measured(it) } ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
            linkSpeedMbps = info.linkSpeed.takeIf { it > 0 }?.let { Reading.Measured(it) } ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
            frequencyMhz = info.frequency.takeIf { it > 0 }?.let { Reading.Measured(it) } ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
            standard = standard,
        )
    }

    /** Live device-wide throughput from TrafficStats (no permission, no data leaves the device). */
    fun traffic(intervalMs: Long): Flow<TrafficSnapshot?> = flow {
        var lastRx = TrafficStats.getTotalRxBytes()
        var lastTx = TrafficStats.getTotalTxBytes()
        if (lastRx == TrafficStats.UNSUPPORTED.toLong()) {
            emit(null); return@flow
        }
        var lastTime = SystemClock.elapsedRealtime()
        while (true) {
            delay(intervalMs)
            val rx = TrafficStats.getTotalRxBytes()
            val tx = TrafficStats.getTotalTxBytes()
            val now = SystemClock.elapsedRealtime()
            val seconds = ((now - lastTime) / 1000.0).coerceAtLeast(0.001)
            emit(TrafficSnapshot(((rx - lastRx) / seconds).toLong().coerceAtLeast(0), ((tx - lastTx) / seconds).toLong().coerceAtLeast(0), rx, tx))
            lastRx = rx; lastTx = tx; lastTime = now
        }
    }.flowOn(Dispatchers.Default)
}

/** Speed and latency tests. They only run when the user taps Start; nothing about the device is sent. */
@Singleton
class SpeedTestRepository @Inject constructor() {

    sealed interface Progress {
        data class Running(val phase: String, val fraction: Float, val currentBps: Double) : Progress
        data class Done(val bitsPerSecond: Double, val bytes: Long, val millis: Long) : Progress
    }

    /** TCP connect time to a public anycast endpoint, a reliable proxy for latency without ICMP. */
    suspend fun ping(host: String = "1.1.1.1", port: Int = 443, samples: Int = 5): List<Long> = withContext(Dispatchers.IO) {
        (0 until samples).mapNotNull {
            coroutineContext.ensureActive()
            try {
                Socket().use { s ->
                    val start = SystemClock.elapsedRealtimeNanos()
                    s.connect(InetSocketAddress(host, port), 3_000)
                    (SystemClock.elapsedRealtimeNanos() - start) / 1_000_000
                }
            } catch (e: Exception) {
                null
            }.also { delay(150) }
        }
    }

    suspend fun download(totalBytes: Long = 25_000_000, onProgress: (Progress) -> Unit): Progress.Done =
        withContext(Dispatchers.IO) {
            val url = URL("https://${AppInfo.SPEED_TEST_HOST}/__down?bytes=$totalBytes")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 8_000; readTimeout = 15_000; useCaches = false
            }
            try {
                val buffer = ByteArray(64 * 1024)
                var read = 0L
                val start = SystemClock.elapsedRealtime()
                conn.inputStream.use { input ->
                    while (true) {
                        coroutineContext.ensureActive()
                        val n = input.read(buffer)
                        if (n < 0) break
                        read += n
                        val elapsed = (SystemClock.elapsedRealtime() - start).coerceAtLeast(1)
                        onProgress(Progress.Running("Download", read.toFloat() / totalBytes, read * 8_000.0 / elapsed))
                        if (elapsed > 15_000) break
                    }
                }
                val elapsed = (SystemClock.elapsedRealtime() - start).coerceAtLeast(1)
                Progress.Done(read * 8_000.0 / elapsed, read, elapsed)
            } finally {
                conn.disconnect()
            }
        }

    suspend fun upload(totalBytes: Int = 8_000_000, onProgress: (Progress) -> Unit): Progress.Done =
        withContext(Dispatchers.IO) {
            val url = URL("https://${AppInfo.SPEED_TEST_HOST}/__up")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 8_000; readTimeout = 20_000; doOutput = true; requestMethod = "POST"
                setFixedLengthStreamingMode(totalBytes)
                setRequestProperty("Content-Type", "application/octet-stream")
            }
            try {
                val chunk = ByteArray(64 * 1024)
                var sent = 0L
                val start = SystemClock.elapsedRealtime()
                conn.outputStream.use { out ->
                    while (sent < totalBytes) {
                        coroutineContext.ensureActive()
                        val n = minOf(chunk.size.toLong(), totalBytes - sent).toInt()
                        out.write(chunk, 0, n)
                        sent += n
                        val elapsed = (SystemClock.elapsedRealtime() - start).coerceAtLeast(1)
                        onProgress(Progress.Running("Upload", sent.toFloat() / totalBytes, sent * 8_000.0 / elapsed))
                    }
                    out.flush()
                }
                conn.responseCode // wait for the server to accept the body
                val elapsed = (SystemClock.elapsedRealtime() - start).coerceAtLeast(1)
                Progress.Done(sent * 8_000.0 / elapsed, sent, elapsed)
            } finally {
                conn.disconnect()
            }
        }

    /** Public IP and Cloudflare edge location, only when the user taps "Show public IP". */
    suspend fun publicIpInfo(): Map<String, String> = withContext(Dispatchers.IO) {
        val conn = (URL("https://${AppInfo.SPEED_TEST_HOST}/cdn-cgi/trace").openConnection() as HttpURLConnection).apply {
            connectTimeout = 6_000; readTimeout = 6_000
        }
        try {
            conn.inputStream.bufferedReader().readLines()
                .mapNotNull { line -> line.split("=", limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }
                .toMap()
                .filterKeys { it in setOf("ip", "loc", "colo", "http", "tls") }
        } finally {
            conn.disconnect()
        }
    }
}

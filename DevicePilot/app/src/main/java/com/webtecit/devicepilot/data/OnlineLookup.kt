package com.webtecit.devicepilot.data

import android.content.Context
import android.os.Build
import com.webtecit.devicepilot.firewall.FirewallPhase
import com.webtecit.devicepilot.firewall.FirewallState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

sealed interface OnlineName {
    data class Found(val brand: String, val marketingName: String) : OnlineName
    data object NotListed : OnlineName
    data object FirewallOn : OnlineName
    data class Failed(val reason: String?) : OnlineName
}

/**
 * Optional internet lookup, only when the user taps it. Downloads Google Play's public
 * "supported devices" list (official model code → marketing name) and keeps only the
 * matching row in the app's private storage. No device data is uploaded.
 */
class OnlineLookup(private val context: Context) {
    private val prefs = context.getSharedPreferences("online_cache", Context.MODE_PRIVATE)
    private val key = "${Build.MODEL}|${Build.DEVICE}"

    fun cached(): OnlineName.Found? {
        val v = prefs.getString(key, null) ?: return null
        val parts = v.split('\u0001')
        return if (parts.size == 2) OnlineName.Found(parts[0], parts[1]) else null
    }

    suspend fun officialName(): OnlineName = withContext(Dispatchers.IO) {
        cached()?.let { return@withContext it }
        // DevicePilot keeps itself inside its own firewall tunnel, so it is offline while it runs.
        if (FirewallState.status.value.phase == FirewallPhase.ACTIVE) return@withContext OnlineName.FirewallOn
        try {
            val conn = URL(CATALOG_URL).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("User-Agent", "DevicePilot")
            var byModel: OnlineName.Found? = null
            conn.inputStream.bufferedReader(Charsets.UTF_16).useLines { lines ->
                for (line in lines) {
                    val cols = parseCsv(line)
                    if (cols.size < 4) continue
                    val (brand, name, device, model) = cols
                    if (!model.equals(Build.MODEL, ignoreCase = true)) continue
                    val found = OnlineName.Found(brand.trim(), name.trim().ifBlank { model })
                    if (device.equals(Build.DEVICE, ignoreCase = true)) {
                        byModel = found
                        break
                    }
                    if (byModel == null) byModel = found
                }
            }
            conn.disconnect()
            val result = byModel
            if (result != null) {
                prefs.edit().putString(key, result.brand + '\u0001' + result.marketingName).apply()
                result
            } else OnlineName.NotListed
        } catch (t: Throwable) {
            OnlineName.Failed(t.message)
        }
    }

    fun specsUrl(name: String): String =
        "https://www.gsmarena.com/res.php3?sSearch=" + URLEncoder.encode(name, "UTF-8")

    companion object {
        const val CATALOG_URL = "https://storage.googleapis.com/play_public/supported_devices.csv"

        /** Minimal CSV splitter that handles quoted fields with commas. */
        fun parseCsv(line: String): List<String> {
            val out = ArrayList<String>(4)
            val sb = StringBuilder()
            var quoted = false
            var i = 0
            while (i < line.length) {
                val ch = line[i]
                when {
                    ch == '"' && quoted && i + 1 < line.length && line[i + 1] == '"' -> { sb.append('"'); i++ }
                    ch == '"' -> quoted = !quoted
                    ch == ',' && !quoted -> { out += sb.toString(); sb.clear() }
                    else -> sb.append(ch)
                }
                i++
            }
            out += sb.toString()
            return out
        }
    }
}

package app.nirapod.family.tracking

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Result of one upload attempt. */
sealed class UploadResult {
    data class Ok(val updateRequestedBy: String?) : UploadResult()
    /** The device key was rejected (child removed from the family): stop for good. */
    object Revoked : UploadResult()
    /** Offline, timeout or server error: keep the queue and retry later. */
    object RetryLater : UploadResult()
}

/** POST /locations with `Authorization: Device <key>` (never logs coordinates). */
object Uploader {
    fun post(store: TrackingStore, points: JSONArray, deviceState: JSONObject?): UploadResult {
        if (store.apiBase.isEmpty() || store.uploadKey.isEmpty()) return UploadResult.Revoked
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(store.apiBase.trimEnd('/') + "/locations").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 20_000
                doOutput = true
                setRequestProperty("content-type", "application/json")
                setRequestProperty("accept", "application/json")
                setRequestProperty("authorization", "Device " + store.uploadKey)
                setRequestProperty("x-device-id", store.deviceId)
            }
            val body = JSONObject().put("points", points)
            if (deviceState != null) body.put("device_state", deviceState)
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            when {
                code == 202 || code == 200 -> {
                    val text = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(text)
                    val req = json.optJSONObject("update_requested")
                    UploadResult.Ok(req?.optString("by_name", ""))
                }
                code == 401 || code == 403 -> UploadResult.Revoked
                else -> UploadResult.RetryLater
            }
        } catch (e: Exception) {
            UploadResult.RetryLater
        } finally {
            conn?.disconnect()
        }
    }
}

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

/** POST /locations and /sos with `Authorization: Device <key>` (never logs coordinates). */
object Uploader {
    /** Shake-to-SOS from the background. Returns true when the server accepted it (201 new / 200 already open). */
    fun postSos(store: TrackingStore, lat: Double?, lng: Double?, accuracy: Float?): Boolean {
        if (store.apiBase.isEmpty() || store.uploadKey.isEmpty()) return false
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(store.apiBase.trimEnd('/') + "/sos").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 20_000
                doOutput = true
                setRequestProperty("content-type", "application/json")
                setRequestProperty("authorization", "Device " + store.uploadKey)
                setRequestProperty("x-device-id", store.deviceId)
            }
            val body = JSONObject().put("trigger", "shake")
            if (lat != null && lng != null) {
                body.put("lat", lat).put("lng", lng)
                if (accuracy != null) body.put("accuracy_m", accuracy.toDouble())
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            conn.responseCode == 201 || conn.responseCode == 200
        } catch (e: Exception) {
            false
        } finally {
            conn?.disconnect()
        }
    }

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

package com.oryzenx.app.data

import com.oryzenx.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, val code: String, override val message: String, val fields: Map<String, String> = emptyMap()) : Exception(message)

/**
 * JSON API client for the OryzenX backend (same endpoints as the web apps).
 * Authenticates with a bearer token (no cookies), so CSRF does not apply.
 * Money values arrive as decimal strings and are formatted with BigDecimal, never Float/Double maths.
 */
class Api(private val session: SessionStore) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .build()
    private val base = BuildConfig.API_BASE_URL.trimEnd('/')

    /** Emits when the server rejects the session (401) so the UI can return to sign-in. */
    private val _unauthorized = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorized = _unauthorized.asSharedFlow()

    suspend fun get(path: String, query: Map<String, Any?> = emptyMap()): JsonObject = call("GET", path + qs(query), null)
    suspend fun post(path: String, body: JsonObject = JsonObject(emptyMap())): JsonObject = call("POST", path, body.toString().toRequestBody(JSON))
    suspend fun put(path: String, body: JsonObject): JsonObject = call("PUT", path, body.toString().toRequestBody(JSON))
    suspend fun delete(path: String): JsonObject = call("DELETE", path, null)
    suspend fun upload(path: String, parts: MultipartBody): JsonObject = call("POST", path, parts)

    private fun qs(q: Map<String, Any?>): String {
        val p = q.filterValues { it != null && it.toString().isNotEmpty() }
            .map { (k, v) -> java.net.URLEncoder.encode(k, "UTF-8") + "=" + java.net.URLEncoder.encode(v.toString(), "UTF-8") }
        return if (p.isEmpty()) "" else "?" + p.joinToString("&")
    }

    private suspend fun call(method: String, path: String, body: RequestBody?): JsonObject = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base + path)
            .header("Accept", "application/json")
            .header("Accept-Language", I18n.locale)
            .header("User-Agent", "OryzenX-Android/${BuildConfig.VERSION_NAME}")
            .apply { session.token?.let { header("Authorization", "Bearer $it") } }
            .method(method, body ?: if (method == "POST" || method == "PUT") ByteArray(0).toRequestBody(JSON) else null)
            .build()
        val res = try {
            http.newCall(req).execute()
        } catch (e: IOException) {
            throw ApiException(0, "network", t("err_network"))
        }
        res.use { r ->
            val text = r.body?.string().orEmpty()
            val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
                ?: throw ApiException(r.code, "bad_response", if (r.code >= 500) t("err_server") else t("err_generic"))
            if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) {
                val err = obj["error"]?.jsonObject
                val fields = err?.get("fields")?.let { f ->
                    runCatching { f.jsonObject.mapValues { it.value.jsonPrimitive.contentOrNull ?: "" } }.getOrDefault(emptyMap())
                } ?: emptyMap()
                if (r.code == 401 && session.token != null) {
                    session.clear()
                    _unauthorized.tryEmit(Unit)
                }
                throw ApiException(r.code, err.str("code") ?: "error", err.str("message") ?: t("err_generic"), fields)
            }
            obj
        }
    }

    companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
        fun body(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
            for ((k, v) in pairs) when (v) {
                null -> {}
                is Boolean -> put(k, v)
                is Number -> put(k, v.toString()) // numbers are sent as strings to keep exact decimals
                is JsonElement -> put(k, v)
                else -> put(k, v.toString())
            }
        }
    }
}

// ---- small JSON helpers -----------------------------------------------------------------------
fun JsonObject?.str(key: String): String? = (this?.get(key) as? JsonPrimitive)?.contentOrNull
fun JsonObject?.obj(key: String): JsonObject? = this?.get(key)?.takeIf { it !is JsonNull }?.let { runCatching { it.jsonObject }.getOrNull() }
fun JsonObject?.arr(key: String): List<JsonObject> = this?.get(key)?.takeIf { it !is JsonNull }?.let { runCatching { it.jsonArray.map { e -> e.jsonObject } }.getOrNull() } ?: emptyList()
fun JsonObject?.bool(key: String): Boolean = (this?.get(key) as? JsonPrimitive)?.let { it.booleanOrNull ?: (it.contentOrNull == "1") } ?: false
fun JsonObject?.int(key: String): Int = this.str(key)?.toBigDecimalOrNull()?.toInt() ?: 0
fun JsonObject.data(): JsonObject? = obj("data")
fun JsonObject.dataList(): List<JsonObject> = (this["data"] as? JsonArray)?.map { it.jsonObject } ?: emptyList()
fun JsonObject.meta(): JsonObject? = obj("meta")

package com.ahoshan.joma.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** An error from the server, carrying its Bengali message for the person. */
class ApiException(val status: Int, val code: String, message: String) : Exception(message)

/**
 * Talks to the same JSON API the website uses. "X-Client: android" makes the
 * server hand back a bearer token instead of setting a browser cookie.
 */
class ApiClient(private val baseUrl: String, private val token: () -> String?) {

    suspend fun get(path: String): JSONObject = request("GET", path, null)

    suspend fun post(path: String, body: JSONObject = JSONObject()): JSONObject = request("POST", path, body)

    suspend fun delete(path: String): JSONObject = request("DELETE", path, null)

    private suspend fun request(method: String, path: String, body: JSONObject?): JSONObject =
        withContext(Dispatchers.IO) {
            if (baseUrl.isBlank() || baseUrl.contains("example.com")) {
                throw ApiException(0, "not_configured", "অ্যাপে ওয়েবসাইটের ঠিকানা সেট করা হয়নি (wallet.properties)।")
            }
            val connection = (URL("$baseUrl/api/$path").openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15_000
                readTimeout = 20_000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("X-Client", "android")
                token()?.let { setRequestProperty("Authorization", "Bearer $it") }
            }
            try {
                if (body != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                val json = if (text.isBlank()) JSONObject() else JSONObject(text)
                if (status !in 200..299) {
                    val error = json.optJSONObject("error")
                    throw ApiException(
                        status,
                        error?.optString("code").orEmpty().ifEmpty { "error" },
                        error?.optString("message").orEmpty().ifEmpty { "সার্ভারে সমস্যা হয়েছে। একটু পরে চেষ্টা করুন।" },
                    )
                }
                json
            } catch (e: IOException) {
                throw ApiException(0, "network", "ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না।")
            } catch (e: JSONException) {
                throw ApiException(0, "bad_response", "সার্ভারের উত্তর বোঝা যায়নি।")
            } finally {
                connection.disconnect()
            }
        }
}

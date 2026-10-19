package com.webtecit.nayon.data.browser

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

/** The Google account signed in on the web, as Chrome's account button shows it. */
data class GoogleAccount(val name: String, val email: String, val photo: Bitmap?)

/**
 * Reads which Google account is signed in, from Google's own account list (the endpoint Chrome
 * uses for the same purpose). Only Google's sign-in cookies are sent, only to accounts.google.com,
 * and nothing is stored on disk.
 */
object GoogleAccounts {
    private const val LIST_URL = "https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard"

    suspend fun fetch(cookies: String): GoogleAccount? = withContext(Dispatchers.IO) {
        runCatching {
            val conn = (URL(LIST_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("Cookie", cookies)
                setRequestProperty("Origin", "https://www.google.com")
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            }
            try {
                conn.outputStream.use { it.write(ByteArray(0)) }
                if (conn.responseCode != 200) return@runCatching null
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                parse(body)?.let { (name, email, photoUrl) ->
                    GoogleAccount(name, email, photoUrl?.let(::downloadPhoto))
                }
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
    }

    /** Parses `["gaia.l.a.r",[["gaia.l.a",1,"Name","email",photoUrl,...],...]]`; returns the first signed-in account. */
    internal fun parse(body: String): Triple<String, String, String?>? {
        val accounts = JSONArray(body.trim()).optJSONArray(1) ?: return null
        val list = (0 until accounts.length()).mapNotNull { accounts.optJSONArray(it) }
            .filter { it.optString(3).contains('@') }
        // Index 14 marks accounts that are listed but signed out.
        val account = list.firstOrNull { it.optInt(14, 0) != 1 } ?: list.firstOrNull() ?: return null
        val email = account.optString(3)
        val name = account.optString(2).ifBlank { email.substringBefore('@') }
        val photo = account.optString(4).takeIf { it.startsWith("https://") }
        return Triple(name, email, photo)
    }

    private fun downloadPhoto(url: String): Bitmap? = runCatching {
        // Google photo URLs take a size suffix; ask for a sharp 128px square.
        val sized = if (url.contains("googleusercontent.com") && !url.contains('=')) "$url=s128-c" else url
        val conn = (URL(sized).openConnection() as HttpURLConnection).apply { connectTimeout = 8_000; readTimeout = 8_000 }
        try {
            if (conn.responseCode != 200) null else conn.inputStream.use { BitmapFactory.decodeStream(it) }
        } finally {
            conn.disconnect()
        }
    }.getOrNull()
}

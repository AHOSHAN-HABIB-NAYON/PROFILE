package com.webtecit.nayon.core.browser

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Fetches type-ahead suggestions from the selected engine's public suggestion endpoint. */
object SearchSuggestions {

    suspend fun fetch(engine: SearchEngine, query: String): List<String> {
        val template = engine.suggestUrl ?: return emptyList()
        return withContext(Dispatchers.IO) {
            runCatching {
                val url = URL(template.replace("%s", URLEncoder.encode(query, "UTF-8")))
                val c = url.openConnection() as HttpURLConnection
                c.connectTimeout = 2_500
                c.readTimeout = 2_500
                try {
                    if (c.responseCode != 200) return@runCatching emptyList<String>()
                    val body = c.inputStream.bufferedReader().use { it.readText() }
                    parse(body)
                } finally {
                    c.disconnect()
                }
            }.getOrDefault(emptyList())
        }
    }

    /** Parses the OpenSearch format: ["query", ["one", "two", ...], ...]. */
    fun parse(body: String): List<String> = runCatching {
        val list = JSONArray(body).getJSONArray(1)
        (0 until list.length()).map { list.getString(it) }.filter { it.isNotBlank() }.distinct().take(6)
    }.getOrDefault(emptyList())
}

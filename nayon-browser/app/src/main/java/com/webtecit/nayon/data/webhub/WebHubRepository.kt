package com.webtecit.nayon.data.webhub

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/** A website saved in WebHub. [category] is optional ("" = none). */
data class WebSite(val id: Long, val name: String, val url: String, val category: String = "", val addedAt: Long = 0, val pinned: Boolean = false)

enum class WebHubView { LIST, GRID }

/** Starter set shown until the user changes WebHub for the first time. */
val DefaultWebSites = listOf(
    WebSite(1, "Google", "https://www.google.com", "Search"),
    WebSite(2, "YouTube", "https://m.youtube.com", "Video"),
    WebSite(3, "Facebook", "https://m.facebook.com", "Social"),
    WebSite(4, "Gmail", "https://mail.google.com", "Work"),
    WebSite(5, "GitHub", "https://github.com", "Work"),
    WebSite(6, "WebTecIT", "https://webtecit.com", "Work"),
    WebSite(7, "Wikipedia", "https://www.wikipedia.org", "Learn"),
)

/** WebHub sites and the chosen view, kept on the device in the app's settings store. */
class WebHubRepository(private val dataStore: DataStore<Preferences>) {
    private val sitesKey = stringPreferencesKey("webhub_sites_json")
    private val viewKey = stringPreferencesKey("webhub_view")

    private val data = dataStore.data.catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }

    /** Pinned sites first, each group in the user's order. */
    val sites: Flow<List<WebSite>> = data.map { p -> (p[sitesKey]?.let(::decode) ?: DefaultWebSites).sortedByDescending { it.pinned } }
        .distinctUntilChanged()

    /** List is the default. */
    val view: Flow<WebHubView> = data.map { p ->
        p[viewKey]?.let { runCatching { WebHubView.valueOf(it) }.getOrNull() } ?: WebHubView.LIST
    }.distinctUntilChanged()

    suspend fun setView(view: WebHubView) = dataStore.edit { it[viewKey] = view.name }

    /** Adds a site, or renames / re-files it when the same address is already saved. */
    suspend fun add(name: String, url: String, category: String) = update { list ->
        val existing = list.firstOrNull { sameSite(it.url, url) }
        if (existing != null) list.map { if (it.id == existing.id) it.copy(name = name, category = category) else it }
        else list + WebSite((list.maxOfOrNull { it.id } ?: 0) + 1, name, url, category, System.currentTimeMillis())
    }

    suspend fun edit(site: WebSite) = update { list -> list.map { if (it.id == site.id) site else it } }

    suspend fun remove(id: Long) = update { list -> list.filterNot { it.id == id } }

    /** Pins a site to the top, or unpins it. */
    suspend fun setPinned(id: Long, pinned: Boolean) = update { list -> list.map { if (it.id == id) it.copy(pinned = pinned) else it } }

    private suspend fun update(change: (List<WebSite>) -> List<WebSite>) = dataStore.edit { p ->
        val current = p[sitesKey]?.let(::decode) ?: DefaultWebSites
        p[sitesKey] = encode(change(current))
    }

    companion object {
        fun encode(list: List<WebSite>): String = JSONArray().apply {
            list.forEach { s ->
                put(JSONObject().put("id", s.id).put("name", s.name).put("url", s.url).put("category", s.category).put("addedAt", s.addedAt).put("pinned", s.pinned))
            }
        }.toString()

        fun decode(json: String): List<WebSite>? = runCatching {
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                WebSite(o.getLong("id"), o.getString("name"), o.getString("url"), o.optString("category"), o.optLong("addedAt"), o.optBoolean("pinned"))
            }
        }.getOrNull()

        /** Same site when the host matches, ignoring "www." / "m." and a trailing slash. */
        fun sameSite(a: String, b: String): Boolean = key(a) == key(b)

        /** A friendly name from the address: "https://www.bbc.co.uk/news" → "Bbc". */
        fun nameFor(url: String): String {
            val host = url.trim().lowercase().substringAfter("://").substringBefore('/').substringBefore(':')
                .removePrefix("www.").removePrefix("m.").removePrefix("mobile.")
            val parts = host.split('.').filter { it.isNotBlank() }
            val main = when {
                parts.size >= 3 && parts[parts.size - 2].length <= 3 -> parts[parts.size - 3]   // bbc.co.uk
                parts.size >= 2 -> parts[parts.size - 2]
                else -> parts.firstOrNull().orEmpty()
            }
            return main.replaceFirstChar { it.uppercase() }
        }

        /** Guesses a category from well-known sites and words in the address ("" when unsure). */
        fun suggestCategory(url: String): String {
            val host = url.trim().lowercase().substringAfter("://").substringBefore('/')
            KNOWN.forEach { (cat, sites) -> if (sites.any { host == it || host.endsWith(".$it") }) return cat }
            WORDS.forEach { (cat, words) -> if (words.any { it in host }) return cat }
            return ""
        }

        private val KNOWN = listOf(
            "Social" to listOf("facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "linkedin.com", "reddit.com", "pinterest.com",
                "threads.net", "snapchat.com", "whatsapp.com", "telegram.org", "messenger.com", "discord.com", "quora.com"),
            "Video" to listOf("youtube.com", "youtu.be", "netflix.com", "vimeo.com", "twitch.tv", "dailymotion.com", "primevideo.com",
                "hoichoi.tv", "chorki.com", "bioscopelive.com", "toffeelive.com", "hotstar.com"),
            "Work" to listOf("mail.google.com", "gmail.com", "outlook.com", "office.com", "github.com", "gitlab.com", "notion.so", "slack.com",
                "trello.com", "docs.google.com", "drive.google.com", "zoom.us", "figma.com", "canva.com", "webtecit.com", "upwork.com", "fiverr.com"),
            "Learn" to listOf("wikipedia.org", "khanacademy.org", "coursera.org", "udemy.com", "w3schools.com", "stackoverflow.com",
                "duolingo.com", "10minuteschool.com", "medium.com", "chatgpt.com", "claude.ai", "gemini.google.com"),
            "Shopping" to listOf("amazon.com", "daraz.com.bd", "aliexpress.com", "ebay.com", "alibaba.com", "chaldal.com", "rokomari.com",
                "othoba.com", "pickaboo.com", "shajgoj.com", "walmart.com", "etsy.com", "flipkart.com"),
            "Finance" to listOf("paypal.com", "bkash.com", "nagad.com.bd", "binance.com", "tradingview.com", "investing.com", "coinmarketcap.com",
                "stripe.com", "payoneer.com", "wise.com", "bloomberg.com", "oryzenx.com", "coinbase.com", "rocket.com.bd"),
            "News" to listOf("bbc.com", "bbc.co.uk", "cnn.com", "prothomalo.com", "thedailystar.net", "bdnews24.com", "aljazeera.com",
                "jugantor.com", "kalerkantho.com", "nytimes.com", "theguardian.com", "reuters.com", "somoynews.tv", "jamuna.tv"),
            "Search" to listOf("google.com", "bing.com", "duckduckgo.com", "yahoo.com"),
        )

        private val WORDS = listOf(
            "Finance" to listOf("bank", "pay", "trade", "trading", "coin", "crypto", "forex", "invest", "stock", "finance", "wallet", "fx", "money", "signal"),
            "Shopping" to listOf("shop", "store", "mart", "bazar", "buy", "deal"),
            "News" to listOf("news", "times", "daily", "post", "tribune", "khobor", "barta"),
            "Video" to listOf("tv", "video", "movie", "stream", "film"),
            "Learn" to listOf("learn", "academy", "school", "edu", "course", "tutorial", "wiki"),
            "Social" to listOf("social", "chat", "forum", "community"),
        )

        private fun key(url: String) = url.trim().lowercase().substringAfter("://").removePrefix("www.").removePrefix("m.").trimEnd('/')
    }
}

package com.webtecit.nayon.core.browser

import java.net.URI
import java.net.URLEncoder

/** Turns what the user typed into a URL to load: either a web address or a search. */
object UrlResolver {

    private val allowedSchemes = setOf("http", "https")
    private val hostLike = Regex("""^[A-Za-z0-9\-._~%]+(\.[A-Za-z0-9\-]{2,63})(:\d{1,5})?([/?#].*)?$""")
    private val ipv4Like = Regex("""^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?([/?#].*)?$""")
    private val localhostLike = Regex("""^localhost(:\d{1,5})?([/?#].*)?$""", RegexOption.IGNORE_CASE)

    /**
     * @param input text from the address bar
     * @param searchTemplate search URL containing `%s`
     * @return the URL to load, or null for blank input
     */
    fun resolve(input: String, searchTemplate: String): String? {
        val text = input.trim()
        if (text.isEmpty()) return null

        val scheme = text.substringBefore("://", missingDelimiterValue = "").lowercase()
        if (scheme.isNotEmpty()) {
            // Only web schemes are loaded directly. Anything else (javascript:, file:, content:, …) is searched.
            return if (scheme in allowedSchemes && isValidUri(text)) text else search(text, searchTemplate)
        }
        if (text.contains(' ')) return search(text, searchTemplate)
        if (hostLike.matches(text) || ipv4Like.matches(text) || localhostLike.matches(text)) {
            val candidate = "https://$text"
            if (isValidUri(candidate)) return candidate
        }
        return search(text, searchTemplate)
    }

    fun search(query: String, searchTemplate: String): String =
        searchTemplate.replace(SearchTemplates.PLACEHOLDER, URLEncoder.encode(query.trim(), "UTF-8"))

    /** Whether a URL is one the browser loads itself (http/https). */
    fun isWebUrl(url: String?): Boolean {
        val s = url?.substringBefore(':')?.lowercase() ?: return false
        return s in allowedSchemes
    }

    /** Short host for display, without "www." (e.g. "webtecit.com"). */
    fun displayHost(url: String?): String {
        if (url.isNullOrBlank()) return ""
        val host = runCatching { URI(url).host }.getOrNull() ?: return url
        return host.removePrefix("www.")
    }

    private fun isValidUri(s: String) = runCatching { URI(s).host != null }.getOrDefault(false)
}

package com.webtecit.nayon.core.browser

import java.net.URI

/**
 * Built-in search engines, using each provider's public search URL.
 * `%s` is replaced with the URL-encoded query. No search API or suggestion endpoint is called.
 */
enum class SearchEngine(val displayName: String, val template: String, val homeUrl: String) {
    GOOGLE("Google", "https://www.google.com/search?q=%s", "https://www.google.com"),
    BING("Bing", "https://www.bing.com/search?q=%s", "https://www.bing.com"),
    DUCKDUCKGO("DuckDuckGo", "https://duckduckgo.com/?q=%s", "https://duckduckgo.com"),
    BRAVE("Brave Search", "https://search.brave.com/search?q=%s", "https://search.brave.com"),
    ECOSIA("Ecosia", "https://www.ecosia.org/search?q=%s", "https://www.ecosia.org"),
    YAHOO("Yahoo", "https://search.yahoo.com/search?p=%s", "https://search.yahoo.com"),
    CUSTOM("Custom", "", ""),
}

object SearchTemplates {
    const val PLACEHOLDER = "%s"

    /** Result of validating a user-supplied custom search URL. */
    enum class Validation { OK, EMPTY, NOT_HTTPS, MISSING_PLACEHOLDER, INVALID_URL }

    fun validate(template: String): Validation {
        val t = template.trim()
        if (t.isEmpty()) return Validation.EMPTY
        if (!t.startsWith("https://", ignoreCase = true)) return Validation.NOT_HTTPS
        if (!t.contains(PLACEHOLDER)) return Validation.MISSING_PLACEHOLDER
        val probe = t.replace(PLACEHOLDER, "test")
        val host = runCatching { URI(probe).host }.getOrNull()
        if (host.isNullOrBlank() || !host.contains('.')) return Validation.INVALID_URL
        return Validation.OK
    }
}

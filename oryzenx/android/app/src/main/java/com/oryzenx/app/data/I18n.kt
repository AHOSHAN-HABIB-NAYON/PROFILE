package com.oryzenx.app.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Shared translations: the same keys and texts as the web apps (bundled from resources/lang via
 * bin/export-strings.php and refreshed from /api/i18n/{locale} so admin overrides apply).
 */
object I18n {
    private var strings: Map<String, String> = emptyMap()
    private var fallback: Map<String, String> = emptyMap()
    /** Changing this triggers recomposition of every screen that reads text. */
    var locale by mutableStateOf("en")
        private set

    fun init(context: Context, initial: String) {
        fallback = load(context, "en")
        apply(context, if (initial == "bn") "bn" else "en")
    }

    fun apply(context: Context, loc: String) {
        strings = if (loc == "en") fallback else load(context, loc)
        locale = loc
    }

    fun applyRemote(loc: String, remote: JsonObject) {
        val map = remote.mapValues { runCatching { it.value.jsonPrimitive.content }.getOrDefault("") }.filterValues { it.isNotEmpty() }
        strings = (if (loc == "en") fallback else strings) + map
        if (loc == "en") fallback = fallback + map
        locale = loc
    }

    private fun load(context: Context, loc: String): Map<String, String> = runCatching {
        val text = context.assets.open("i18n/$loc.json").bufferedReader().use { it.readText() }
        Json.parseToJsonElement(text).let { it as JsonObject }.mapValues { it.value.jsonPrimitive.content }
    }.getOrDefault(emptyMap())

    fun t(key: String, vararg args: Pair<String, Any?>): String {
        var s = strings[key] ?: fallback[key] ?: key
        for ((k, v) in args) s = s.replace(":$k", v?.toString() ?: "")
        return s
    }

    fun has(key: String): Boolean = strings.containsKey(key) || fallback.containsKey(key)
}

/** Shorthand used by all screens. Reading I18n.locale makes callers recompose on language change. */
fun t(key: String, vararg args: Pair<String, Any?>): String {
    @Suppress("UNUSED_VARIABLE") val l = I18n.locale
    return I18n.t(key, *args)
}

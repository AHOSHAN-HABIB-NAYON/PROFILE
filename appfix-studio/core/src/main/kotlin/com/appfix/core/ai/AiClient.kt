package com.appfix.core.ai

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

/**
 * Where AI requests go. No key is ever built into the app:
 *  - [PROXY]: your own backend holds the provider key; the app sends an optional per-user token.
 *  - [ANTHROPIC] / [OPENAI_COMPATIBLE]: the user enters their own key, which the app stores encrypted on the device.
 */
@Serializable
enum class AiProviderKind(val label: String, val defaultBaseUrl: String) {
    PROXY("Own backend proxy", ""),
    ANTHROPIC("Anthropic API (own key)", "https://api.anthropic.com"),
    OPENAI_COMPATIBLE("OpenAI-compatible API (own key)", "https://api.openai.com/v1"),
}

@Serializable
data class AiConfig(
    val kind: AiProviderKind = AiProviderKind.PROXY,
    val baseUrl: String = "",
    val model: String = "",
    val maxTokens: Int = 4096,
) {
    /** Returns a reason the configuration cannot be used, or null. */
    fun problem(hasKey: Boolean): String? {
        val url = baseUrl.ifBlank { kind.defaultBaseUrl }.trim()
        if (url.isEmpty()) return "Enter the URL of your AI proxy"
        val uri = runCatching { URI(url) }.getOrNull() ?: return "The URL is not valid"
        val local = uri.host in setOf("localhost", "127.0.0.1", "10.0.2.2")
        if (uri.scheme != "https" && !(uri.scheme == "http" && local)) return "The URL must use HTTPS"
        if (kind != AiProviderKind.PROXY && model.isBlank()) return "Enter a model name"
        if (kind != AiProviderKind.PROXY && !hasKey) return "Enter your API key"
        if (maxTokens !in 256..64_000) return "Max tokens must be between 256 and 64000"
        return null
    }
}

@Serializable
data class AiMessage(val role: String, val content: String) // role: "user" or "assistant"

class AiException(val status: Int, message: String) : IOException(message)

/**
 * Sends a chat request and returns the assistant's text. [secret] is the API key (direct providers) or the
 * optional proxy token. It is sent only to the configured host and never logged; error bodies are trimmed and
 * scrubbed of the secret before being shown.
 */
class AiClient(private val config: AiConfig, private val secret: String?) {
    private val json = Json { ignoreUnknownKeys = true }

    fun complete(system: String, messages: List<AiMessage>): String {
        config.problem(!secret.isNullOrBlank())?.let { throw AiException(0, it) }
        val base = config.baseUrl.ifBlank { config.kind.defaultBaseUrl }.trim().trimEnd('/')
        return when (config.kind) {
            AiProviderKind.ANTHROPIC -> {
                val body = buildJsonObject {
                    put("model", config.model.trim())
                    put("max_tokens", config.maxTokens)
                    put("system", system)
                    put("messages", messagesJson(messages))
                }
                val res = post("$base/v1/messages", body.toString(), mapOf("x-api-key" to secret!!, "anthropic-version" to "2023-06-01"))
                val content = res["content"]?.jsonArray ?: throw AiException(200, "Unexpected response from the API")
                content.mapNotNull { it.jsonObject.takeIf { o -> o["type"]?.jsonPrimitive?.contentOrNull == "text" }?.get("text")?.jsonPrimitive?.contentOrNull }.joinToString("")
            }
            AiProviderKind.OPENAI_COMPATIBLE -> {
                val body = buildJsonObject {
                    put("model", config.model.trim())
                    put("max_tokens", config.maxTokens)
                    put("messages", buildJsonArray {
                        add(buildJsonObject { put("role", "system"); put("content", system) })
                        messagesJson(messages).forEach { add(it) }
                    })
                }
                val res = post("$base/chat/completions", body.toString(), mapOf("Authorization" to "Bearer ${secret!!}"))
                res["choices"]?.jsonArray?.firstOrNull()?.jsonObject?.get("message")?.jsonObject?.get("content")?.jsonPrimitive?.contentOrNull
                    ?: throw AiException(200, "Unexpected response from the API")
            }
            AiProviderKind.PROXY -> {
                // Contract for your own backend: POST {system, messages, model?, max_tokens} → {"text": "..."}.
                val body = buildJsonObject {
                    put("system", system)
                    put("messages", messagesJson(messages))
                    if (config.model.isNotBlank()) put("model", config.model.trim())
                    put("max_tokens", config.maxTokens)
                }
                val headers = secret?.takeIf { it.isNotBlank() }?.let { mapOf("Authorization" to "Bearer $it") }.orEmpty()
                post(base, body.toString(), headers)["text"]?.jsonPrimitive?.contentOrNull ?: throw AiException(200, "The proxy response has no \"text\" field")
            }
        }
    }

    private fun messagesJson(messages: List<AiMessage>): JsonArray = buildJsonArray {
        messages.forEach { m -> add(buildJsonObject { put("role", m.role); put("content", m.content) }) }
    }

    private fun post(url: String, body: String, headers: Map<String, String>): JsonObject {
        val conn = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.instanceFollowRedirects = false // never forward the key to another host
            conn.connectTimeout = 20_000
            conn.readTimeout = 180_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("User-Agent", "AppFixStudio")
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            conn.outputStream.use { it.write(body.toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.use { it.readBytes().decodeToString() }.orEmpty()
            if (code !in 200..299) {
                val msg = runCatching { json.parseToJsonElement(text).jsonObject["error"]?.let { e -> (e as? JsonObject)?.get("message")?.jsonPrimitive?.contentOrNull ?: e.jsonPrimitive.contentOrNull } }.getOrNull()
                throw AiException(code, "AI request failed ($code): ${scrub(msg ?: text).take(300)}")
            }
            return json.parseToJsonElement(text).jsonObject
        } finally {
            conn.disconnect()
        }
    }

    private fun scrub(s: String): String = secret?.takeIf { it.length >= 6 }?.let { s.replace(it, "•••") } ?: s
}

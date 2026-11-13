package com.webtecit.filepilot.core.web

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import com.webtecit.filepilot.core.storage.FileTypes
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream

/**
 * Serves a website folder to a WebView without opening any network socket: requests to
 * https://appassets.androidplatform.net/site/... are answered from [root] inside the app.
 * Nothing is reachable from the network, other apps or other devices, and paths that try to
 * leave [root] ("../") are refused.
 */
class SitePathHandler(root: File) : WebViewAssetLoader.PathHandler {
    private val base = root.canonicalFile

    override fun handle(path: String): WebResourceResponse {
        val clean = path.substringBefore('?').substringBefore('#').let { java.net.URLDecoder.decode(it.replace("+", "%2B"), "UTF-8") }
        var file = File(base, clean).canonicalFile
        if (!SitePaths.isInside(base, file)) return status(403, "Forbidden")
        if (file.isDirectory) file = File(file, "index.html")
        if (!file.isFile) return status(404, "Not found: /$clean")
        val mime = SitePaths.mimeOf(file.name)
        val response = WebResourceResponse(mime, if (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")) "utf-8" else null, FileInputStream(file))
        // No caching, so every refresh shows the latest saved files.
        response.responseHeaders = mapOf("Cache-Control" to "no-store", "Access-Control-Allow-Origin" to "*")
        return response
    }

    private fun status(code: Int, message: String) =
        WebResourceResponse("text/plain", "utf-8", code, message, mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(message.toByteArray()))
}

object SitePaths {
    const val HOST = "appassets.androidplatform.net"
    const val SITE_PREFIX = "/site/"
    const val ASSETS_PREFIX = "/assets/"

    fun url(entry: String): String = "https://$HOST$SITE_PREFIX" + entry.trimStart('/').split('/').joinToString("/") { Uri_encode(it) }

    private fun Uri_encode(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    fun isInside(base: File, file: File): Boolean {
        val b = base.canonicalPath
        val f = file.canonicalPath
        return f == b || f.startsWith(b + File.separator)
    }

    fun mimeOf(name: String): String = when (FileTypes.extensionOf(name)) {
        "html", "htm" -> "text/html"
        "js", "mjs", "cjs" -> "text/javascript"
        "css" -> "text/css"
        "json", "map" -> "application/json"
        "wasm" -> "application/wasm"
        "svg" -> "image/svg+xml"
        "txt" -> "text/plain"
        "xml" -> "application/xml"
        "webmanifest" -> "application/manifest+json"
        else -> FileTypes.mimeOf(name)
    }

    fun loader(context: Context, root: File): WebViewAssetLoader = WebViewAssetLoader.Builder()
        .setDomain(HOST)
        .addPathHandler(SITE_PREFIX, SitePathHandler(root))
        .addPathHandler(ASSETS_PREFIX, WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    fun editorLoader(context: Context): WebViewAssetLoader = WebViewAssetLoader.Builder()
        .setDomain(HOST)
        .addPathHandler(ASSETS_PREFIX, WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    const val EDITOR_URL = "https://$HOST/assets/editor/index.html"
}

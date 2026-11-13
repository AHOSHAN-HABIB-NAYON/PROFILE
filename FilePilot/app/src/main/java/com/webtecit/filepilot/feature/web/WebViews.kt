package com.webtecit.filepilot.feature.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.webtecit.filepilot.core.web.SitePaths
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/** Settings shared by every WebView in the app: no local file or content access, no mixed content. */
@SuppressLint("SetJavaScriptEnabled")
fun WebView.applySafeSettings() {
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    @Suppress("DEPRECATION")
    settings.databaseEnabled = true
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
    settings.setSupportMultipleWindows(false)
    settings.javaScriptCanOpenWindowsAutomatically = false
}

/** Hosts the bundled CodeMirror editor and exposes a small Kotlin API over it. */
class CodeEditorController(context: Context, onReady: () -> Unit, onChanged: (String, Boolean) -> Unit, onCursor: (Int, Int) -> Unit) {
    val webView: WebView = WebView(context)
    private val main = Handler(Looper.getMainLooper())
    var ready = false
        private set
    val loaded = HashSet<String>()

    init {
        val loader = SitePaths.editorLoader(context)
        webView.applySafeSettings()
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER
        // The bridge only reports edits and the cursor position; this page loads bundled files only.
        webView.addJavascriptInterface(object {
            @JavascriptInterface fun onChanged(id: String, dirty: Boolean) { main.post { onChanged(id, dirty) } }
            @JavascriptInterface fun onCursor(line: Int, col: Int) { main.post { onCursor(line, col) } }
        }, "FilePilot")
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
            override fun onPageFinished(view: WebView, url: String) {
                ready = true
                onReady()
            }
        }
        webView.loadUrl(SitePaths.EDITOR_URL)
    }

    fun js(code: String, callback: ((String?) -> Unit)? = null) {
        if (!ready) return
        webView.evaluateJavascript(code) { result -> callback?.invoke(result) }
    }

    fun open(id: String, text: String, modeJson: String) {
        js("openDoc(${q(id)}, ${q(text)}, $modeJson)")
        loaded += id
    }

    fun getValue(id: String, callback: (String?) -> Unit) = js("getValue(${q(id)})") { r -> callback(decode(r)) }

    fun q(s: String): String = JSONObject.quote(s)

    companion object {
        /** Decodes the JSON value returned by evaluateJavascript. */
        fun decode(result: String?): String? {
            if (result == null || result == "null") return null
            return runCatching { JSONArray("[$result]").getString(0) }.getOrNull()
        }
    }
}

data class ConsoleLine(val level: String, val message: String, val source: String)

/**
 * A WebView that runs a website folder offline. Requests are served from [root] by
 * [SitePaths.loader]; links to other sites open in the user's browser.
 */
class SitePreviewController(
    context: Context,
    root: File,
    private val onConsole: (ConsoleLine) -> Unit,
    private val onUrl: (String) -> Unit,
) {
    val webView: WebView = WebView(context)
    private val loader: WebViewAssetLoader = SitePaths.loader(context, root)

    init {
        webView.applySafeSettings()
        settings()
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == SitePaths.HOST) return false
                if (url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto" || url.scheme == "tel") {
                    runCatching {
                        view.context.startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }
                onConsole(ConsoleLine("INFO", "Opened outside the preview: $url", ""))
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) { onUrl(url) }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                onConsole(ConsoleLine("ERROR", "${errorResponse.statusCode} ${errorResponse.reasonPhrase}: ${request.url.path}", ""))
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: androidx.webkit.WebResourceErrorCompat) {
                onConsole(ConsoleLine("ERROR", "Failed to load ${request.url}", ""))
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                onConsole(ConsoleLine(m.messageLevel().name, m.message(), "${m.sourceId().substringAfterLast('/')}:${m.lineNumber()}"))
                return true
            }
        }
    }

    private fun settings() {
        webView.settings.useWideViewPort = true
        webView.settings.loadWithOverviewMode = false
        webView.settings.builtInZoomControls = true
        webView.settings.displayZoomControls = false
    }

    fun load(entry: String) = webView.loadUrl(SitePaths.url(entry))

    fun hardRefresh() {
        webView.clearCache(true)
        webView.reload()
    }

    fun destroy() {
        webView.stopLoading()
        webView.destroy()
    }
}

/** Unused parameter kept for API symmetry with WebViewClient. */
@Suppress("unused")
private fun WebResourceError.describe(): String = description.toString()

fun Uri.isSite(): Boolean = host == SitePaths.HOST

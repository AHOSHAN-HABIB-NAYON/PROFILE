package com.webtecit.nayon.feature.browser

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable

@Immutable
data class PageError(val kind: Kind, val url: String) {
    enum class Kind { OFFLINE, NOT_FOUND, TIMEOUT, NOT_SECURE, CRASHED, GENERIC }
}

/** UI state of one tab. The WebView itself lives in [BrowserViewModel]. */
@Immutable
data class TabState(
    val id: String,
    val isPrivate: Boolean,
    /** Current page URL, or null when the tab has never loaded a page. */
    val url: String? = null,
    val title: String = "",
    /** True while the new-tab page is shown (a fresh tab, or after pressing Home). */
    val showingHome: Boolean = true,
    val progress: Int = 0,
    val isLoading: Boolean = false,
    val canGoBack: Boolean = false,
    val canGoForward: Boolean = false,
    val favicon: Bitmap? = null,
    val thumbnail: Bitmap? = null,
    val desktopMode: Boolean = false,
    val certificateError: Boolean = false,
    val error: PageError? = null,
) {
    val isSecure: Boolean get() = url?.startsWith("https://", ignoreCase = true) == true && !certificateError
    val isWebPage: Boolean get() = !showingHome && url != null
    val displayTitle: String get() = title.ifBlank { url.orEmpty() }
}

class FullscreenVideo(val view: View, val callback: WebChromeClient.CustomViewCallback)

class FileChooserRequest(val callback: ValueCallback<Array<Uri>>, val intent: Intent)

sealed interface BrowserEvent {
    data class Message(@StringRes val text: Int, val arg: String? = null) : BrowserEvent
}

@Immutable
data class Suggestion(val url: String, val title: String, val isBookmark: Boolean)

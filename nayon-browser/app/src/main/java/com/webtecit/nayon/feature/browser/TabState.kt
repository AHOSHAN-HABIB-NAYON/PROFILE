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
    data class Message(@StringRes val text: Int, val arg: String? = null, val action: EventAction? = null) : BrowserEvent
}

@Immutable
data class Suggestion(val url: String, val title: String, val isBookmark: Boolean)

/** Optional button on a browser message (snackbar). */
sealed interface EventAction {
    data object ShowDownloads : EventAction
    data class OpenDownload(val id: Long) : EventAction
    data class SwitchTab(val id: String) : EventAction
}

/** What was long-pressed on a page. */
@Immutable
data class ContextTarget(
    val linkUrl: String? = null,
    val linkText: String? = null,
    val imageUrl: String? = null,
    val isPrivate: Boolean = false,
)

@Immutable
data class FindState(val query: String = "", val current: Int = 0, val total: Int = 0)

/** A website asking for camera / microphone / location / protected media. */
data class PermissionAsk(
    val origin: String,
    val kinds: List<com.webtecit.nayon.data.security.SiteKind>,
    /** False when the site is already allowed and only Android's own permission may be needed. */
    val needsPrompt: Boolean,
    val isPrivate: Boolean,
)

enum class PermissionChoice { ALLOW, ALLOW_ONCE, BLOCK }

/** "Save password?" after a sign-in. */
data class PasswordOffer(val origin: String, val username: String, val password: String, val update: Boolean)

/** Saved sign-ins offered on a sign-in page. */
data class FillOffer(val tabId: String, val origin: String, val logins: List<com.webtecit.nayon.data.security.SavedLogin>)

/** Saved cards / addresses offered on a checkout or address form. */
data class AutofillOffer(
    val tabId: String,
    val origin: String,
    val kind: com.webtecit.nayon.data.security.AutofillKind,
    val entries: List<com.webtecit.nayon.data.security.AutofillEntry>,
)

/** "Save card?" / "Save address?" after a form was sent. */
data class SaveFormOffer(val kind: com.webtecit.nayon.data.security.AutofillKind, val values: Map<String, String>)


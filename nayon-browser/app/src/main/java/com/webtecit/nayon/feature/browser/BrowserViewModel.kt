package com.webtecit.nayon.feature.browser

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.MutableContextWrapper
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.webkit.ProfileStore
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.webtecit.nayon.data.security.SaveCheck
import com.webtecit.nayon.data.security.AutofillEntry
import com.webtecit.nayon.data.security.AutofillKind
import com.webtecit.nayon.data.security.CardInfo
import com.webtecit.nayon.data.security.SecurityRepository
import com.webtecit.nayon.data.security.SitePermission
import com.webtecit.nayon.data.security.SiteKind
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.SearchEngine
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.data.browser.FaviconStore
import com.webtecit.nayon.data.browser.HistoryEntry
import com.webtecit.nayon.data.browser.BrowsingRepository
import com.webtecit.nayon.data.browser.SavedTab
import com.webtecit.nayon.data.settings.BrowserPreferences
import com.webtecit.nayon.data.settings.BrowserPreferencesRepository
import com.webtecit.nayon.data.settings.ToolbarLayout
import android.graphics.Canvas
import android.net.http.SslCertificate
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Owns all tabs and their WebViews. WebViews are created with a [MutableContextWrapper]
 * whose base context is the current Activity while one is attached, so dialogs work and
 * the Activity is never leaked.
 */
@OptIn(FlowPreview::class)
class BrowserViewModel(
    app: Application,
    private val browsing: BrowsingRepository,
    private val prefsRepository: BrowserPreferencesRepository,
    private val favicons: FaviconStore,
    private val downloads: com.webtecit.nayon.data.downloads.DownloadEngine,
    private val security: SecurityRepository,
) : AndroidViewModel(app) {

    // ---- Website permissions (camera, microphone, location, protected media) -----------------

    private val _permissionAsk = MutableStateFlow<PermissionAsk?>(null)
    /** A website is asking for a permission; the UI shows the prompt and Android's own dialog. */
    val permissionAsk: StateFlow<PermissionAsk?> = _permissionAsk.asStateFlow()
    private var pendingWebRequest: PermissionRequest? = null
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null

    private fun askPermission(tabId: String, origin: String, kinds: List<SiteKind>) {
        val private = tab(tabId)?.isPrivate == true
        viewModelScope.launch {
            val decisions = if (private) kinds.map { null } else kinds.map { security.decision(origin, it) }
            when {
                decisions.any { it == false } -> finishPermission(false)
                decisions.all { it == true } -> _permissionAsk.value = PermissionAsk(origin, kinds, needsPrompt = false, isPrivate = private)
                else -> _permissionAsk.value = PermissionAsk(origin, kinds, needsPrompt = true, isPrivate = private)
            }
        }
    }

    /** The user's answer (and whether Android itself granted the app permission). */
    fun answerPermission(choice: PermissionChoice, androidGranted: Boolean) {
        val ask = _permissionAsk.value ?: return finishPermission(false)
        if (!ask.isPrivate && choice != PermissionChoice.ALLOW_ONCE) {
            viewModelScope.launch { ask.kinds.forEach { security.setDecision(ask.origin, it, choice == PermissionChoice.ALLOW) } }
        }
        val granted = choice != PermissionChoice.BLOCK && androidGranted
        if (choice != PermissionChoice.BLOCK && !androidGranted) _events.tryEmit(BrowserEvent.Message(R.string.permission_android_denied))
        finishPermission(granted)
    }

    private fun finishPermission(granted: Boolean) {
        pendingWebRequest?.let { r -> runCatching { if (granted) r.grant(r.resources.filter { webResourceKind(it) != null }.toTypedArray()) else r.deny() } }
        pendingGeo?.let { (origin, cb) -> runCatching { cb.invoke(origin, granted, false) } }
        pendingWebRequest = null
        pendingGeo = null
        _permissionAsk.value = null
    }

    private fun webResourceKind(resource: String): SiteKind? = when (resource) {
        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> SiteKind.CAMERA
        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> SiteKind.MICROPHONE
        PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID -> SiteKind.PROTECTED_MEDIA
        else -> null
    }

    /** Saved permission decisions for one site (shown in Site information). */
    fun permissionsFor(url: String?): Flow<List<SitePermission>> {
        val origin = SecurityRepository.originOf(url) ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return security.sitePermissions.map { list -> list.filter { it.origin == origin } }
    }

    fun setSitePermission(origin: String, kind: SiteKind, allowed: Boolean?) = viewModelScope.launch { security.setDecision(origin, kind, allowed) }
    fun resetSitePermissions(origin: String) = viewModelScope.launch { security.resetSite(origin) }

    // ---- Passwords ----------------------------------------------------------------------------

    private val _passwordOffer = MutableStateFlow<PasswordOffer?>(null)
    /** "Save password?" after a sign-in. The password is held in memory only until answered. */
    val passwordOffer: StateFlow<PasswordOffer?> = _passwordOffer.asStateFlow()

    private val _fillOffer = MutableStateFlow<FillOffer?>(null)
    /** Saved sign-ins for the page in front of the user, offered on a sign-in page. */
    val fillOffer: StateFlow<FillOffer?> = _fillOffer.asStateFlow()

    /** A sign-in typed on a page, waiting until the sign-in actually goes through. */
    private data class PendingSignIn(val origin: String, val username: String, val password: String, val at: Long)

    private val pendingSignIns = mutableMapOf<String, PendingSignIn>()
    /** Username from an "email first" step, per tab, used when the password page has no username field. */
    private val stepUsernames = mutableMapOf<String, Pair<String, String>>()
    /** Pages where the user closed the fill bar; it then only comes back when a field is tapped. */
    private val fillDismissedUrls = mutableMapOf<String, String?>()

    private fun onPasswordEvent(tabId: String, origin: String, event: PasswordBridge.Event) {
        val tab = tab(tabId) ?: return
        if (tab.isPrivate || !origin.startsWith("https://")) return
        when (event.type) {
            "user" -> stepUsernames[tabId] = origin to event.username
            "submit" -> {
                val user = event.username.ifBlank { stepUsernames[tabId]?.takeIf { it.first == origin }?.second.orEmpty() }
                pendingSignIns[tabId] = PendingSignIn(origin, user, event.password, android.os.SystemClock.elapsedRealtime())
            }
            "gone" -> flushSignIn(tabId)
            "focus" -> when (event.field) {
                "card" -> offerAutofill(tabId, origin, AutofillKind.CARD)
                "address" -> offerAutofill(tabId, origin, AutofillKind.ADDRESS)
                else -> offerFillFor(tabId, origin, fromFocus = true)
            }
            "card" -> if (preferences.value.savePayments) pendingForms[tabId] = AutofillKind.CARD to event.data
            "address" -> if (preferences.value.saveAddresses && pendingForms[tabId]?.first != AutofillKind.CARD) {
                pendingForms[tabId] = AutofillKind.ADDRESS to event.data
            }
            "form" -> offerFillFor(tabId, origin, fromFocus = false)
        }
    }

    // ---- Cards and addresses (Payments / Contact info) ------------------------------------------

    private val pendingForms = mutableMapOf<String, Pair<AutofillKind, Map<String, String>>>()

    private val _autofillOffer = MutableStateFlow<AutofillOffer?>(null)
    /** Saved cards or addresses offered while filling a checkout / address form. */
    val autofillOffer: StateFlow<AutofillOffer?> = _autofillOffer.asStateFlow()

    private val _saveFormOffer = MutableStateFlow<SaveFormOffer?>(null)
    /** "Save card?" / "Save address?" after a form was sent. */
    val saveFormOffer: StateFlow<SaveFormOffer?> = _saveFormOffer.asStateFlow()

    private fun offerAutofill(tabId: String, origin: String, kind: AutofillKind) {
        if (tabId != _activeId.value) return
        val prefs = preferences.value
        if (kind == AutofillKind.CARD && !prefs.savePayments || kind == AutofillKind.ADDRESS && !prefs.saveAddresses) return
        if (_autofillOffer.value?.let { it.tabId == tabId && it.kind == kind } == true) return
        viewModelScope.launch {
            val entries = security.entriesOf(kind)
            if (entries.isNotEmpty() && tabId == _activeId.value) _autofillOffer.value = AutofillOffer(tabId, origin, kind, entries)
        }
    }

    /** Fills the chosen card / address. For cards the UI confirms the screen lock first (if enabled). */
    fun fillAutofill(entryId: Long) {
        val offer = _autofillOffer.value ?: return
        _autofillOffer.value = null
        val wv = webViews[offer.tabId] ?: return
        if (SecurityRepository.originOf(wv.url) != offer.origin) return
        viewModelScope.launch {
            val e = security.entry(entryId) ?: return@launch
            if (SecurityRepository.originOf(wv.url) != offer.origin) return@launch
            wv.evaluateJavascript(PasswordBridge.fillFormScript(fieldValues(e)), null)
        }
    }

    fun dismissAutofillOffer() { _autofillOffer.value = null }

    private fun fieldValues(e: AutofillEntry): Map<String, String> = when (e.kind) {
        AutofillKind.CARD -> {
            val exp = e["exp"]
            val month = exp.substringBefore('/', "")
            val year = exp.substringAfter('/', "").let { if (it.length == 2) "20$it" else it }
            mapOf("ccnum" to CardInfo.digits(e["number"]), "ccname" to e["name"], "ccexp" to exp, "ccm" to month, "ccy" to year)
        }
        AutofillKind.ADDRESS -> {
            val name = e["name"].trim()
            mapOf(
                "name" to name, "given" to name.substringBefore(' '), "family" to name.substringAfter(' ', ""),
                "org" to e["organization"], "street" to e["street"], "city" to e["city"], "state" to e["state"],
                "postal" to e["postal"], "country" to e["country"], "tel" to e["phone"], "email" to e["email"],
            )
        }
        else -> emptyMap()
    }

    private fun flushForm(tabId: String) {
        val (kind, data) = pendingForms.remove(tabId) ?: return
        if (tab(tabId)?.isPrivate == true) return
        viewModelScope.launch {
            val values: Map<String, String> = when (kind) {
                AutofillKind.CARD -> {
                    val number = CardInfo.digits(data["ccnum"].orEmpty())
                    if (!CardInfo.luhnValid(number)) return@launch
                    val exp = CardInfo.normaliseExpiry(data["ccexp"].orEmpty())
                        ?: CardInfo.normaliseExpiry(data["ccm"].orEmpty().padStart(2, '0') + data["ccy"].orEmpty().takeLast(2))
                        ?: ""
                    if (security.entriesOf(AutofillKind.CARD).any { CardInfo.digits(it["number"]) == number }) return@launch
                    mapOf("number" to number, "name" to data["ccname"].orEmpty(), "exp" to exp)
                }
                AutofillKind.ADDRESS -> {
                    val name = data["name"].orEmpty().ifBlank { listOf(data["given"], data["family"]).filterNot { it.isNullOrBlank() }.joinToString(" ") }
                    val street = listOf(data["street"], data["street2"]).filterNot { it.isNullOrBlank() }.joinToString(", ")
                    if (name.isBlank() && street.isBlank()) return@launch
                    if (security.entriesOf(AutofillKind.ADDRESS).any { it["name"].equals(name, true) && it["street"].equals(street, true) }) return@launch
                    mapOf("name" to name, "organization" to data["org"].orEmpty(), "street" to street, "city" to data["city"].orEmpty(),
                        "state" to data["state"].orEmpty(), "postal" to data["postal"].orEmpty(), "country" to data["country"].orEmpty(),
                        "phone" to data["tel"].orEmpty(), "email" to data["email"].orEmpty())
                }
                else -> return@launch
            }
            _saveFormOffer.value = SaveFormOffer(kind, values)
        }
    }

    fun saveFormEntry() {
        val offer = _saveFormOffer.value ?: return
        _saveFormOffer.value = null
        viewModelScope.launch {
            runCatching { security.saveEntry(offer.kind, offer.values) }
                .onSuccess { _events.tryEmit(BrowserEvent.Message(if (offer.kind == AutofillKind.CARD) R.string.af_card_saved else R.string.af_address_saved)) }
        }
    }

    fun dismissSaveFormOffer() { _saveFormOffer.value = null }

    /** The sign-in went through (the page moved on): now ask "Save password?", like Chrome. */
    private fun flushSignIn(tabId: String) {
        flushForm(tabId)
        val pending = pendingSignIns.remove(tabId) ?: return
        if (android.os.SystemClock.elapsedRealtime() - pending.at > 90_000) return
        onSignInSubmitted(tabId, pending.origin, pending.username, pending.password)
    }

    private fun offerFillFor(tabId: String, origin: String, fromFocus: Boolean) {
        if (tabId != _activeId.value) return
        val url = tab(tabId)?.url
        if (!fromFocus && fillDismissedUrls[tabId] == url) return
        if (_fillOffer.value?.let { it.tabId == tabId && it.origin == origin } == true) return
        viewModelScope.launch {
            val logins = security.loginsFor(origin)
            if (logins.isNotEmpty() && tabId == _activeId.value && SecurityRepository.originOf(webViews[tabId]?.url) == origin) {
                _fillOffer.value = FillOffer(tabId, origin, logins)
            }
        }
    }

    private fun onSignInSubmitted(tabId: String, origin: String, username: String, password: String) {
        val tab = tab(tabId) ?: return
        if (tab.isPrivate || !preferences.value.savePasswords || !origin.startsWith("https://")) return
        viewModelScope.launch {
            when (security.check(origin, username, password)) {
                SaveCheck.NEW -> _passwordOffer.value = PasswordOffer(origin, username, password, update = false)
                SaveCheck.UPDATE -> _passwordOffer.value = PasswordOffer(origin, username, password, update = true)
                SaveCheck.SAME, SaveCheck.NEVER -> Unit
            }
        }
    }

    fun savePassword() {
        val offer = _passwordOffer.value ?: return
        _passwordOffer.value = null
        viewModelScope.launch {
            runCatching { security.save(offer.origin, offer.username, offer.password) }
                .onSuccess { _events.tryEmit(BrowserEvent.Message(R.string.password_saved)) }
        }
    }

    fun neverSavePassword() {
        val offer = _passwordOffer.value ?: return
        _passwordOffer.value = null
        viewModelScope.launch { security.neverSave(offer.origin) }
    }

    fun dismissPasswordOffer() { _passwordOffer.value = null }

    private fun offerFill(tabId: String, view: WebView, url: String) {
        val tab = tab(tabId) ?: return
        val origin = SecurityRepository.originOf(url) ?: return
        if (tab.isPrivate || !origin.startsWith("https://")) return
        viewModelScope.launch {
            val logins = security.loginsFor(origin)
            if (logins.isEmpty()) return@launch
            view.evaluateJavascript(PasswordBridge.HAS_PASSWORD_FIELD_JS) { has ->
                if (has == "true" && SecurityRepository.originOf(view.url) == origin) _fillOffer.value = FillOffer(tabId, origin, logins)
            }
        }
    }

    /** Fills a saved sign-in into the page, only if the tab is still on the same site. */
    fun fillLogin(loginId: Long) {
        val offer = _fillOffer.value ?: return
        _fillOffer.value = null
        val wv = webViews[offer.tabId] ?: return
        if (SecurityRepository.originOf(wv.url) != offer.origin) return
        val login = offer.logins.firstOrNull { it.id == loginId } ?: return
        viewModelScope.launch {
            val password = security.password(loginId) ?: return@launch
            if (SecurityRepository.originOf(wv.url) != offer.origin) return@launch
            wv.evaluateJavascript(PasswordBridge.fillScript(login.username, password), null)
            security.markUsed(loginId)
        }
    }

    fun dismissFillOffer() {
        _fillOffer.value?.let { fillDismissedUrls[it.tabId] = tab(it.tabId)?.url }
        _fillOffer.value = null
    }

    fun setSavePasswords(enabled: Boolean) = viewModelScope.launch { prefsRepository.setSavePasswords(enabled) }

    private val _tabs = MutableStateFlow<List<TabState>>(emptyList())
    val tabs: StateFlow<List<TabState>> = _tabs.asStateFlow()

    private val _activeId = MutableStateFlow<String?>(null)
    val activeId: StateFlow<String?> = _activeId.asStateFlow()

    val activeTab: StateFlow<TabState?> = combine(_tabs, _activeId) { tabs, id -> tabs.firstOrNull { it.id == id } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val preferences: StateFlow<BrowserPreferences> = prefsRepository.preferences
        .stateIn(viewModelScope, SharingStarted.Eagerly, BrowserPreferences())

    val bookmarkedUrls: StateFlow<Set<String>> = browsing.bookmarkedUrls().map { it.toSet() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    private val _events = MutableSharedFlow<BrowserEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<BrowserEvent> = _events

    private val _fullscreen = MutableStateFlow<FullscreenVideo?>(null)
    val fullscreen: StateFlow<FullscreenVideo?> = _fullscreen.asStateFlow()

    private val _fileChooser = MutableStateFlow<FileChooserRequest?>(null)
    val fileChooser: StateFlow<FileChooserRequest?> = _fileChooser.asStateFlow()

    /** Whether this device's WebView can keep private-tab cookies and storage separate. */
    val privateIsolationSupported: Boolean = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

    private val webContext = MutableContextWrapper(app)
    private val webViews = mutableMapOf<String, WebView>()
    private val lastUsed = mutableMapOf<String, Long>()
    /** Tabs opened from a link in another tab, and the tab they came from. */
    private val openers = mutableMapOf<String, String>()
    /** Tabs opened by another app; Back closes them and returns to that app, like Chrome. */
    private val externalTabs = mutableSetOf<String>()
    /** History of hibernated tabs, restored when they wake up. */
    private val savedStates = mutableMapOf<String, android.os.Bundle>()


    init {
        viewModelScope.launch {
            val prefs = prefsRepository.preferences.first()
            val saved = if (prefs.restoreTabs) runCatching { browsing.loadSavedTabs() }.getOrDefault(emptyList()) else emptyList()
            val restored = saved.map {
                TabState(id = it.id, isPrivate = false, url = it.url, title = it.title, showingHome = it.url == null)
            }
            val alreadyActive = _activeId.value
            _tabs.update { restored + it }
            if (alreadyActive == null) {
                _activeId.value = saved.firstOrNull { it.isSelected }?.id ?: restored.lastOrNull()?.id
            }
            if (_tabs.value.isEmpty()) newTab()
            _ready.value = true
        }
        viewModelScope.launch {
            combine(_tabs, _activeId) { tabs, active ->
                tabs.filter { !it.isPrivate }.mapIndexed { i, t ->
                    SavedTab(t.id, t.url, t.title, i, t.id == active)
                }
            }.distinctUntilChanged().debounce(800).collect { snapshot ->
                if (!_ready.value) return@collect
                runCatching {
                    if (preferences.value.restoreTabs) browsing.saveTabs(snapshot) else browsing.clearSavedTabs()
                }
            }
        }
        viewModelScope.launch {
            preferences.map { it.javaScriptEnabled }.distinctUntilChanged().collect { enabled ->
                webViews.values.forEach { it.settings.javaScriptEnabled = enabled }
            }
        }
        viewModelScope.launch {
            preferences.map { it.textZoom }.distinctUntilChanged().collect { zoom ->
                webViews.values.forEach { it.settings.textZoom = zoom }
            }
        }
        // Tell the user when a download finishes, with a button to open it.
        viewModelScope.launch {
            downloads.notices.collect { n ->
                when (n) {
                    is com.webtecit.nayon.data.downloads.DownloadNotice.Finished ->
                        _events.tryEmit(BrowserEvent.Message(R.string.download_complete, n.fileName, action = EventAction.OpenDownload(n.id)))
                    is com.webtecit.nayon.data.downloads.DownloadNotice.Failed ->
                        _events.tryEmit(BrowserEvent.Message(R.string.download_failed_named, n.fileName, action = EventAction.ShowDownloads))
                }
            }
        }
    }

    // ---- Activity binding -------------------------------------------------------------

    fun attachActivity(activity: Activity) {
        webContext.baseContext = activity
    }

    fun detachActivity(activity: Activity) {
        if (webContext.baseContext === activity) webContext.baseContext = getApplication()
    }

    // ---- Tabs ---------------------------------------------------------------------------

    fun newTab(url: String? = null, private: Boolean = false): String {
        val id = UUID.randomUUID().toString()
        _tabs.update { it + TabState(id = id, isPrivate = private) }
        selectTab(id)
        if (url != null) load(id, url)
        return id
    }

    /** Opens [url] in a new tab behind the current one, like Chrome's "Open in new tab". */
    fun openInBackground(url: String, private: Boolean = false) {
        if (!UrlResolver.isWebUrl(url)) return
        val id = UUID.randomUUID().toString()
        val current = _tabs.value.indexOfFirst { it.id == _activeId.value }
        val tab = TabState(id = id, isPrivate = private, url = url, title = UrlResolver.displayHost(url), showingHome = false)
        _activeId.value?.let { openers[id] = it }
        _tabs.update { list -> list.toMutableList().apply { add(if (current >= 0) current + 1 else size, tab) } }
        _events.tryEmit(BrowserEvent.Message(
            if (private) R.string.opened_private_tab else R.string.opened_new_tab, action = EventAction.SwitchTab(id),
        ))
    }

    // ---- Recently closed (Undo) -----------------------------------------------------------

    /** A closed tab: where it was, and its history (page, scroll position, back/forward). */
    private class ClosedTab(val index: Int, val tab: TabState, val state: android.os.Bundle?)

    private val recentlyClosed = ArrayDeque<ClosedTab>()

    /** The last closed tab's WebView, kept alive for a short while so Undo is instant. */
    private var undoWebView: Pair<String, WebView>? = null
    private var undoExpiry: kotlinx.coroutines.Job? = null

    fun undoCloseTab() {
        val closed = recentlyClosed.removeLastOrNull() ?: return
        val id = closed.tab.id
        val kept = undoWebView?.takeIf { it.first == id }?.second
        val restored = if (kept != null) {
            // Still alive: the page comes back exactly where it was, with no reload.
            undoExpiry?.cancel()
            undoWebView = null
            webViews[id] = kept
            kept.onResume()
            closed.tab.copy(error = null)
        } else {
            // Rebuilt from its saved history: same page and scroll position, loaded from cache.
            closed.state?.let { savedStates[id] = it }
            closed.tab.copy(isLoading = false, progress = 0, error = null)
        }
        _tabs.update { list -> list.toMutableList().apply { add(closed.index.coerceIn(0, size), restored) } }
        selectTab(id)
        hibernateOldTabs()
    }

    private fun releaseUndoWebView() {
        undoExpiry?.cancel()
        undoWebView?.second?.let { wv ->
            (wv.parent as? android.view.ViewGroup)?.removeView(wv)
            wv.stopLoading()
            wv.destroy()
        }
        undoWebView = null
    }

    private val _showBrowser = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    /** Emits when a link arrives from another app, so the UI can return to the browser page. */
    val showBrowser: SharedFlow<Unit> = _showBrowser

    fun openExternalLink(url: String) {
        if (UrlResolver.isWebUrl(url)) { externalTabs += newTab(url); _showBrowser.tryEmit(Unit) }
    }

    fun openSearch(query: String) {
        UrlResolver.resolve(query, preferences.value.searchTemplate)?.let { newTab(it); _showBrowser.tryEmit(Unit) }
    }

    /** Opens a URL in the current tab (used by bookmarks, history and suggestions). */
    fun openInCurrentTab(url: String) {
        val id = _activeId.value ?: newTab()
        load(id, url)
    }

    /** Matching bookmarks and history (on this device). */
    fun suggestionsFor(query: String): Flow<List<Suggestion>> {
        val q = query.trim()
        if (q.length < 2) return kotlinx.coroutines.flow.flowOf(emptyList())
        return combine(browsing.searchBookmarks(q), browsing.searchHistory(q, 20)) { marks, history ->
            val seen = mutableSetOf<String>()
            val out = mutableListOf<Suggestion>()
            marks.forEach { if (seen.add(it.url)) out += Suggestion(it.url, it.title, isBookmark = true) }
            history.forEach { if (seen.add(it.url)) out += Suggestion(it.url, it.title, isBookmark = false) }
            out.take(4)
        }
    }

    /**
     * Search suggestions from the selected search engine, like Chrome. Only when the setting
     * is on and never in private tabs.
     */
    fun searchSuggestionsFor(query: String): Flow<List<String>> = kotlinx.coroutines.flow.flow {
        val q = query.trim()
        val prefs = preferences.value
        if (q.isEmpty() || !prefs.searchSuggestions || activeTab.value?.isPrivate == true) { emit(emptyList()); return@flow }
        kotlinx.coroutines.delay(150)
        emit(com.webtecit.nayon.core.browser.SearchSuggestions.fetch(prefs.searchEngine, q))
    }

    /** Recent distinct sites for the new-tab page. */
    val recentSites: StateFlow<List<HistoryEntry>> = browsing.recentHistory(40)
        .map { list -> list.distinctBy { UrlResolver.displayHost(it.url) }.take(5) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setSearchEngine(engine: SearchEngine) = viewModelScope.launch { prefsRepository.setSearchEngine(engine) }
    fun setCustomSearch(template: String) = viewModelScope.launch { prefsRepository.setCustomSearch(template) }
    fun setJavaScriptEnabled(enabled: Boolean) = viewModelScope.launch { prefsRepository.setJavaScriptEnabled(enabled) }
    fun setRestoreTabs(enabled: Boolean) = viewModelScope.launch { prefsRepository.setRestoreTabs(enabled) }
    fun setShowShortcuts(enabled: Boolean) = viewModelScope.launch { prefsRepository.setShowShortcuts(enabled) }
    fun setShowRecentOnHome(enabled: Boolean) = viewModelScope.launch { prefsRepository.setShowRecentOnHome(enabled) }
    val shortcuts: StateFlow<List<com.webtecit.nayon.data.settings.HomeShortcut>> = prefsRepository.shortcuts
        .stateIn(viewModelScope, SharingStarted.Eagerly, com.webtecit.nayon.data.settings.DefaultHomeShortcuts)

    fun addShortcut(label: String, url: String) = viewModelScope.launch {
        val resolved = UrlResolver.resolve(url, preferences.value.searchTemplate)?.takeIf { UrlResolver.isWebUrl(it) } ?: return@launch
        val name = label.trim().ifBlank { UrlResolver.displayHost(resolved) }
        prefsRepository.setShortcuts(shortcuts.value.filterNot { it.url == resolved } + com.webtecit.nayon.data.settings.HomeShortcut(name, resolved))
    }

    fun removeShortcut(url: String) = viewModelScope.launch {
        prefsRepository.setShortcuts(shortcuts.value.filterNot { it.url == url })
    }

    fun removeFromHistory(id: Long) = viewModelScope.launch { browsing.deleteHistory(id) }

    /** Long-press "Remove suggestion from history", like Chrome. */
    fun removeSearchFromHistory(query: String) =
        removeHistoryWhere { UrlResolver.searchQueryOf(it.url)?.equals(query, ignoreCase = true) == true }

    fun removeUrlFromHistory(url: String) = removeHistoryWhere { it.url == url }

    fun removeSiteFromHistory(url: String) {
        val host = UrlResolver.displayHost(url)
        if (host.isNotBlank()) removeHistoryWhere { UrlResolver.displayHost(it.url) == host }
    }

    private fun removeHistoryWhere(match: (com.webtecit.nayon.data.browser.HistoryEntry) -> Boolean) = viewModelScope.launch {
        runCatching { browsing.recentHistory(5_000).first().filter(match).forEach { browsing.deleteHistory(it.id) } }
    }

    fun setTextZoom(percent: Int) = viewModelScope.launch { prefsRepository.setTextZoom(percent) }
    fun setSearchSuggestions(enabled: Boolean) = viewModelScope.launch { prefsRepository.setSearchSuggestions(enabled) }
    fun setPullToRefresh(enabled: Boolean) = viewModelScope.launch { prefsRepository.setPullToRefresh(enabled) }
    fun setToolbarLayout(layout: ToolbarLayout) = viewModelScope.launch { prefsRepository.setToolbarLayout(layout) }
    fun setHideToolbarsOnScroll(enabled: Boolean) = viewModelScope.launch {
        prefsRepository.setHideToolbarsOnScroll(enabled)
        if (!enabled) showBars()
    }

    // ---- Collapsing toolbars ------------------------------------------------------------

    /**
     * Receives page scrolls of the active tab: (scrollY, dy, fingerDown, userDriven, scrollRoom).
     * userDriven is false for scrolls the page makes by itself (text selection, anchors),
     * which must never move the toolbars. scrollRoom is how far the page can scroll in total.
     */
    var onActivePageScroll: ((Int, Int, Boolean, Boolean, Int) -> Unit)? = null

    /** Called when the finger leaves the active page. */
    var onActiveGestureEnd: (() -> Unit)? = null

    private var fingerDown = false
    private var lastFingerUp = 0L

    private val _showBarsRequests = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val showBarsRequests: SharedFlow<Unit> = _showBarsRequests

    fun showBars() {
        _showBarsRequests.tryEmit(Unit)
    }

    private fun onWebScroll(tabId: String, y: Int, oldY: Int) {
        if (tabId != _activeId.value) return
        val userDriven = fingerDown || android.os.SystemClock.uptimeMillis() - lastFingerUp < 1_500
        val room = (webViews[tabId] as? NayonWebView)?.scrollRoom ?: Int.MAX_VALUE
        onActivePageScroll?.invoke(y, y - oldY, fingerDown, userDriven, room)
    }

    private fun onWebTouch(tabId: String, action: Int) {
        when (action) {
            android.view.MotionEvent.ACTION_DOWN -> fingerDown = true
            android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                fingerDown = false
                lastFingerUp = android.os.SystemClock.uptimeMillis()
                if (tabId == _activeId.value) onActiveGestureEnd?.invoke()
            }
        }
    }

    // ---- Long-press menu (links and images) ---------------------------------------------

    private val _contextMenu = MutableStateFlow<ContextTarget?>(null)
    val contextMenu: StateFlow<ContextTarget?> = _contextMenu.asStateFlow()

    fun dismissContextMenu() { _contextMenu.value = null }

    private fun onLongPress(tabId: String, wv: WebView): Boolean {
        val hit = wv.hitTestResult
        val extra = hit.extra ?: return false
        val isPrivate = tab(tabId)?.isPrivate == true
        val target = when (hit.type) {
            WebView.HitTestResult.SRC_ANCHOR_TYPE -> ContextTarget(linkUrl = extra, isPrivate = isPrivate)
            WebView.HitTestResult.IMAGE_TYPE -> ContextTarget(imageUrl = extra, isPrivate = isPrivate)
            WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> ContextTarget(imageUrl = extra, isPrivate = isPrivate)
            else -> return false
        }
        _contextMenu.value = target
        wv.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
        // Ask the page for the link's text and real address (for linked images).
        val handler = android.os.Handler(android.os.Looper.getMainLooper()) { msg ->
            val url = msg.data.getString("url")
            val title = msg.data.getString("title")
            _contextMenu.update { cur ->
                cur?.copy(
                    linkUrl = cur.linkUrl ?: url?.takeIf { UrlResolver.isWebUrl(it) },
                    linkText = title?.takeIf { it.isNotBlank() } ?: cur.linkText,
                )
            }
            true
        }
        wv.requestFocusNodeHref(handler.obtainMessage())
        return true
    }

    /** Downloads a link or image from the long-press menu. */
    fun downloadUrl(url: String, private: Boolean) {
        val ua = webViews.values.firstOrNull()?.settings?.userAgentString
        startDownload(url, ua, null, null, private)
    }

    // ---- Find in page -------------------------------------------------------------------

    private val _find = MutableStateFlow<FindState?>(null)
    val find: StateFlow<FindState?> = _find.asStateFlow()

    fun startFind() { _find.value = FindState() }

    fun findQuery(query: String) {
        _find.value = (_find.value ?: FindState()).copy(query = query, current = 0, total = 0)
        val wv = activeWebView() ?: return
        if (query.isEmpty()) wv.clearMatches() else wv.findAllAsync(query)
    }

    fun findNext(forward: Boolean) { activeWebView()?.findNext(forward) }

    fun stopFind() {
        activeWebView()?.clearMatches()
        _find.value = null
    }

    // ---- Translate ----------------------------------------------------------------------

    /** Opens the page through Google Translate's website (no API key; Google sees the page address). */
    fun translatePage() {
        val tab = activeTab.value ?: return
        val url = tab.url?.takeIf { tab.isWebPage } ?: return
        val lang = java.util.Locale.getDefault().language.ifBlank { "en" }
        load(tab.id, "https://translate.google.com/translate?sl=auto&tl=$lang&u=" + java.net.URLEncoder.encode(url, "UTF-8"))
    }

    fun activeWebView(): WebView? = _activeId.value?.let { webViews[it] }

    // ---- Search panel data ------------------------------------------------------------

    /** Most visited sites (by number of visits) for the search panel. */
    val topSites: StateFlow<List<HistoryEntry>> = browsing.recentHistory(400)
        .map { list ->
            list.groupBy { UrlResolver.displayHost(it.url) }
                .filterKeys { it.isNotBlank() }
                .entries.sortedByDescending { it.value.size }
                .take(8)
                .map { (host, visits) -> visits.first().copy(url = "https://$host") }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Recent search words, read back from search-result pages in history. */
    val recentSearches: StateFlow<List<String>> = browsing.recentHistory(400)
        .map { list -> list.mapNotNull { UrlResolver.searchQueryOf(it.url) }.distinctBy { it.lowercase() }.take(12) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    // ---- Page info --------------------------------------------------------------------

    fun certificateFor(id: String): SslCertificate? = webViews[id]?.certificate

    fun cookieCount(url: String?): Int =
        url?.let { CookieManager.getInstance().getCookie(it) }?.split(';')?.count { it.isNotBlank() } ?: 0

    /** Deletes this site's cookies and storage, then reloads it. */
    fun clearSiteData(url: String) {
        val uri = url.toUri()
        val host = uri.host ?: return
        val cm = CookieManager.getInstance()
        val names = cm.getCookie(url)?.split(';')?.map { it.substringBefore('=').trim() }?.filter { it.isNotEmpty() }.orEmpty()
        val expired = "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        val domains = listOf(host) + host.split('.').let { parts ->
            (1 until parts.size - 1).map { parts.drop(it).joinToString(".") }
        }
        names.forEach { name ->
            cm.setCookie(url, "$name=; $expired; Path=/")
            domains.forEach { d -> cm.setCookie(url, "$name=; $expired; Path=/; Domain=.$d") }
        }
        cm.flush()
        val port = if (uri.port != -1) ":${uri.port}" else ""
        WebStorage.getInstance().deleteOrigin("${uri.scheme}://$host$port")
        reload()
        _events.tryEmit(BrowserEvent.Message(R.string.site_data_cleared))
    }

    fun selectTab(id: String) {
        val previous = _activeId.value
        if (previous != null && previous != id) {
            // Background tabs keep running (videos, chats, timers), like on a computer. Their
            // history is saved so they come back in place if Android ever frees their memory.
            webViews[previous]?.let { wv -> android.os.Bundle().also { b -> if (wv.saveState(b) != null) savedStates[previous] = b } }
        }
        _activeId.value = id
        showBars()
        lastUsed[id] = System.currentTimeMillis()
        webViews[id]?.onResume()
    }

    fun closeTab(id: String) {
        val list = _tabs.value
        val index = list.indexOfFirst { it.id == id }
        if (index < 0) return
        val closing = list[index]
        val wv = webViews[id]
        val state = wv?.let { android.os.Bundle().also { b -> it.saveState(b) } } ?: savedStates[id]
        recentlyClosed.addLast(ClosedTab(index, closing.copy(thumbnail = null), state))
        if (recentlyClosed.size > 10) recentlyClosed.removeFirst()
        releaseUndoWebView()
        if (wv != null && !closing.isPrivate) {
            // Keep the closed page alive (silenced) for the Undo window, then free it.
            webViews.remove(id)
            lastUsed.remove(id)
            (wv.parent as? android.view.ViewGroup)?.removeView(wv)
            wv.evaluateJavascript(PAUSE_MEDIA_JS, null)
            wv.onPause()
            undoWebView = id to wv
            undoExpiry = viewModelScope.launch { kotlinx.coroutines.delay(UNDO_KEEP_MS); releaseUndoWebView() }
        } else {
            destroyWebView(id)
        }
        savedStates.remove(id); openers.remove(id); externalTabs.remove(id)
        val remaining = list - closing
        _tabs.value = remaining
        if (_activeId.value == id) {
            val sameKind = remaining.filter { it.isPrivate == closing.isPrivate }
            val next = sameKind.getOrNull((index - 1).coerceAtLeast(0).coerceAtMost(sameKind.lastIndex))
                ?: remaining.lastOrNull()
            if (next != null) selectTab(next.id) else newTab()
        }
        if (closing.isPrivate && remaining.none { it.isPrivate }) clearPrivateSession()
    }

    fun closeAll(private: Boolean) {
        _tabs.value.filter { it.isPrivate == private }.forEach { destroyWebView(it.id) }
        _tabs.update { list -> list.filter { it.isPrivate != private } }
        if (private) clearPrivateSession()
        val active = _tabs.value.firstOrNull { it.id == _activeId.value }
        if (active == null) {
            _tabs.value.lastOrNull()?.let { selectTab(it.id) } ?: newTab()
        }
    }

    fun duplicateTab(id: String) {
        val tab = _tabs.value.firstOrNull { it.id == id } ?: return
        newTab(tab.url, tab.isPrivate)
    }

    // ---- Navigation ---------------------------------------------------------------------

    /** Loads what the user typed: a URL or a search with the current engine. */
    /** Whether the regular (non-private) browser is signed in to a Google account on the web. */
    fun googleSignedIn(): Boolean = runCatching {
        CookieManager.getInstance().getCookie("https://accounts.google.com").orEmpty().split(';')
            .any { c -> c.trim().let { it.startsWith("SID=") || it.startsWith("__Secure-3PSID=") } }
    }.getOrDefault(false)

    private val _googleAccount = MutableStateFlow<com.webtecit.nayon.data.browser.GoogleAccount?>(null)
    /** The Google account signed in on the web (name, email, photo), or null. */
    val googleAccount: StateFlow<com.webtecit.nayon.data.browser.GoogleAccount?> = _googleAccount.asStateFlow()
    private var accountCheckedAt = 0L
    private var accountJob: kotlinx.coroutines.Job? = null

    /** Refreshes [googleAccount]; cheap to call whenever the home page shows. */
    fun refreshGoogleAccount(force: Boolean = false) {
        if (!googleSignedIn()) { _googleAccount.value = null; return }
        val now = android.os.SystemClock.elapsedRealtime()
        if (!force && _googleAccount.value != null && now - accountCheckedAt < 5 * 60_000L) return
        if (accountJob?.isActive == true) return
        accountCheckedAt = now
        val cookies = CookieManager.getInstance().getCookie("https://accounts.google.com") ?: return
        accountJob = viewModelScope.launch {
            com.webtecit.nayon.data.browser.GoogleAccounts.fetch(cookies)?.let { _googleAccount.value = it }
        }
    }

    /** Asks Google's AI Mode. */
    fun aiSearch(query: String) {
        if (query.isBlank()) return
        val id = _activeId.value ?: newTab()
        load(id, "https://www.google.com/search?udm=50&q=" + java.net.URLEncoder.encode(query.trim(), "UTF-8"))
    }

    fun navigate(input: String) {
        val url = UrlResolver.resolve(input, preferences.value.searchTemplate) ?: return
        val id = _activeId.value ?: newTab()
        load(id, url)
    }

    fun load(id: String, url: String) {
        updateTab(id) { it.copy(url = url, showingHome = false, error = null, certificateError = false) }
        ensureWebView(id)?.loadUrl(url)
    }

    /** Handles the system back gesture. Returns false when there is nothing to go back to. */
    /** What the system Back gesture did. */
    enum class BackResult { HANDLED, LEAVE_APP, NOTHING_LEFT }


    /**
     * Chrome-style Back: page history first (checked live on the WebView, never a stale flag),
     * then a link-opened tab closes back to its parent tab. NOTHING_LEFT asks before leaving.
     */
    fun handleBack(): BackResult {
        val tab = activeTab.value ?: return BackResult.NOTHING_LEFT
        if (tab.showingHome) {
            if (tab.url != null) { updateTab(tab.id) { it.copy(showingHome = false) }; ensureWebView(tab.id); return BackResult.HANDLED }
            return BackResult.NOTHING_LEFT
        }
        val wv = ensureWebView(tab.id)
        if (wv != null && wv.canGoBack()) { wv.goBack(); return BackResult.HANDLED }
        if (tab.id in externalTabs) { closeTab(tab.id); return BackResult.LEAVE_APP }
        val opener = openers[tab.id]
        if (opener != null && _tabs.value.any { it.id == opener }) {
            closeTab(tab.id)
            selectTab(opener)
            return BackResult.HANDLED
        }
        return BackResult.NOTHING_LEFT
    }

    fun goBack(): Boolean {
        val tab = activeTab.value ?: return false
        if (tab.showingHome && tab.url != null && webViews[tab.id] != null) {
            updateTab(tab.id) { it.copy(showingHome = false) }
            return true
        }
        val wv = webViews[tab.id] ?: return false
        if (!tab.showingHome && wv.canGoBack()) {
            wv.goBack(); return true
        }
        return false
    }

    fun goForward() {
        val tab = activeTab.value ?: return
        if (tab.showingHome && tab.url != null) { updateTab(tab.id) { it.copy(showingHome = false) }; return }
        webViews[tab.id]?.takeIf { it.canGoForward() }?.goForward()
    }

    fun reload() {
        val tab = activeTab.value ?: return
        val wv = webViews[tab.id]
        when {
            tab.url == null -> Unit
            wv == null || tab.error != null -> load(tab.id, tab.url)
            else -> wv.reload()
        }
    }

    fun stopLoading() {
        activeTab.value?.let { tab -> webViews[tab.id]?.stopLoading(); updateTab(tab.id) { it.copy(isLoading = false) } }
    }

    fun goHome() {
        activeTab.value?.let { tab -> updateTab(tab.id) { it.copy(showingHome = true) } }
    }

    fun toggleDesktopMode() {
        val tab = activeTab.value ?: return
        val enabled = !tab.desktopMode
        updateTab(tab.id) { it.copy(desktopMode = enabled) }
        webViews[tab.id]?.let { applyDesktopMode(it, enabled); if (tab.url != null) it.reload() }
    }

    fun toggleBookmark() {
        val tab = activeTab.value ?: return
        val url = tab.url?.takeIf { tab.isWebPage } ?: return
        viewModelScope.launch {
            if (url in bookmarkedUrls.value) {
                browsing.removeBookmark(url)
                _events.tryEmit(BrowserEvent.Message(R.string.bookmark_removed))
            } else {
                browsing.addBookmark(url, tab.title)
                _events.tryEmit(BrowserEvent.Message(R.string.bookmark_added))
            }
        }
    }

    /** Takes a small screenshot of the active page for the tab switcher. */
    fun captureActiveThumbnail() {
        val tab = activeTab.value ?: return
        val wv = webViews[tab.id] ?: return
        if (!tab.isWebPage || wv.width == 0 || wv.height == 0) return
        // Draw straight into a small bitmap: far cheaper than a full-size screenshot.
        val bitmap = runCatching {
            val w = THUMB_WIDTH
            val scale = w / wv.width.toFloat()
            val h = (wv.height * scale).toInt().coerceAtLeast(1)
            Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565).also { bmp ->
                val canvas = Canvas(bmp)
                canvas.scale(scale, scale)
                canvas.translate(-wv.scrollX.toFloat(), -wv.scrollY.toFloat())
                wv.draw(canvas)
            }
        }.getOrNull() ?: return
        updateTab(tab.id) { it.copy(thumbnail = bitmap) }
    }

    // ---- Full screen & file upload ------------------------------------------------------

    fun exitFullscreen() {
        _fullscreen.value?.callback?.onCustomViewHidden()
        _fullscreen.value = null
    }

    fun onFileChooserResult(resultCode: Int, data: Intent?) {
        val request = _fileChooser.value ?: return
        _fileChooser.value = null
        request.callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    }

    fun onFileChooserFailed() {
        _fileChooser.value?.callback?.onReceiveValue(null)
        _fileChooser.value = null
        _events.tryEmit(BrowserEvent.Message(R.string.error_no_app_to_open_link))
    }

    // ---- Settings & data ----------------------------------------------------------------

    /**
     * Deletes browsing data. History honours [since] (0 = all time). WebView cannot limit
     * cookies or cache by date, so those are always cleared completely.
     */
    fun clearBrowsingData(since: Long, history: Boolean, cookies: Boolean, cache: Boolean, closeTabs: Boolean = false) {
        viewModelScope.launch {
            if (history) {
                browsing.clearHistorySince(since)
                if (since <= 0L) favicons.clear()
            }
            if (cookies) {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                WebStorage.getInstance().deleteAllData()
            }
            if (cache) {
                val wv = webViews.values.firstOrNull()
                if (wv != null) wv.clearCache(true) else WebView(webContext).apply { clearCache(true); destroy() }
            }
            if (closeTabs) closeAll(private = false)
            _events.tryEmit(BrowserEvent.Message(R.string.clear_data_done))
        }
    }

    fun historyCountSince(since: Long): Flow<Int> = browsing.historyCountSince(since)

    /** Size of cached web files, for the clear-data screen. */
    suspend fun cacheSizeBytes(): Long = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        getApplication<Application>().cacheDir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    // ---- WebView management -------------------------------------------------------------

    /** Returns the tab's WebView, creating it (and loading its URL) if needed. */
    fun ensureWebView(id: String): WebView? {
        webViews[id]?.let { return it }
        val tab = _tabs.value.firstOrNull { it.id == id } ?: return null
        val wv = createWebView(tab)
        webViews[id] = wv
        lastUsed[id] = System.currentTimeMillis()
        val saved = savedStates.remove(id)
        if (saved != null && wv.restoreState(saved) != null) syncNavState(id, wv)
        else if (tab.url != null && !tab.showingHome) wv.loadUrl(tab.url)
        hibernateOldTabs()
        return wv
    }

    fun webViewOrNull(id: String): WebView? = webViews[id]


    /**
     * How many tabs stay live at once, from the phone's memory: more on big phones, fewer on
     * small ones, so live tabs never make the browser lag or crash.
     */
    private val maxLiveWebViews: Int by lazy {
        val am = getApplication<Application>().getSystemService(android.app.ActivityManager::class.java)
        val info = android.app.ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
        val gb = info.totalMem / (1024.0 * 1024 * 1024)
        when {
            am?.isLowRamDevice == true -> 2
            gb < 3.5 -> 3
            gb < 5.5 -> 5
            gb < 9 -> 7
            else -> 9
        }
    }

    /** Called when Android asks apps to free memory: sleep background tabs (history kept). */
    fun onTrimMemory(level: Int) {
        // RUNNING_LOW / RUNNING_CRITICAL while in use, or BACKGROUND and above once the app is
        // in the background. Plain UI_HIDDEN (just switching apps) keeps tabs live.
        val low = android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
        val critical = android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL
        val uiHidden = android.content.ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN
        if (level < low || level == uiHidden) return
        releaseUndoWebView()
        val active = _activeId.value
        val keep = if (level == critical || level >= android.content.ComponentCallbacks2.TRIM_MEMORY_MODERATE) 0 else 1
        webViews.keys.filter { it != active }
            .sortedByDescending { lastUsed[it] ?: 0L }
            .drop(keep)
            .forEach { id -> hibernate(id) }
    }

    private fun hibernate(id: String) {
        webViews[id]?.let { wv -> android.os.Bundle().also { b -> if (wv.saveState(b) != null) savedStates[id] = b } }
        destroyWebView(id)
        updateTab(id) { it.copy(isLoading = false, progress = 0) }
    }

    /** Keeps at most [maxLiveWebViews] WebViews in memory. Others come back from saved history. */
    private fun hibernateOldTabs() {
        if (webViews.size <= maxLiveWebViews) return
        val active = _activeId.value
        webViews.keys.filter { it != active }
            .sortedBy { lastUsed[it] ?: 0L }
            .take(webViews.size - maxLiveWebViews)
            .forEach { id ->
                // Keep the tab's back/forward history so Back still works after it wakes up.
                webViews[id]?.let { wv -> android.os.Bundle().also { b -> if (wv.saveState(b) != null) savedStates[id] = b } }
                destroyWebView(id)
                updateTab(id) { it.copy(isLoading = false, progress = 0, canGoBack = false, canGoForward = false) }
            }
    }

    private fun destroyWebView(id: String) {
        webViews.remove(id)?.let { wv ->
            (wv.parent as? android.view.ViewGroup)?.removeView(wv)
            wv.stopLoading()
            wv.destroy()
        }
        lastUsed.remove(id)
    }

    @SuppressLint("RequiresFeature")
    private fun clearPrivateSession() {
        if (!privateIsolationSupported) return
        runCatching { ProfileStore.getInstance().deleteProfile(PRIVATE_PROFILE) }
    }

    @SuppressLint("SetJavaScriptEnabled", "RequiresFeature", "ClickableViewAccessibility")
    private fun createWebView(tab: TabState): WebView {
        val wv = NayonWebView(webContext)
        if (tab.isPrivate && privateIsolationSupported) {
            runCatching {
                ProfileStore.getInstance().getOrCreateProfile(PRIVATE_PROFILE)
                WebViewCompat.setProfile(wv, PRIVATE_PROFILE)
            }
        }
        wv.settings.apply {
            javaScriptEnabled = preferences.value.javaScriptEnabled
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            builtInZoomControls = true
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            // Like Chrome after you interact with a page: players that rebuild their video
            // (live streams, full-screen switches) may start it again without a fresh tap.
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)   // each site still has to be allowed (see onGeolocationPermissionsShowPrompt)
            if (tab.isPrivate) cacheMode = WebSettings.LOAD_NO_CACHE
            // Draws the page just outside the screen too, so scrolling and tab switches are smoother.
            offscreenPreRaster = true
        }
        // Keep the visible page's renderer at top priority so it is never slowed or killed first.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(wv.settings, true)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, false)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            runCatching { WebViewCompat.addDocumentStartJavaScript(wv, ORIENTATION_LOCK_SHIM, setOf("*")) }
        }
        wv.isFocusable = true
        wv.isFocusableInTouchMode = true
        wv.webViewClient = Client(tab.id)
        wv.webChromeClient = ChromeClient(tab.id)
        wv.setOnScrollChangeListener { _, _, y, _, oldY -> onWebScroll(tab.id, y, oldY) }
        wv.setOnTouchListener { _, e -> onWebTouch(tab.id, e.actionMasked); false }
        wv.setOnLongClickListener { onLongPress(tab.id, wv) }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            wv.importantForAutofill = if (preferences.value.otherAutofillApps) View.IMPORTANT_FOR_AUTOFILL_AUTO
            else View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        }
        wv.onWebSearch = { text -> newTab(UrlResolver.search(text, preferences.value.searchTemplate), private = tab.isPrivate) }
        if (!tab.isPrivate && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        ) {
            runCatching {
                WebViewCompat.addWebMessageListener(wv, PasswordBridge.CHANNEL, setOf("*")) { _, message, sourceOrigin, isMainFrame, _ ->
                    if (!isMainFrame) return@addWebMessageListener
                    val origin = SecurityRepository.originOf(sourceOrigin.toString()) ?: return@addWebMessageListener
                    val event = PasswordBridge.parse(message.data) ?: return@addWebMessageListener
                    onPasswordEvent(tab.id, origin, event)
                }
                WebViewCompat.addDocumentStartJavaScript(wv, PasswordBridge.CAPTURE_SCRIPT, setOf("*"))
            }
        }
        wv.setFindListener { active, count, _ ->
            if (tab.id == _activeId.value) _find.update { it?.copy(current = if (count == 0) 0 else active + 1, total = count) }
        }
        wv.settings.textZoom = preferences.value.textZoom
        wv.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startDownload(url, userAgent, contentDisposition, mimeType, tab.isPrivate)
        }
        if (tab.desktopMode) applyDesktopMode(wv, true)
        return wv
    }

    private fun applyDesktopMode(wv: WebView, enabled: Boolean) {
        val settings = wv.settings
        settings.userAgentString = if (enabled) desktopUserAgent(WebSettings.getDefaultUserAgent(getApplication())) else null
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
    }

    private fun updateTab(id: String, transform: (TabState) -> TabState) {
        _tabs.update { list -> list.map { if (it.id == id) transform(it) else it } }
    }

    private fun tab(id: String) = _tabs.value.firstOrNull { it.id == id }

    private fun syncNavState(id: String, view: WebView) {
        updateTab(id) { it.copy(canGoBack = view.canGoBack(), canGoForward = view.canGoForward()) }
    }

    private fun isOnline(): Boolean {
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun startDownload(url: String, userAgent: String?, disposition: String?, mime: String?, private: Boolean) {
        val referer = activeTab.value?.url
        when {
            url.startsWith("data:", ignoreCase = true) -> viewModelScope.launch {
                if (downloads.saveDataUrl(url, private) == null) _events.tryEmit(BrowserEvent.Message(R.string.download_failed))
            }
            !UrlResolver.isWebUrl(url) -> _events.tryEmit(BrowserEvent.Message(R.string.download_unsupported))
            else -> viewModelScope.launch {
                val name = URLUtil.guessFileName(url, disposition, mime)
                downloads.enqueue(
                    com.webtecit.nayon.data.downloads.DownloadRequest(
                        url = url,
                        fileName = name,
                        mimeType = mime?.takeIf { it.isNotBlank() },
                        userAgent = userAgent,
                        cookies = CookieManager.getInstance().getCookie(url),
                        referer = referer,
                        isPrivate = private,
                    ),
                )
                _events.tryEmit(BrowserEvent.Message(R.string.download_started, name, action = EventAction.ShowDownloads))
            }
        }
    }

    /** Opens a finished download (from the "Downloaded – Open" message). */
    fun openDownload(id: Long) {
        viewModelScope.launch {
            downloads.get(id)?.let { com.webtecit.nayon.data.downloads.DownloadFiles.open(getApplication(), it) }
        }
    }

    // replay = 1: the request may arrive (from a notification) before the screen is ready.
    private val _showDownloads = MutableSharedFlow<Unit>(replay = 1)
    /** Emits when a download notification asks to show the downloads page. */
    val showDownloads: SharedFlow<Unit> = _showDownloads
    fun requestShowDownloads() { _showDownloads.tryEmit(Unit) }
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun consumeShowDownloads() { _showDownloads.resetReplayCache() }

    /** Opens non-web links (mailto:, tel:, intent:, app links) in other apps — only after a user tap. */
    private fun openOutside(tabId: String, uri: Uri, hasGesture: Boolean) {
        val intent: Intent? = if (uri.scheme.equals("intent", ignoreCase = true)) {
            runCatching { Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME) }.getOrNull()?.apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                component = null
                selector = null
            }
        } else {
            Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
        }
        val fallback = intent?.getStringExtra("browser_fallback_url")?.takeIf { UrlResolver.isWebUrl(it) }
        val activity = webContext.baseContext as? Activity
        if (hasGesture && intent != null && activity != null) {
            try {
                activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return
            } catch (e: ActivityNotFoundException) {
                // fall through
            } catch (e: SecurityException) {
                // fall through
            }
        }
        when {
            fallback != null -> load(tabId, fallback)
            hasGesture -> _events.tryEmit(BrowserEvent.Message(R.string.error_no_app_to_open_link))
        }
    }

    private inner class Client(private val tabId: String) : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val scheme = request.url.scheme?.lowercase()
            return when (scheme) {
                "http", "https", "about", "blob" -> false
                else -> {
                    if (request.isForMainFrame) openOutside(tabId, request.url, request.hasGesture())
                    true
                }
            }
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            if (_fillOffer.value?.tabId == tabId) _fillOffer.value = null
            if (_autofillOffer.value?.tabId == tabId) _autofillOffer.value = null
            flushSignIn(tabId)
            if (tabId == _activeId.value) showBars()
            updateTab(tabId) {
                it.copy(
                    url = url, isLoading = true, progress = it.progress.coerceAtLeast(5), error = null,
                    certificateError = false, favicon = favicon ?: it.favicon.takeIf { _ -> UrlResolver.displayHost(it.url) == UrlResolver.displayHost(url) },
                )
            }
            syncNavState(tabId, view)
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (tabId == _activeId.value && !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) offerFill(tabId, view, url)
            updateTab(tabId) { it.copy(isLoading = false, progress = 100, url = url, title = view.title ?: it.title) }
            val host = UrlResolver.displayHost(url)
            if (tab(tabId)?.isPrivate == false && UrlResolver.isWebUrl(url) && host.isNotBlank()) {
                // Saved icons come only from the site itself (its own icon files). The icon WebView
                // reports can still be the previous site's while a new page loads, which once put
                // another site's logo on the Google shortcut.
                viewModelScope.launch { favicons.upgrade(host) }
            }
            syncNavState(tabId, view)
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            flushSignIn(tabId)   // single-page sites change the address after signing in
            updateTab(tabId) { it.copy(url = url) }
            syncNavState(tabId, view)
            val tab = tab(tabId) ?: return
            if (!isReload && !tab.isPrivate && UrlResolver.isWebUrl(url)) {
                val title = view.title.orEmpty()
                viewModelScope.launch { runCatching { browsing.recordVisit(url, title) } }
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val kind = when (error.errorCode) {
                WebViewClient.ERROR_HOST_LOOKUP, WebViewClient.ERROR_CONNECT -> if (isOnline()) PageError.Kind.NOT_FOUND else PageError.Kind.OFFLINE
                WebViewClient.ERROR_TIMEOUT -> if (isOnline()) PageError.Kind.TIMEOUT else PageError.Kind.OFFLINE
                WebViewClient.ERROR_FAILED_SSL_HANDSHAKE -> PageError.Kind.NOT_SECURE
                else -> PageError.Kind.GENERIC
            }
            updateTab(tabId) { it.copy(error = PageError(kind, request.url.toString()), isLoading = false) }
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            // Never proceed past certificate errors.
            handler.cancel()
            updateTab(tabId) {
                it.copy(certificateError = true, isLoading = false, error = PageError(PageError.Kind.NOT_SECURE, error.url))
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's renderer crashed or was killed to free memory. Drop this WebView.
            if (webViews[tabId] === view) destroyWebView(tabId)
            if (tabId == _activeId.value) {
                updateTab(tabId) { it.copy(isLoading = false, error = PageError(PageError.Kind.CRASHED, it.url.orEmpty())) }
            } else {
                // A background tab: it quietly comes back from its saved history when opened.
                updateTab(tabId) { it.copy(isLoading = false, progress = 0) }
            }
            return true
        }
    }

    private inner class ChromeClient(private val tabId: String) : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            updateTab(tabId) { it.copy(progress = newProgress, isLoading = newProgress < 100) }
        }

        override fun onReceivedTitle(view: WebView, title: String?) {
            val t = title.orEmpty()
            updateTab(tabId) { it.copy(title = t) }
            val tab = tab(tabId) ?: return
            val url = view.url
            if (!tab.isPrivate && url != null && UrlResolver.isWebUrl(url)) {
                viewModelScope.launch { runCatching { browsing.updateTitle(url, t) } }
            }
        }

        override fun onReceivedIcon(view: WebView, icon: Bitmap?) {
            if (icon == null) return
            // Shown on the tab only; it is stored when the page finishes (see onPageFinished).
            updateTab(tabId) { it.copy(favicon = icon) }
        }

        override fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
            if (_fullscreen.value != null) { callback.onCustomViewHidden(); return }
            _fullscreen.value = FullscreenVideo(view, callback)
        }

        override fun onHideCustomView() {
            _fullscreen.value = null
        }

        // WebView's default poster is a big grey play button; Chrome shows nothing until the
        // first frame arrives. A transparent poster matches Chrome.
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: WebChromeClient.FileChooserParams,
        ): Boolean {
            _fileChooser.value?.callback?.onReceiveValue(null)
            _fileChooser.value = FileChooserRequest(filePathCallback, fileChooserParams.createIntent())
            return true
        }

        // Camera, microphone, protected media and location: asked per site, like Chrome.
        override fun onPermissionRequest(request: PermissionRequest) {
            val origin = SecurityRepository.originOf(request.origin?.toString())
            val kinds = request.resources.mapNotNull { webResourceKind(it) }.distinct()
            if (origin == null || kinds.isEmpty() || pendingWebRequest != null || pendingGeo != null) { request.deny(); return }
            pendingWebRequest = request
            askPermission(tabId, origin, kinds)
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingWebRequest === request) { pendingWebRequest = null; _permissionAsk.value = null }
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            val site = SecurityRepository.originOf(origin)
            if (site == null || pendingWebRequest != null || pendingGeo != null) { callback.invoke(origin, false, false); return }
            pendingGeo = origin to callback
            askPermission(tabId, site, listOf(SiteKind.LOCATION))
        }

        override fun onGeolocationPermissionsHidePrompt() {
            if (pendingGeo != null) { pendingGeo = null; _permissionAsk.value = null }
        }
    }


    override fun onCleared() {
        releaseUndoWebView()
        webViews.keys.toList().forEach { destroyWebView(it) }
        webContext.baseContext = getApplication()
        super.onCleared()
    }

    companion object {
        /** How long a closed tab's page stays alive for Undo. */
        const val UNDO_KEEP_MS = 15_000L
        /** Silences a closed tab's audio and video while it waits for Undo. */
        const val PAUSE_MEDIA_JS = "document.querySelectorAll('video,audio').forEach(function(m){try{m.pause();}catch(e){}});"
        const val THUMB_WIDTH = 270
        const val PRIVATE_PROFILE = "nayon_private"

        fun desktopUserAgent(mobile: String): String = mobile
            .replace(Regex("""\(Linux; Android [^)]*\)"""), "(X11; Linux x86_64)")
            .replace(Regex("""Version/\S+ """), "")
            .replace(" Mobile", "")
    }
}

/**
 * Chrome lets a full-screen page lock the screen to landscape (screen.orientation.lock); WebView
 * rejects the call, and many video players stop right there (endless spinner). NAYON already
 * rotates full-screen video itself, so the lock is reported as done. Nothing is read or sent.
 */
private const val ORIENTATION_LOCK_SHIM = """(function(){try{var o=screen.orientation;if(!o||!o.lock)return;
var lock=o.lock.bind(o);o.lock=function(t){try{return lock(t).catch(function(){});}catch(e){return Promise.resolve();}};
if(o.unlock){var un=o.unlock.bind(o);o.unlock=function(){try{un();}catch(e){}};}}catch(e){}})();"""

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
import com.webtecit.nayon.feature.downloads.DownloadFiles
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
) : AndroidViewModel(app) {

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
        androidx.core.content.ContextCompat.registerReceiver(
            app, downloadReceiver, android.content.IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            androidx.core.content.ContextCompat.RECEIVER_EXPORTED,
        )
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
        _tabs.update { list -> list.toMutableList().apply { add(if (current >= 0) current + 1 else size, tab) } }
        _events.tryEmit(BrowserEvent.Message(
            if (private) R.string.opened_private_tab else R.string.opened_new_tab, action = EventAction.SwitchTab(id),
        ))
    }

    // ---- Recently closed (Undo) -----------------------------------------------------------

    private val recentlyClosed = ArrayDeque<Pair<Int, TabState>>()

    fun undoCloseTab() {
        val (index, tab) = recentlyClosed.removeLastOrNull() ?: return
        val restored = tab.copy(isLoading = false, progress = 0, canGoBack = false, canGoForward = false, error = null)
        _tabs.update { list -> list.toMutableList().apply { add(index.coerceIn(0, size), restored) } }
        selectTab(restored.id)
    }

    private val _showBrowser = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    /** Emits when a link arrives from another app, so the UI can return to the browser page. */
    val showBrowser: SharedFlow<Unit> = _showBrowser

    fun openExternalLink(url: String) {
        if (UrlResolver.isWebUrl(url)) { newTab(url); _showBrowser.tryEmit(Unit) }
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
     * Receives page scrolls of the active tab: (scrollY, dy, fingerDown, userDriven).
     * userDriven is false for scrolls the page makes by itself (text selection, anchors),
     * which must never move the toolbars.
     */
    var onActivePageScroll: ((Int, Int, Boolean, Boolean) -> Unit)? = null

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
        onActivePageScroll?.invoke(y, y - oldY, fingerDown, userDriven)
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
        if (previous != null && previous != id) webViews[previous]?.onPause()
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
        recentlyClosed.addLast(index to closing.copy(thumbnail = null))
        if (recentlyClosed.size > 10) recentlyClosed.removeFirst()
        destroyWebView(id)
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
        if (tab.url != null && !tab.showingHome) wv.loadUrl(tab.url)
        hibernateOldTabs()
        return wv
    }

    fun webViewOrNull(id: String): WebView? = webViews[id]

    /** Keeps at most [MAX_LIVE_WEBVIEWS] WebViews in memory. Others reload when reopened. */
    private fun hibernateOldTabs() {
        if (webViews.size <= MAX_LIVE_WEBVIEWS) return
        val active = _activeId.value
        webViews.keys.filter { it != active }
            .sortedBy { lastUsed[it] ?: 0L }
            .take(webViews.size - MAX_LIVE_WEBVIEWS)
            .forEach { id ->
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
        val wv = WebView(webContext)
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
            mediaPlaybackRequiresUserGesture = true
            setGeolocationEnabled(false)
            if (tab.isPrivate) cacheMode = WebSettings.LOAD_NO_CACHE
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(wv.settings, true)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, false)
        wv.isFocusable = true
        wv.isFocusableInTouchMode = true
        wv.webViewClient = Client(tab.id)
        wv.webChromeClient = ChromeClient(tab.id)
        wv.setOnScrollChangeListener { _, _, y, _, oldY -> onWebScroll(tab.id, y, oldY) }
        wv.setOnTouchListener { _, e -> onWebTouch(tab.id, e.actionMasked); false }
        wv.setOnLongClickListener { onLongPress(tab.id, wv) }
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
        if (!UrlResolver.isWebUrl(url)) {
            _events.tryEmit(BrowserEvent.Message(R.string.download_unsupported)); return
        }
        val app = getApplication<Application>()
        val name = URLUtil.guessFileName(url, disposition, mime)
        val request = runCatching {
            DownloadManager.Request(url.toUri()).apply {
                setMimeType(mime)
                setTitle(name)
                userAgent?.let { addRequestHeader("User-Agent", it) }
                if (!private) CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                } else {
                    // App-specific folder: needs no storage permission on Android 7–9.
                    setDestinationInExternalFilesDir(app, Environment.DIRECTORY_DOWNLOADS, name)
                }
            }
        }.getOrNull()
        val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
        if (request == null || dm == null || runCatching { dm.enqueue(request) }.isFailure) {
            _events.tryEmit(BrowserEvent.Message(R.string.download_failed))
        } else {
            _events.tryEmit(BrowserEvent.Message(R.string.download_started, name, action = EventAction.ShowDownloads))
        }
    }

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
            updateTab(tabId) { it.copy(isLoading = false, progress = 100, url = url, title = view.title ?: it.title) }
            syncNavState(tabId, view)
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
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
            // The page's renderer crashed or was killed to free memory. Drop this WebView and offer a reload.
            if (webViews[tabId] === view) destroyWebView(tabId)
            updateTab(tabId) { it.copy(isLoading = false, error = PageError(PageError.Kind.CRASHED, it.url.orEmpty())) }
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
            updateTab(tabId) { it.copy(favicon = icon) }
            val tab = tab(tabId) ?: return
            val host = UrlResolver.displayHost(view.url)
            if (!tab.isPrivate && host.isNotBlank()) viewModelScope.launch { favicons.save(host, icon) }
        }

        override fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
            if (_fullscreen.value != null) { callback.onCustomViewHidden(); return }
            _fullscreen.value = FullscreenVideo(view, callback)
        }

        override fun onHideCustomView() {
            _fullscreen.value = null
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: WebChromeClient.FileChooserParams,
        ): Boolean {
            _fileChooser.value?.callback?.onReceiveValue(null)
            _fileChooser.value = FileChooserRequest(filePathCallback, fileChooserParams.createIntent())
            return true
        }

        // Camera, microphone and location for websites arrive in Stage 3 with proper prompts.
        override fun onPermissionRequest(request: PermissionRequest) {
            request.deny()
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            callback.invoke(origin, false, false)
        }
    }

    // Lazy: it is first used from init, before properties declared below are initialised.
    private val downloadReceiver by lazy { object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id < 0) return
            val info = DownloadFiles.info(context, id) ?: return
            if (info.second) {
                _events.tryEmit(BrowserEvent.Message(R.string.download_complete, info.first, action = EventAction.OpenDownload(id)))
            } else {
                _events.tryEmit(BrowserEvent.Message(R.string.download_failed_named, info.first, action = EventAction.ShowDownloads))
            }
        }
    } }

    override fun onCleared() {
        runCatching { getApplication<Application>().unregisterReceiver(downloadReceiver) }
        webViews.keys.toList().forEach { destroyWebView(it) }
        webContext.baseContext = getApplication()
        super.onCleared()
    }

    companion object {
        const val MAX_LIVE_WEBVIEWS = 4
        const val THUMB_WIDTH = 270
        const val PRIVATE_PROFILE = "nayon_private"

        fun desktopUserAgent(mobile: String): String = mobile
            .replace(Regex("""\(Linux; Android [^)]*\)"""), "(X11; Linux x86_64)")
            .replace(Regex("""Version/\S+ """), "")
            .replace(" Mobile", "")
    }
}

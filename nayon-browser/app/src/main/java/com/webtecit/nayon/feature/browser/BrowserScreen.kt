package com.webtecit.nayon.feature.browser

import com.webtecit.nayon.core.browser.UrlResolver
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Build
import android.os.SystemClock
import android.speech.RecognizerIntent
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.settings.ToolbarLayout
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val TopBarHeight = 56.dp
private val BottomBarHeight = 52.dp

@Composable
fun BrowserScreen(
    viewModel: BrowserViewModel,
    onOpenTabs: () -> Unit,
    onOpenBookmarks: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenDownloads: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val tab by viewModel.activeTab.collectAsStateWithLifecycle()
    val tabs by viewModel.tabs.collectAsStateWithLifecycle()
    val prefs by viewModel.preferences.collectAsStateWithLifecycle()
    val bookmarked by viewModel.bookmarkedUrls.collectAsStateWithLifecycle()
    val recent by viewModel.recentSites.collectAsStateWithLifecycle()
    val fullscreen by viewModel.fullscreen.collectAsStateWithLifecycle()
    val fileChooser by viewModel.fileChooser.collectAsStateWithLifecycle()
    val find by viewModel.find.collectAsStateWithLifecycle()
    val shortcuts by viewModel.shortcuts.collectAsStateWithLifecycle()
    var showLens by rememberSaveable { mutableStateOf(false) }
    var showAccount by rememberSaveable { mutableStateOf(false) }
    var aiMode by remember { mutableStateOf(false) }
    val contextTarget by viewModel.contextMenu.collectAsStateWithLifecycle()
    val googleAccount by viewModel.googleAccount.collectAsStateWithLifecycle()

    val focusRequester = remember { FocusRequester() }
    var editing by remember { mutableStateOf(false) }
    var typed by remember { mutableStateOf("") }
    var fillRequest by remember { mutableStateOf<String?>(null) }
    var showMenu by rememberSaveable { mutableStateOf(false) }
    var showPageInfo by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    val voiceIntent = remember {
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    }
    val voiceAvailable = remember { context.packageManager.queryIntentActivities(voiceIntent, 0).isNotEmpty() }
    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (result.resultCode == Activity.RESULT_OK && !spoken.isNullOrBlank()) {
            focusManager.clearFocus(); viewModel.navigate(spoken)
        }
    }
    val fileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        viewModel.onFileChooserResult(result.resultCode, result.data)
    }

    LaunchedEffect(fileChooser) {
        val request = fileChooser ?: return@LaunchedEffect
        try { fileLauncher.launch(request.intent) } catch (e: ActivityNotFoundException) { viewModel.onFileChooserFailed() }
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    var askedNotifications by rememberSaveable { mutableStateOf(false) }
    val viewLabel = stringResource(R.string.action_view)
    val openLabel = stringResource(R.string.downloads_open)
    val switchLabel = stringResource(R.string.action_switch)
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is BrowserEvent.Message -> {
                    if (event.text == R.string.download_started && !askedNotifications && Build.VERSION.SDK_INT >= 33 &&
                        androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) !=
                        android.content.pm.PackageManager.PERMISSION_GRANTED
                    ) {
                        askedNotifications = true
                        notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    }
                    val text = if (event.arg != null) context.getString(event.text, event.arg) else context.getString(event.text)
                    val label = when (event.action) {
                        EventAction.ShowDownloads -> viewLabel
                        is EventAction.OpenDownload -> openLabel
                        is EventAction.SwitchTab -> switchLabel
                        null -> null
                    }
                    val result = snackbar.showSnackbar(text, actionLabel = label, duration = SnackbarDuration.Short)
                    if (result == SnackbarResult.ActionPerformed) {
                        when (val a = event.action) {
                            EventAction.ShowDownloads -> onOpenDownloads()
                            is EventAction.OpenDownload -> viewModel.openDownload(a.id)
                            is EventAction.SwitchTab -> viewModel.selectTab(a.id)
                            null -> Unit
                        }
                    }
                }
            }
        }
    }

    fun startVoice() {
        try { voiceLauncher.launch(voiceIntent) } catch (e: ActivityNotFoundException) { /* hidden when unavailable */ }
    }

    // Google Lens: our own camera screen (like Chrome's), or a gallery photo, handed to Google Lens.
    fun sendToLens(uri: android.net.Uri) {
        showLens = false
        if (!GoogleLens.search(context, uri)) {
            android.widget.Toast.makeText(context, R.string.lens_no_google, android.widget.Toast.LENGTH_LONG).show()
            viewModel.newTab(GoogleLens.WEB)
        }
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(::sendToLens) }
    fun pickFromGallery() {
        showLens = false
        runCatching { pickImage.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    }
    fun openLens() {
        focusManager.clearFocus()
        showLens = true
    }

    fun submit(text: String) {
        val ai = aiMode
        focusManager.clearFocus()
        // In AI Mode, anything that isn't a web address is a question for AI Mode.
        val isQuestion = UrlResolver.resolve(text.trim(), "nayon-ai:%s")?.startsWith("nayon-ai:") != false
        if (ai && isQuestion) viewModel.aiSearch(text) else viewModel.navigate(text)
    }

    val homeActions = remember(viewModel) {
        HomeActions(
            onSearchClick = { focusRequester.requestFocus() },
            onVoiceClick = { startVoice() },
            onLensClick = { openLens() },
            onOpenUrl = viewModel::openInCurrentTab,
            onSeeHistory = onOpenHistory,
            onOpenBookmarks = onOpenBookmarks,
            onOpenDownloads = onOpenDownloads,
            onNewPrivateTab = { viewModel.newTab(private = true) },
            onOpenAbout = onOpenAbout,
            onAddShortcut = { l, u -> viewModel.addShortcut(l, u) },
            onRemoveShortcut = { viewModel.removeShortcut(it) },
            onRemoveRecent = { viewModel.removeFromHistory(it) },
            onAccount = { showAccount = true },
            onAiMode = { aiMode = true; focusRequester.requestFocus() },
        )
    }

    BackHandler(enabled = editing) { focusManager.clearFocus() }
    BackHandler(enabled = !editing && find != null) { viewModel.stopFind() }
    BackHandler(enabled = !editing && tab?.let { (it.showingHome && it.url != null) || (!it.showingHome && it.canGoBack) } == true) {
        viewModel.goBack()
    }

    // ---- Collapsing toolbars: they slide with the finger; the page is never resized mid-scroll.
    val compact = prefs.toolbarLayout == ToolbarLayout.TOP
    val onWebPage = tab?.isWebPage == true
    val topH = with(density) { TopBarHeight.toPx() }
    val bottomH = if (compact) 0f else with(density) { BottomBarHeight.toPx() }
    val barOffset = remember { Animatable(0f) }          // 0 = shown, -topH = hidden
    var tallPage by remember { mutableStateOf(false) }   // page extends under the hidden bars
    val collapsible = onWebPage && !editing && prefs.hideToolbarsOnScroll && tab?.error == null && find == null

    LaunchedEffect(collapsible) {
        if (!collapsible && barOffset.value != 0f) { barOffset.animateTo(0f, tween(160)); tallPage = false }
    }
    LaunchedEffect(Unit) {
        viewModel.showBarsRequests.collect { if (barOffset.value != 0f) barOffset.animateTo(0f, tween(160)); tallPage = false }
    }
    // Bars move only after the finger lifts (or during a fling). Moving the page under a
    // finger makes it shake, and page-made scrolls (text selection) must not move them.
    DisposableEffect(collapsible, topH) {
        var run = 0
        var hidden = false
        fun hide() {
            if (hidden) return
            hidden = true
            tallPage = true
            scope.launch { barOffset.animateTo(-topH, tween(200)) }
        }
        fun show() {
            if (!hidden && barOffset.value == 0f) return
            hidden = false
            scope.launch { barOffset.animateTo(0f, tween(200)); tallPage = false }
        }
        fun decide() {
            val threshold = with(density) { 24.dp.toPx() }
            if (run > threshold) hide() else if (run < -threshold) show()
        }
        if (collapsible) {
            // Short pages (like Google's home page) would stop being scrollable once the bars
            // hide, snap back and show the bars again: a shaking loop. Only pages with room
            // for well over the bars' height collapse them.
            val minRoom = (topH + bottomH) * 3
            viewModel.onActivePageScroll = { y, dy, fingerDown, userDriven, room ->
                when {
                    y <= 0 -> { run = 0; show() }
                    !userDriven || dy == 0 -> Unit
                    !hidden && room < minRoom -> run = 0
                    else -> {
                        if ((dy > 0) != (run > 0)) run = 0
                        run += dy
                        if (!fingerDown) decide()   // fling after the finger lifted
                    }
                }
            }
            viewModel.onActiveGestureEnd = { decide() }
        } else {
            viewModel.onActivePageScroll = null
            viewModel.onActiveGestureEnd = null
        }
        onDispose {
            viewModel.onActivePageScroll = null
            viewModel.onActiveGestureEnd = null
        }
    }

    val scheme = MaterialTheme.colorScheme
    val barColor = if (tab?.isPrivate == true) scheme.surfaceContainerHigh else scheme.surface
    val tabCount = tabs.count { it.isPrivate == (tab?.isPrivate == true) }
    val openTabs = { viewModel.captureActiveThumbnail(); onOpenTabs() }
    val fullHeightPage = onWebPage && prefs.hideToolbarsOnScroll

    Box(Modifier.fillMaxSize().background(barColor)) {
        Box(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom))
                .clipToBounds(),
        ) {
            // Page / home content, placed under the visible part of the top bar.
            Box(
                Modifier
                    .fillMaxSize()
                    .background(scheme.surface)
                    .layout { measurable, constraints ->
                        val h = if (fullHeightPage && tallPage) constraints.maxHeight
                        else (constraints.maxHeight - topH - bottomH).roundToInt().coerceAtLeast(0)
                        val placeable = measurable.measure(constraints.copy(minHeight = h, maxHeight = h))
                        layout(constraints.maxWidth, constraints.maxHeight) {
                            placeable.place(0, (topH + barOffset.value).roundToInt())
                        }
                    },
            ) {
                val current = tab
                if (current != null) {
                    AnimatedContent(
                        targetState = current.id to current.showingHome,
                        transitionSpec = {
                            (fadeIn(tween(200, delayMillis = 40)) + scaleIn(tween(220), initialScale = 0.97f))
                                .togetherWith(fadeOut(tween(120)))
                        },
                        label = "tab-content",
                    ) { (id, home) ->
                        if (home) {
                            LaunchedEffect(current.id, current.url, showAccount) { viewModel.refreshGoogleAccount() }
                            NewTabPage(
                                isPrivate = current.isPrivate,
                                showShortcuts = prefs.showShortcuts,
                                shortcuts = shortcuts,
                                recent = if (prefs.showRecentOnHome) recent else emptyList(),
                                privateIsolationSupported = viewModel.privateIsolationSupported,
                                voiceAvailable = voiceAvailable,
                                actions = homeActions,
                                searchEngine = prefs.searchEngine,
                                googleSignedIn = remember(current.id, current.url, showAccount, googleAccount) { viewModel.googleSignedIn() },
                                googleAccount = googleAccount,
                            )
                        } else {
                            Box(Modifier.fillMaxSize()) {
                                WebViewHost(
                                    viewModel = viewModel,
                                    tabId = id,
                                    pullToRefresh = prefs.pullToRefresh,
                                    refreshing = current.id == id && current.isLoading,
                                )
                                val err = tabs.firstOrNull { it.id == id }?.error
                                if (err != null) PageErrorView(err, onRetry = viewModel::reload)
                            }
                        }
                    }
                }
                if (editing) {
                    SearchPanel(
                        viewModel = viewModel,
                        tab = tab,
                        query = typed,
                        onSearch = ::submit,
                        onOpen = { url -> focusManager.clearFocus(); viewModel.openInCurrentTab(url) },
                        onFill = { fillRequest = it },
                        onShare = { tab?.let { sharePage(context, it) } },
                        onCopy = { tab?.url?.let { copyLink(context, it) } },
                    )
                }
                SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(Spacing.md))
            }

            // Top bar, sliding up as the page scrolls. Find-in-page replaces it while active.
            val findState = find
            if (findState != null) {
                FindBar(
                    state = findState,
                    onQuery = viewModel::findQuery,
                    onNext = { viewModel.findNext(true) },
                    onPrevious = { viewModel.findNext(false) },
                    onClose = viewModel::stopFind,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else TopToolbar(
                tab = tab,
                tabCount = tabCount,
                compact = compact,
                focusRequester = focusRequester,
                voiceAvailable = voiceAvailable,
                fillRequest = fillRequest,
                onFillConsumed = { fillRequest = null },
                onFocusChange = { editing = it; if (!it) aiMode = false },
                aiMode = aiMode,
                onTextChange = { typed = it },
                onSubmit = ::submit,
                onVoice = ::startVoice,
                onLens = ::openLens,
                onReload = viewModel::reload,
                onStop = viewModel::stopLoading,
                onHome = viewModel::goHome,
                onNewTab = { viewModel.newTab(private = tab?.isPrivate == true) },
                onTabs = openTabs,
                onMenu = { showMenu = true },
                onSiteInfo = { showPageInfo = true },
                modifier = Modifier.fillMaxWidth().graphicsLayer { translationY = barOffset.value },
            )

            // Optional bottom bar, sliding down together with the top bar.
            if (!compact && !editing) {
                BrowserToolbar(
                    tab = tab,
                    tabCount = tabCount,
                    onBack = { viewModel.goBack() },
                    onForward = viewModel::goForward,
                    onHome = viewModel::goHome,
                    onTabs = openTabs,
                    onMenu = { showMenu = true },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .graphicsLayer { translationY = -barOffset.value / topH * bottomH },
                )
            }
        }

        fullscreen?.let { FullscreenVideoEffect(it, viewModel, onExit = viewModel::exitFullscreen) }
    }

    if (showMenu) {
        BrowserMenuSheet(
            tab = tab,
            isBookmarked = tab?.url?.let { it in bookmarked } == true,
            onDismiss = { showMenu = false },
            onAction = { action ->
                when (action) {
                    MenuAction.NEW_TAB -> viewModel.newTab()
                    MenuAction.NEW_PRIVATE_TAB -> viewModel.newTab(private = true)
                    MenuAction.BOOKMARKS -> onOpenBookmarks()
                    MenuAction.HISTORY -> onOpenHistory()
                    MenuAction.DOWNLOADS -> onOpenDownloads()
                    MenuAction.SETTINGS -> onOpenSettings()
                    MenuAction.TOGGLE_BOOKMARK -> viewModel.toggleBookmark()
                    MenuAction.SHARE -> tab?.let { sharePage(context, it) }
                    MenuAction.COPY_LINK -> tab?.url?.let { copyLink(context, it) }
                    MenuAction.DESKTOP -> viewModel.toggleDesktopMode()
                    MenuAction.DUPLICATE -> tab?.let { viewModel.duplicateTab(it.id) }
                    MenuAction.FORWARD -> viewModel.goForward()
                    MenuAction.RELOAD -> viewModel.reload()
                    MenuAction.SITE_INFO -> showPageInfo = true
                    MenuAction.FIND -> viewModel.startFind()
                    MenuAction.TRANSLATE -> viewModel.translatePage()
                    MenuAction.ADD_TO_HOME -> tab?.let { addToHomeScreen(context, it) }
                }
            },
        )
    }

    if (showAccount) {
        GoogleAccountSheet(
            signedIn = remember { viewModel.googleSignedIn() },
            account = googleAccount,
            onOpen = { url -> if (tab?.isPrivate == true) viewModel.newTab(url) else viewModel.openInCurrentTab(url) },
            onDismiss = { showAccount = false },
        )
    }

    if (showLens) {
        LensCamera(onClose = { showLens = false }, onPhoto = ::sendToLens, onGallery = ::pickFromGallery)
    }

    contextTarget?.let { target ->
        LinkContextSheet(
            target = target,
            onDismiss = viewModel::dismissContextMenu,
            onOpenNewTab = { viewModel.openInBackground(it) },
            onOpenPrivate = { viewModel.openInBackground(it, private = true) },
            onOpenHere = { viewModel.openInCurrentTab(it) },
            onCopy = { copyLink(context, it) },
            onCopyText = { copyText(context, it) },
            onDownload = { viewModel.downloadUrl(it, target.isPrivate) },
            onShare = { url -> shareText(context, url) },
            onLens = { url -> viewModel.newTab(LENS_BY_URL + java.net.URLEncoder.encode(url, "UTF-8")) },
        )
    }

    val infoTab = tab
    if (showPageInfo && infoTab != null && infoTab.isWebPage) {
        PageInfoSheet(
            tab = infoTab,
            certificate = remember(infoTab.id, infoTab.url) { viewModel.certificateFor(infoTab.id) },
            cookieCount = remember(infoTab.url) { viewModel.cookieCount(infoTab.url) },
            javaScriptEnabled = prefs.javaScriptEnabled,
            onClearSiteData = { infoTab.url?.let(viewModel::clearSiteData) },
            onDismiss = { showPageInfo = false },
        )
    }
}

private const val LENS_BY_URL = "https://lens.google.com/uploadbyurl?url="

/** Hosts the tab's WebView inside a pull-to-refresh container. */
@Composable
private fun WebViewHost(viewModel: BrowserViewModel, tabId: String, pullToRefresh: Boolean, refreshing: Boolean) {
    val scheme = MaterialTheme.colorScheme
    val spinnerColor = scheme.primary.toArgb()
    val spinnerBackground = scheme.surfaceContainerHighest.toArgb()
    AndroidView(
        factory = { ctx ->
            SwipeRefreshLayout(ctx).apply {
                addView(FrameLayout(ctx), ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                setOnRefreshListener { viewModel.reload() }
                // Refresh only when the pull goes past the top of the page itself, like Chrome. Pages
                // that scroll an inner panel (AI Mode, maps, chats) keep their own scrolling.
                setOnChildScrollUpCallback { _, _ ->
                    val wv = viewModel.webViewOrNull(tabId) ?: return@setOnChildScrollUpCallback false
                    wv.canScrollVertically(-1) || (wv as? NayonWebView)?.pulledPastTop == false
                }
            }
        },
        update = { layout ->
            val container = (0 until layout.childCount).map { layout.getChildAt(it) }.filterIsInstance<FrameLayout>().first()
            val webView = viewModel.ensureWebView(tabId)
            if (webView != null && container.getChildAt(0) !== webView) {
                (webView.parent as? ViewGroup)?.removeView(webView)
                container.removeAllViews()
                container.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
            layout.isEnabled = pullToRefresh
            layout.setColorSchemeColors(spinnerColor)
            layout.setProgressBackgroundColorSchemeColor(spinnerBackground)
            if (!refreshing && layout.isRefreshing) layout.isRefreshing = false
        },
        onRelease = { layout ->
            (0 until layout.childCount).map { layout.getChildAt(it) }.filterIsInstance<FrameLayout>().forEach { it.removeAllViews() }
        },
        modifier = Modifier.fillMaxSize(),
    )
}

/**
 * Website full-screen video. The video view is attached straight to the window (outside
 * Compose) so rotation and re-layout never interrupt playback. The site's own controls stay
 * fully usable. Orientation follows the video's shape, like Chrome.
 */
@Composable
private fun FullscreenVideoEffect(video: FullscreenVideo, viewModel: BrowserViewModel, onExit: () -> Unit) {
    val view = LocalView.current
    BackHandler(onBack = onExit)
    DisposableEffect(video) {
        val activity = view.context.findActivity()
        val window = activity?.window
        val decor = window?.decorView as? FrameLayout
        val holder = FrameLayout(view.context).apply { setBackgroundColor(android.graphics.Color.BLACK) }
        (video.view.parent as? ViewGroup)?.removeView(video.view)
        holder.addView(video.view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        decor?.addView(holder, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val previousCutout = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) window?.attributes?.layoutInDisplayCutoutMode else null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && window != null) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        val previousOrientation = activity?.requestedOrientation ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        // Landscape straight away, like Chrome. Only a video known to be tall (Shorts-style)
        // follows the phone's sensor instead, so turning the phone still rotates it even when
        // auto-rotate is off.
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        viewModel.activeWebView()?.evaluateJavascript(VIDEO_SIZE_JS) { result ->
            val parts = result?.trim('"')?.split('x')?.mapNotNull { it.toIntOrNull() }
            val tall = parts != null && parts.size == 2 && parts[0] > 0 && parts[1] > parts[0] * 1.05
            if (tall && activity != null) activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR
        }

        onDispose {
            decor?.removeView(holder)
            holder.removeAllViews()
            controller?.show(WindowInsetsCompat.Type.systemBars())
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && window != null && previousCutout != null) {
                window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = previousCutout }
            }
            activity?.requestedOrientation = previousOrientation
        }
    }
}

/** Reads the full-screen video's natural size, e.g. "1920x1080". Read-only; no page changes. */
private const val VIDEO_SIZE_JS = """(function(){var e=document.fullscreenElement||document.webkitFullscreenElement;
if(!e||e.tagName==='IFRAME')return '';var vs=e.tagName==='VIDEO'?[e]:Array.prototype.slice.call(e.querySelectorAll('video'));
var b=null,a=0;vs.forEach(function(v){var r=v.getBoundingClientRect(),s=r.width*r.height;if(v.videoWidth&&s>a){a=s;b=v;}});
return b?b.videoWidth+'x'+b.videoHeight:'';})()"""

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

fun sharePage(context: Context, tab: TabState) {
    val url = tab.url ?: return
    val send = Intent(Intent.ACTION_SEND).setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, url)
        .putExtra(Intent.EXTRA_SUBJECT, tab.title)
    runCatching { context.startActivity(Intent.createChooser(send, context.getString(R.string.share_page_via))) }
}

fun copyLink(context: Context, url: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    cm.setPrimaryClip(ClipData.newPlainText("URL", url))
    if (Build.VERSION.SDK_INT < 33) {
        android.widget.Toast.makeText(context, R.string.link_copied, android.widget.Toast.LENGTH_SHORT).show()
    }
}

fun copyText(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    cm.setPrimaryClip(ClipData.newPlainText("Text", text))
    if (Build.VERSION.SDK_INT < 33) {
        android.widget.Toast.makeText(context, R.string.text_copied, android.widget.Toast.LENGTH_SHORT).show()
    }
}

fun shareText(context: Context, text: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
    runCatching { context.startActivity(Intent.createChooser(send, context.getString(R.string.share_page_via))) }
}

/** Pins the page to the home screen; tapping it opens the page in NAYON Browser. */
fun addToHomeScreen(context: Context, tab: TabState) {
    val url = tab.url ?: return
    if (!androidx.core.content.pm.ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
        android.widget.Toast.makeText(context, R.string.add_to_home_unsupported, android.widget.Toast.LENGTH_SHORT).show()
        return
    }
    val intent = Intent(Intent.ACTION_VIEW, url.toUri()).setClass(context, com.webtecit.nayon.MainActivity::class.java)
    val icon = tab.favicon?.let { fav ->
        val size = 192
        val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bmp)
        canvas.drawColor(android.graphics.Color.WHITE)
        val inset = size / 4
        canvas.drawBitmap(fav, null, android.graphics.Rect(inset, inset, size - inset, size - inset),
            android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
        androidx.core.graphics.drawable.IconCompat.createWithAdaptiveBitmap(bmp)
    } ?: androidx.core.graphics.drawable.IconCompat.createWithResource(context, R.mipmap.ic_launcher)
    val label = tab.title.ifBlank { com.webtecit.nayon.core.browser.UrlResolver.displayHost(url) }.take(25)
    val info = androidx.core.content.pm.ShortcutInfoCompat.Builder(context, "page:" + url.hashCode())
        .setShortLabel(label)
        .setIcon(icon)
        .setIntent(intent)
        .build()
    androidx.core.content.pm.ShortcutManagerCompat.requestPinShortcut(context, info, null)
}

package com.webtecit.nayon.feature.browser

import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.speech.RecognizerIntent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.content.pm.ActivityInfo
import android.os.Build
import android.view.WindowManager
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.outlined.FullscreenExit
import androidx.compose.material.icons.outlined.ScreenRotation
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.webtecit.nayon.data.settings.ToolbarLayout
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.CallMade
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing

@Composable
fun BrowserScreen(
    viewModel: BrowserViewModel,
    onOpenTabs: () -> Unit,
    onOpenBookmarks: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val tab by viewModel.activeTab.collectAsStateWithLifecycle()
    val tabs by viewModel.tabs.collectAsStateWithLifecycle()
    val prefs by viewModel.preferences.collectAsStateWithLifecycle()
    val bookmarked by viewModel.bookmarkedUrls.collectAsStateWithLifecycle()
    val recent by viewModel.recentSites.collectAsStateWithLifecycle()
    val fullscreen by viewModel.fullscreen.collectAsStateWithLifecycle()
    val fileChooser by viewModel.fileChooser.collectAsStateWithLifecycle()
    val barsVisible by viewModel.barsVisible.collectAsStateWithLifecycle()

    val focusRequester = remember { FocusRequester() }
    var editing by remember { mutableStateOf(false) }
    var typed by remember { mutableStateOf("") }
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
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is BrowserEvent.Message -> snackbar.showSnackbar(
                    if (event.arg != null) context.getString(event.text, event.arg) else context.getString(event.text),
                )
            }
        }
    }

    fun startVoice() {
        try { voiceLauncher.launch(voiceIntent) } catch (e: ActivityNotFoundException) { /* button hidden when unavailable */ }
    }

    fun submit(text: String) {
        focusManager.clearFocus()
        viewModel.navigate(text)
    }

    BackHandler(enabled = editing) { focusManager.clearFocus() }
    BackHandler(enabled = !editing && tab?.let { (it.showingHome && it.url != null) || (!it.showingHome && it.canGoBack) } == true) {
        viewModel.goBack()
    }

    val compact = prefs.toolbarLayout == ToolbarLayout.TOP
    val onWebPage = tab?.isWebPage == true
    val showBars = barsVisible || editing || !onWebPage || !prefs.hideToolbarsOnScroll
    val barColor = if (tab?.isPrivate == true) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surface
    val tabCount = tabs.count { it.isPrivate == (tab?.isPrivate == true) }
    val openTabs = { viewModel.captureActiveThumbnail(); onOpenTabs() }

    Box(Modifier.fillMaxSize().background(barColor)) {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom)),
        ) {
            AnimatedVisibility(
                visible = showBars,
                enter = expandVertically(tween(BAR_ANIM_MS), expandFrom = Alignment.Top),
                exit = shrinkVertically(tween(BAR_ANIM_MS), shrinkTowards = Alignment.Top),
            ) {
                TopToolbar(
                    tab = tab,
                    tabCount = tabCount,
                    compact = compact,
                    focusRequester = focusRequester,
                    voiceAvailable = voiceAvailable,
                    onFocusChange = { editing = it },
                    onTextChange = { typed = it },
                    onSubmit = ::submit,
                    onVoice = ::startVoice,
                    onReload = viewModel::reload,
                    onStop = viewModel::stopLoading,
                    onHome = viewModel::goHome,
                    onNewTab = { viewModel.newTab(private = tab?.isPrivate == true) },
                    onTabs = openTabs,
                    onMenu = { showMenu = true },
                    onSiteInfo = { showPageInfo = true },
                )
            }
            Box(Modifier.weight(1f).fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
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
                            NewTabPage(
                                isPrivate = current.isPrivate,
                                showShortcuts = prefs.showShortcuts,
                                recent = if (prefs.showRecentOnHome) recent else emptyList(),
                                privateIsolationSupported = viewModel.privateIsolationSupported,
                                voiceAvailable = voiceAvailable,
                                onSearchClick = { focusRequester.requestFocus() },
                                onVoiceClick = ::startVoice,
                                onOpenUrl = viewModel::openInCurrentTab,
                                onSeeHistory = onOpenHistory,
                                onOpenAbout = onOpenAbout,
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
                    SuggestionsPanel(viewModel, typed, onSearch = ::submit, onOpen = { url ->
                        focusManager.clearFocus(); viewModel.openInCurrentTab(url)
                    })
                }
                SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(Spacing.md))
            }
            AnimatedVisibility(
                visible = !compact && !editing && showBars,
                enter = expandVertically(tween(BAR_ANIM_MS), expandFrom = Alignment.Bottom),
                exit = shrinkVertically(tween(BAR_ANIM_MS), shrinkTowards = Alignment.Bottom),
            ) {
                BrowserToolbar(
                    tab = tab,
                    tabCount = tabCount,
                    onBack = { viewModel.goBack() },
                    onForward = viewModel::goForward,
                    onHome = viewModel::goHome,
                    onTabs = openTabs,
                    onMenu = { showMenu = true },
                )
            }
        }

        fullscreen?.let { FullscreenVideoLayer(it, onExit = viewModel::exitFullscreen) }
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
                    MenuAction.DOWNLOADS -> openSystemDownloads(context)
                    MenuAction.SETTINGS -> onOpenSettings()
                    MenuAction.TOGGLE_BOOKMARK -> viewModel.toggleBookmark()
                    MenuAction.SHARE -> tab?.let { sharePage(context, it) }
                    MenuAction.COPY_LINK -> tab?.url?.let { copyLink(context, it) }
                    MenuAction.DESKTOP -> viewModel.toggleDesktopMode()
                    MenuAction.DUPLICATE -> tab?.let { viewModel.duplicateTab(it.id) }
                    MenuAction.FORWARD -> viewModel.goForward()
                    MenuAction.RELOAD -> viewModel.reload()
                    MenuAction.SITE_INFO -> showPageInfo = true
                }
            },
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

private const val BAR_ANIM_MS = 180

/**
 * Hosts the tab's WebView inside a pull-to-refresh container. The WebView is owned by the
 * ViewModel and survives recomposition and tab switches.
 */
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
                // Only pull to refresh when the page itself is scrolled to the very top.
                setOnChildScrollUpCallback { _, _ -> viewModel.webViewOrNull(tabId)?.canScrollVertically(-1) ?: false }
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

@Composable
private fun SuggestionsPanel(viewModel: BrowserViewModel, query: String, onSearch: (String) -> Unit, onOpen: (String) -> Unit) {
    val flow = remember(query) { viewModel.suggestionsFor(query) }
    val suggestions by flow.collectAsState(initial = emptyList())
    LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
        if (query.isNotBlank()) {
            item {
                SuggestionRow(
                    leading = { Icon(Icons.Outlined.Search, null, tint = MaterialTheme.colorScheme.primary) },
                    title = stringResource(R.string.search_for, query.trim()),
                    subtitle = null,
                    onClick = { onSearch(query) },
                )
            }
        }
        items(suggestions, key = { it.url }) { s ->
            SuggestionRow(
                leading = { SiteIcon(s.url, s.title, size = 32.dp) },
                title = s.title.ifBlank { UrlResolver.displayHost(s.url) },
                subtitle = s.url,
                onClick = { onOpen(s.url) },
            )
        }
    }
}

@Composable
private fun SuggestionRow(leading: @Composable () -> Unit, title: String, subtitle: String?, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) { leading() }
        Spacer(Modifier.width(Spacing.lg))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Icon(Icons.AutoMirrored.Outlined.CallMade, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
}

/**
 * Shows a website's full-screen video: hides the system bars, turns to landscape, keeps the
 * screen on and uses the display-cutout area. A rotate button appears briefly for portrait videos.
 */
@Composable
private fun FullscreenVideoLayer(video: FullscreenVideo, onExit: () -> Unit) {
    val view = LocalView.current
    val activity = remember(view) { view.context.findActivity() }
    var landscape by rememberSaveable { mutableStateOf(true) }
    var controlsVisible by remember { mutableStateOf(true) }
    BackHandler(onBack = onExit)

    DisposableEffect(video, activity) {
        val window = activity?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val previousOrientation = activity?.requestedOrientation ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        val previousCutout = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) window?.attributes?.layoutInDisplayCutoutMode else null
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && window != null) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        onDispose {
            controller?.show(WindowInsetsCompat.Type.systemBars())
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            activity?.requestedOrientation = previousOrientation
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && window != null && previousCutout != null) {
                window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = previousCutout }
            }
        }
    }
    LaunchedEffect(landscape, activity) {
        activity?.requestedOrientation = if (landscape) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        else ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
    }
    LaunchedEffect(controlsVisible) {
        if (controlsVisible) { kotlinx.coroutines.delay(3500); controlsVisible = false }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx ->
                FrameLayout(ctx).apply {
                    setBackgroundColor(android.graphics.Color.BLACK)
                    (video.view.parent as? ViewGroup)?.removeView(video.view)
                    addView(video.view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                    // Any touch on the video brings the NAYON controls back briefly.
                    setOnHierarchyChangeListener(null)
                }
            },
            onRelease = { it.removeAllViews() },
            modifier = Modifier.fillMaxSize().pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)
                        controlsVisible = true
                    }
                }
            },
        )
        AnimatedVisibility(
            visible = controlsVisible,
            enter = fadeIn(), exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopEnd).padding(Spacing.md),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                FullscreenButton(Icons.Outlined.ScreenRotation, stringResource(R.string.action_rotate)) { landscape = !landscape }
                FullscreenButton(Icons.Outlined.FullscreenExit, stringResource(R.string.action_exit_fullscreen), onExit)
            }
        }
    }
}

@Composable
private fun FullscreenButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, label, tint = Color.White) }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is android.content.ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun sharePage(context: Context, tab: TabState) {
    val url = tab.url ?: return
    val send = Intent(Intent.ACTION_SEND).setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, url)
        .putExtra(Intent.EXTRA_SUBJECT, tab.title)
    runCatching { context.startActivity(Intent.createChooser(send, context.getString(R.string.share_page_via))) }
}

private fun copyLink(context: Context, url: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    cm.setPrimaryClip(ClipData.newPlainText("URL", url))
    if (android.os.Build.VERSION.SDK_INT < 33) {
        android.widget.Toast.makeText(context, R.string.link_copied, android.widget.Toast.LENGTH_SHORT).show()
    }
}

fun openSystemDownloads(context: Context) {
    try {
        context.startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
        android.widget.Toast.makeText(context, R.string.error_no_app_to_open_link, android.widget.Toast.LENGTH_SHORT).show()
    }
}

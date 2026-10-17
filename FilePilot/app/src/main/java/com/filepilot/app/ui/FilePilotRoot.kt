package com.filepilot.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.filepilot.app.AppContainer
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.AppSettings
import com.filepilot.app.data.ops.OperationProgress
import com.filepilot.app.ui.archive.ArchiveScreen
import com.filepilot.app.ui.browse.BrowserScreen
import com.filepilot.app.ui.browse.LocationsScreen
import com.filepilot.app.ui.category.CategoryScreen
import com.filepilot.app.ui.cleanup.CleanupScreen
import com.filepilot.app.ui.cleanup.DuplicatesScreen
import com.filepilot.app.ui.cleanup.EmptyFoldersScreen
import com.filepilot.app.ui.details.DetailsScreen
import com.filepilot.app.ui.favorites.FavoritesScreen
import com.filepilot.app.ui.history.HistoryScreen
import com.filepilot.app.ui.home.HomeScreen
import com.filepilot.app.ui.navigation.AppNavigator
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes
import com.filepilot.app.ui.onboarding.OnboardingScreen
import com.filepilot.app.ui.permissions.PermissionsScreen
import com.filepilot.app.ui.preview.AudioPlayerScreen
import com.filepilot.app.ui.preview.ImageViewerScreen
import com.filepilot.app.ui.preview.PdfViewerScreen
import com.filepilot.app.ui.preview.TextViewerScreen
import com.filepilot.app.ui.preview.VideoPlayerScreen
import com.filepilot.app.ui.recent.RecentScreen
import com.filepilot.app.ui.search.SearchScreen
import com.filepilot.app.ui.settings.AboutScreen
import com.filepilot.app.ui.settings.LicensesScreen
import com.filepilot.app.ui.settings.PrivacyScreen
import com.filepilot.app.ui.settings.SettingsScreen
import com.filepilot.app.ui.splash.IntroScreen
import com.filepilot.app.ui.theme.FilePilotTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private data class Tab(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, "Home", Icons.Outlined.Home, Icons.Rounded.Home),
    Tab(Routes.BROWSE, "Browse", Icons.Outlined.FolderOpen, Icons.Rounded.Folder),
    Tab(Routes.RECENT, "Recent", Icons.Outlined.Schedule, Icons.Rounded.Schedule),
    Tab(Routes.FAVORITES, "Favorites", Icons.Outlined.StarOutline, Icons.Rounded.Star),
    Tab(Routes.SETTINGS, "Settings", Icons.Outlined.Settings, Icons.Rounded.Settings),
)

@Composable
fun FilePilotRoot(container: AppContainer, showIntro: Boolean) {
    val settings by container.store.settings.collectAsStateWithLifecycle(AppSettings(onboardingDone = true))
    FilePilotTheme(settings.theme) {
        val nav = rememberNavController()
        val context = LocalContext.current
        val navigator = remember(nav) { AppNavigator(nav, container, context) }
        val snackbar = remember { SnackbarHostState() }
        val backStack by nav.currentBackStackEntryAsState()
        val route = backStack?.destination?.route
        val showBar = route in Routes.tabs
        val progress by container.operations.progress.collectAsStateWithLifecycle()

        LaunchedEffect(Unit) {
            container.messages.collect { snackbar.showSnackbar(it) }
        }

        CompositionLocalProvider(LocalContainer provides container, LocalNavigator provides navigator) {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                contentWindowInsets = WindowInsets(0),
                snackbarHost = { SnackbarHost(snackbar) },
                bottomBar = {
                    AnimatedVisibility(showBar, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest, tonalElevation = 0.dp) {
                            tabs.forEach { tab ->
                                val selected = backStack?.destination?.route == tab.route
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = { navigator.switchTab(tab.route) },
                                    icon = { Icon(if (selected) tab.selectedIcon else tab.icon, contentDescription = null) },
                                    label = { Text(tab.label, maxLines = 1) },
                                    colors = NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                    ),
                                )
                            }
                        }
                    }
                },
            ) { padding ->
                val bottom = PaddingValues(bottom = padding.calculateBottomPadding())
                Box(Modifier.fillMaxSize().padding(bottom).consumeWindowInsets(bottom)) {
                    NavHost(
                        navController = nav,
                        startDestination = if (showIntro) Routes.INTRO else Routes.HOME,
                        enterTransition = { fadeIn(tween(220)) + slideInHorizontally(tween(260)) { it / 12 } },
                        exitTransition = { fadeOut(tween(160)) },
                        popEnterTransition = { fadeIn(tween(220)) },
                        popExitTransition = { fadeOut(tween(160)) + slideOutHorizontally(tween(240)) { it / 12 } },
                    ) {
                        composable(Routes.INTRO) {
                            val scope = rememberCoroutineScope()
                            IntroScreen(onFinished = {
                                scope.launch {
                                    // Returning users skip onboarding.
                                    val done = container.store.settings.first().onboardingDone
                                    nav.navigate(if (done) Routes.HOME else Routes.ONBOARDING) {
                                        popUpTo(Routes.INTRO) { inclusive = true }
                                    }
                                }
                            })
                        }
                        composable(Routes.ONBOARDING) {
                            OnboardingScreen(onDone = {
                                container.appScope.launch { container.store.setOnboardingDone() }
                                nav.navigate(Routes.HOME) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
                            })
                        }
                        composable(Routes.PERMISSIONS) { PermissionsScreen() }
                        composable(Routes.HOME) { HomeScreen() }
                        composable(Routes.BROWSE) { LocationsScreen() }
                        composable(Routes.RECENT) { RecentScreen() }
                        composable(Routes.FAVORITES) { FavoritesScreen() }
                        composable(Routes.SETTINGS) { SettingsScreen() }
                        composable(Routes.BROWSER, arguments = listOf(navArgument("loc") { type = NavType.StringType; nullable = true })) { BrowserScreen() }
                        composable(Routes.CATEGORY, arguments = listOf(navArgument("cat") { type = NavType.StringType })) { CategoryScreen() }
                        composable(Routes.SEARCH, arguments = listOf(navArgument("q") { type = NavType.StringType; nullable = true })) { SearchScreen() }
                        composable(Routes.DETAILS, arguments = listOf(navArgument("item") { type = NavType.StringType; nullable = true })) { entry ->
                            DetailsScreen(entry.itemArg())
                        }
                        composable(
                            Routes.PREVIEW,
                            arguments = listOf(
                                navArgument("kind") { type = NavType.StringType },
                                navArgument("item") { type = NavType.StringType; nullable = true },
                            ),
                        ) { entry ->
                            val item = entry.itemArg()
                            if (item == null) {
                                DetailsScreen(null)
                            } else {
                                when (entry.arguments?.getString("kind")) {
                                    "image" -> ImageViewerScreen(item)
                                    "video" -> VideoPlayerScreen(item)
                                    "audio" -> AudioPlayerScreen(item)
                                    "text" -> TextViewerScreen(item)
                                    "pdf" -> PdfViewerScreen(item)
                                    else -> DetailsScreen(item)
                                }
                            }
                        }
                        composable(Routes.ARCHIVE, arguments = listOf(navArgument("item") { type = NavType.StringType; nullable = true })) { ArchiveScreen() }
                        composable(Routes.HISTORY) { HistoryScreen() }
                        composable(Routes.CLEANUP) { CleanupScreen() }
                        composable(Routes.DUPLICATES) { DuplicatesScreen() }
                        composable(Routes.EMPTY_FOLDERS) { EmptyFoldersScreen() }
                        composable(Routes.ABOUT) { AboutScreen() }
                        composable(Routes.PRIVACY) { PrivacyScreen() }
                        composable(Routes.LICENSES) { LicensesScreen() }
                    }

                    AnimatedVisibility(
                        visible = progress != null,
                        enter = slideInVertically { it } + fadeIn(),
                        exit = slideOutVertically { it } + fadeOut(),
                        modifier = Modifier.align(Alignment.BottomCenter),
                    ) {
                        progress?.let { p ->
                            ProgressCard(p, onCancel = container.operations::cancel, padNavBar = !showBar)
                        }
                    }
                }
            }
        }
    }
}

private fun androidx.navigation.NavBackStackEntry.itemArg(): FileItem? =
    arguments?.getString("item")?.let { FileItem.fromJsonString(it) }

/** Real progress for the running operation, with cancel. */
@Composable
private fun ProgressCard(p: OperationProgress, onCancel: () -> Unit, padNavBar: Boolean) {
    val fraction = p.fraction
    val animated by animateFloatAsState(fraction ?: 0f, label = "op")
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (padNavBar) Modifier.navigationBarsPadding() else Modifier)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.inverseSurface,
        shadowElevation = 6.dp,
    ) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(p.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.inverseOnSurface)
                    val detail = buildString {
                        if (p.totalBytes > 0) append("${Format.size(p.doneBytes)} of ${Format.size(p.totalBytes)}")
                        else if (p.totalItems > 0) append("${p.doneItems} of ${p.totalItems}")
                        if (p.currentName.isNotEmpty()) {
                            if (isNotEmpty()) append(" · ")
                            append(p.currentName)
                        }
                    }
                    Text(
                        detail.ifEmpty { "Preparing…" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.75f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                TextButton(onClick = onCancel) { Text("Cancel", color = MaterialTheme.colorScheme.inversePrimary) }
            }
            Spacer(Modifier.height(8.dp))
            val track = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.2f)
            if (fraction != null) {
                LinearProgressIndicator(
                    progress = { animated },
                    modifier = Modifier.fillMaxWidth().padding(end = 8.dp),
                    color = MaterialTheme.colorScheme.inversePrimary,
                    trackColor = track,
                    strokeCap = StrokeCap.Round,
                )
            } else {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().padding(end = 8.dp),
                    color = MaterialTheme.colorScheme.inversePrimary,
                    trackColor = track,
                    strokeCap = StrokeCap.Round,
                )
            }
        }
    }
}

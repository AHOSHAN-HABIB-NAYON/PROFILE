package com.webtecit.filepilot.navigation

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material.icons.rounded.Construction
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import com.webtecit.filepilot.feature.browser.BrowserScreen
import com.webtecit.filepilot.feature.compare.CompareScreen
import com.webtecit.filepilot.feature.files.FilesScreen
import com.webtecit.filepilot.feature.home.HomeScreen
import com.webtecit.filepilot.feature.library.LibraryScreen
import com.webtecit.filepilot.feature.onboarding.OnboardingScreen
import com.webtecit.filepilot.feature.operations.OperationsPanel
import com.webtecit.filepilot.feature.analyzer.AnalyzerScreen
import com.webtecit.filepilot.core.preferences.UserPreferences
import com.webtecit.filepilot.feature.editor.EditorScreen
import com.webtecit.filepilot.feature.web.PreviewScreen
import com.webtecit.filepilot.feature.web.ProjectsScreen
import com.webtecit.filepilot.feature.tools.Tool
import com.webtecit.filepilot.feature.tools.ToolsScreen
import com.webtecit.filepilot.feature.permissions.PermissionsScreen
import com.webtecit.filepilot.feature.settings.AboutScreen
import com.webtecit.filepilot.feature.settings.SettingsScreen
import com.webtecit.filepilot.feature.splash.SplashScreen

private enum class TopLevel(val route: Any, val label: String, val selected: ImageVector, val unselected: ImageVector) {
    HOME(HomeRoute, "Home", Icons.Rounded.Home, Icons.Outlined.Home),
    FILES(FilesRoute, "Files", Icons.Rounded.Folder, Icons.Outlined.Folder),
    TOOLS(ToolsRoute, "Tools", Icons.Rounded.Construction, Icons.Outlined.Construction),
    LIBRARY(LibraryRoute, "Library", Icons.Rounded.Star, Icons.Outlined.StarBorder),
    SETTINGS(SettingsRoute, "Settings", Icons.Rounded.Settings, Icons.Outlined.Settings),
}

/**
 * @param afterSplash where the app goes when the launch animation ends (onboarding, permission
 * explanation or Home), decided from saved preferences.
 * @param afterOnboarding where the app goes when onboarding ends.
 */
@Composable
fun AppRoot(afterSplash: () -> Any, afterOnboarding: () -> Any, prefs: UserPreferences) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val current = TopLevel.entries.firstOrNull { t -> destination?.hierarchy?.any { it.hasRoute(t.route::class) } == true }
    val animations = LocalAnimationsEnabled.current

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            Column {
                OperationsPanel(padNavigationBar = current == null)
                if (current != null) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                        TopLevel.entries.forEach { tab ->
                            val selected = tab == current
                            NavigationBarItem(
                                selected = selected,
                                onClick = { nav.switchTab(tab.route) },
                                icon = { Icon(if (selected) tab.selected else tab.unselected, contentDescription = null) },
                                label = { Text(tab.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                ),
                                modifier = Modifier.testTag("tab_${tab.label}"),
                            )
                        }
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = SplashRoute,
            modifier = Modifier.padding(padding).consumeWindowInsets(padding),
            enterTransition = {
                if (animations) fadeIn(tween(220)) + slideInHorizontally(tween(260)) { it / 10 } else EnterTransition.None
            },
            exitTransition = { if (animations) fadeOut(tween(160)) else ExitTransition.None },
            popEnterTransition = { if (animations) fadeIn(tween(220)) else EnterTransition.None },
            popExitTransition = {
                if (animations) fadeOut(tween(160)) + slideOutHorizontally(tween(220)) { it / 10 } else ExitTransition.None
            },
        ) {
            composable<SplashRoute> {
                SplashScreen(onFinished = {
                    nav.navigate(afterSplash()) { popUpTo(SplashRoute) { inclusive = true } }
                })
            }
            composable<OnboardingRoute> {
                OnboardingScreen(onFinished = {
                    nav.navigate(afterOnboarding()) { popUpTo(OnboardingRoute) { inclusive = true } }
                })
            }
            composable<PermissionsRoute> { backStack ->
                val route = backStack.toRoute<PermissionsRoute>()
                PermissionsScreen(
                    setup = route.setup,
                    onDone = {
                        if (route.setup) nav.navigate(HomeRoute) { popUpTo(PermissionsRoute(setup = true)) { inclusive = true } }
                        else nav.popBackStack()
                    },
                )
            }
            composable<HomeRoute> {
                HomeScreen(
                    onOpenFolder = { nav.navigate(BrowserRoute(it)) },
                    onSearch = { nav.navigate(BrowserRoute(it, search = true)) },
                    onTool = { nav.navigate(toolRoute(it)) },
                    onOpenLibrary = { nav.switchTab(LibraryRoute) },
                )
            }
            composable<FilesRoute> {
                FilesScreen(
                    onOpenFolder = { nav.navigate(BrowserRoute(it)) },
                    onGrantAccess = { nav.navigate(PermissionsRoute(setup = false)) },
                )
            }
            composable<ToolsRoute> { ToolsScreen(onTool = { nav.navigate(toolRoute(it)) }) }
            composable<AnalyzerRoute> {
                AnalyzerScreen(onBack = { nav.popBackStack() }, onOpenFolder = { nav.navigate(BrowserRoute(it)) })
            }
            composable<EditorRoute> { backStack ->
                val route = backStack.toRoute<EditorRoute>()
                EditorScreen(
                    fileId = route.fileId,
                    projectRoot = route.projectRoot,
                    onBack = { nav.popBackStack() },
                    onBrowse = { nav.switchTab(FilesRoute) },
                    onDevicePreview = { root, entry -> nav.navigate(PreviewRoute(root, entry)) },
                )
            }
            composable<PreviewRoute> { backStack ->
                val route = backStack.toRoute<PreviewRoute>()
                PreviewScreen(route.root, route.entry, prefs.previewDevice, prefs.previewConsole, onBack = { nav.popBackStack() })
            }
            composable<ProjectsRoute> {
                ProjectsScreen(
                    onBack = { nav.popBackStack() },
                    onRun = { root, entry -> nav.navigate(PreviewRoute(root, entry)) },
                    onEdit = { file, root -> nav.openEditor(file, root) },
                    onBrowse = { nav.navigate(BrowserRoute(it)) },
                )
            }
            composable<PdfRoute> { b -> com.webtecit.filepilot.feature.pdf.PdfViewerScreen(b.toRoute<PdfRoute>().fileId, onBack = { nav.popBackStack() }) }
            composable<ApkRoute> { b -> com.webtecit.filepilot.feature.devtools.ApkInfoScreen(b.toRoute<ApkRoute>().path, onBack = { nav.popBackStack() }) }
            composable<HexRoute> { b -> com.webtecit.filepilot.feature.devtools.HexScreen(b.toRoute<HexRoute>().path, onBack = { nav.popBackStack() }) }
            composable<SqliteRoute> { b -> com.webtecit.filepilot.feature.devtools.SqliteScreen(b.toRoute<SqliteRoute>().path, onBack = { nav.popBackStack() }) }
            composable<FontRoute> { b -> com.webtecit.filepilot.feature.devtools.FontPreviewScreen(b.toRoute<FontRoute>().path, onBack = { nav.popBackStack() }) }
            composable<ArchiveRoute> { b ->
                com.webtecit.filepilot.feature.devtools.ArchiveScreen(b.toRoute<ArchiveRoute>().path, onBack = { nav.popBackStack() },
                    onOpenFolder = { nav.navigate(BrowserRoute(it)) })
            }
            composable<TextSearchRoute> { b ->
                com.webtecit.filepilot.feature.devtools.TextSearchScreen(b.toRoute<TextSearchRoute>().root, onBack = { nav.popBackStack() },
                    onOpenFile = { nav.openEditor(it, null) })
            }
            composable<TerminalRoute> { com.webtecit.filepilot.feature.devtools.TerminalScreen(onBack = { nav.popBackStack() }) }
            composable<VaultRoute> { com.webtecit.filepilot.feature.vault.VaultScreen(onBack = { nav.popBackStack() }) }
            composable<CleanerRoute> { com.webtecit.filepilot.feature.cleaner.CleanerScreen(onBack = { nav.popBackStack() }) }
            composable<RecycleBinRoute> { com.webtecit.filepilot.feature.recycle.RecycleBinScreen(onBack = { nav.popBackStack() }) }
            composable<LibraryRoute> {
                LibraryScreen(onOpenFolder = { nav.navigate(BrowserRoute(it)) })
            }
            composable<SettingsRoute> {
                SettingsScreen(
                    onOpenPermissions = { nav.navigate(PermissionsRoute(setup = false)) },
                    onOpenAbout = { nav.navigate(AboutRoute) },
                )
            }
            composable<BrowserRoute> { backStack ->
                val route = backStack.toRoute<BrowserRoute>()
                BrowserScreen(
                    locationId = route.locationId,
                    startSearch = route.search,
                    onClose = { nav.popBackStack() },
                    onCompare = { a, b -> nav.navigate(CompareRoute(a, b)) },
                    onEdit = { nav.openEditor(it, null) },
                    onTool = { route -> nav.navigate(route) },
                    onRunSite = { root, entry -> nav.navigate(PreviewRoute(root, entry)) },
                    onGrantAccess = { nav.navigate(PermissionsRoute(setup = false)) },
                )
            }
            composable<CompareRoute> { backStack ->
                val route = backStack.toRoute<CompareRoute>()
                CompareScreen(route.firstId, route.secondId, onBack = { nav.popBackStack() })
            }
            composable<AboutRoute> { AboutScreen(onBack = { nav.popBackStack() }) }
        }
    }
}

/** The screen for each tool. */
fun toolRoute(tool: Tool): Any = when (tool) {
    Tool.ANALYZER -> AnalyzerRoute
    Tool.CODE_STUDIO -> EditorRoute()
    Tool.HTML_PROJECTS -> ProjectsRoute
    Tool.CLEANER -> CleanerRoute
    Tool.SECURE_FOLDER -> VaultRoute
    Tool.TERMINAL -> TerminalRoute
    Tool.TEXT_SEARCH -> TextSearchRoute(android.os.Environment.getExternalStorageDirectory().absolutePath)
    Tool.RECYCLE_BIN -> RecycleBinRoute
}

/** Opens the editor; an editor already on the back stack is replaced so its tabs carry over. */
private fun NavHostController.openEditor(fileId: String, projectRoot: String?) {
    navigate(EditorRoute(fileId, projectRoot)) { popUpTo<EditorRoute> { inclusive = true } }
}

private fun NavHostController.switchTab(route: Any) {
    navigate(route) {
        popUpTo(HomeRoute) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

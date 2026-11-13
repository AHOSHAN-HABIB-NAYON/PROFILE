package com.webtecit.devicepilot.core.navigation

import android.net.Uri
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.webtecit.devicepilot.feature.appmanager.AppDetailScreen
import com.webtecit.devicepilot.feature.appmanager.AppsScreen
import com.webtecit.devicepilot.feature.battery.ChargingScreen
import com.webtecit.devicepilot.feature.cleaner.CoolingScreen
import com.webtecit.devicepilot.feature.cleaner.RamBoostScreen
import com.webtecit.devicepilot.feature.cleaner.SpeedUpScreen
import com.webtecit.devicepilot.feature.dashboard.DashboardScreen
import com.webtecit.devicepilot.feature.deviceinfo.DeviceInfoScreen
import com.webtecit.devicepilot.feature.deviceinfo.DisplayScreen
import com.webtecit.devicepilot.feature.diagnostics.DiagnosticTestScreen
import com.webtecit.devicepilot.feature.diagnostics.DiagnosticsScreen
import com.webtecit.devicepilot.feature.health.HealthScreen
import com.webtecit.devicepilot.feature.network.NetworkScreen
import com.webtecit.devicepilot.feature.onboarding.OnboardingScreen
import com.webtecit.devicepilot.feature.performance.PerformanceScreen
import com.webtecit.devicepilot.feature.settings.AboutScreen
import com.webtecit.devicepilot.feature.settings.LegalScreen
import com.webtecit.devicepilot.feature.settings.PermissionsScreen
import com.webtecit.devicepilot.feature.settings.SettingsScreen
import com.webtecit.devicepilot.feature.storage.DuplicatesScreen
import com.webtecit.devicepilot.feature.storage.FileListScreen
import com.webtecit.devicepilot.feature.storage.JunkCleanerScreen
import com.webtecit.devicepilot.feature.storage.StorageScreen
import com.webtecit.devicepilot.feature.tips.TipsScreen
import com.webtecit.devicepilot.feature.tools.ToolsScreen

object Routes {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val HEALTH = "health"
    const val TOOLS = "tools"
    const val STORAGE = "storage"
    const val SETTINGS = "settings"

    const val DEVICE_INFO = "device_info"
    const val PERFORMANCE = "performance"
    const val SPEED_UP = "speed_up"
    const val RAM_BOOST = "ram_boost"
    const val COOLING = "cooling"
    const val CHARGING = "charging"
    const val FILES = "files/{mode}"
    const val DUPLICATES = "duplicates"
    const val JUNK = "junk"
    const val DIAGNOSTICS = "diagnostics"
    const val DIAGNOSTIC_TEST = "diagnostic/{test}"
    const val NETWORK = "network"
    const val APPS = "apps"
    const val APP_DETAIL = "app/{pkg}"
    const val TIPS = "tips"
    const val DISPLAY = "display"
    const val LEGAL = "legal/{doc}"
    const val ABOUT = "about"
    const val PERMISSIONS = "permissions"

    fun files(mode: String) = "files/$mode"
    fun diagnosticTest(test: String) = "diagnostic/$test"
    fun appDetail(pkg: String) = "app/${Uri.encode(pkg)}"
    fun legal(doc: String) = "legal/$doc"

    val topLevel = listOf(HOME, HEALTH, TOOLS, STORAGE, SETTINGS)
}

private data class TopDestination(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector)

private val topDestinations = listOf(
    TopDestination(Routes.HOME, "Home", Icons.Outlined.Home, Icons.Filled.Home),
    TopDestination(Routes.HEALTH, "Health", Icons.Outlined.FavoriteBorder, Icons.Filled.Favorite),
    TopDestination(Routes.TOOLS, "Tools", Icons.Outlined.Apps, Icons.Filled.Apps),
    TopDestination(Routes.STORAGE, "Storage", Icons.Outlined.Folder, Icons.Filled.Folder),
    TopDestination(Routes.SETTINGS, "Settings", Icons.Outlined.Settings, Icons.Filled.Settings),
)

@Composable
fun DevicepilotNavHost(
    onboardingDone: Boolean,
    isDark: Boolean,
    onToggleTheme: () -> Unit,
    pendingRoute: String?,
    onPendingRouteHandled: () -> Unit,
    navController: NavHostController = rememberNavController(),
) {
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val showBottomBar = currentRoute in Routes.topLevel

    LaunchedEffect(pendingRoute, onboardingDone) {
        if (pendingRoute != null && onboardingDone) {
            navController.navigate(pendingRoute) { launchSingleTop = true }
            onPendingRouteHandled()
        }
    }

    val navigate: (String) -> Unit = { route ->
        if (route in Routes.topLevel) navigateTopLevel(navController, route)
        else navController.navigate(route) { launchSingleTop = true }
    }
    val back: () -> Unit = { navController.popBackStack() }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp()) {
                    topDestinations.forEach { dest ->
                        val selected = currentRoute == dest.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { navigateTopLevel(navController, dest.route) },
                            icon = { Icon(if (selected) dest.selectedIcon else dest.icon, contentDescription = null) },
                            label = { Text(dest.label) },
                            colors = NavigationBarItemDefaults.colors(
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(bottom = padding.calculateBottomPadding())) {
            NavHost(
                navController = navController,
                startDestination = if (onboardingDone) Routes.HOME else Routes.ONBOARDING,
                enterTransition = {
                    if (isTopLevelSwitch()) fadeIn(tween(180))
                    else slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Start, tween(260)) + fadeIn(tween(260))
                },
                exitTransition = {
                    if (isTopLevelSwitch()) fadeOut(tween(120))
                    else fadeOut(tween(200))
                },
                popEnterTransition = { fadeIn(tween(220)) },
                popExitTransition = {
                    slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.End, tween(240)) + fadeOut(tween(240))
                },
            ) {
                composable(Routes.ONBOARDING) {
                    // Finishing onboarding saves a flag; the start destination then switches to Home
                    // and NavHost resets the back stack, so there is no explicit navigate call here.
                    OnboardingScreen(onOpenLegal = { navigate(Routes.legal(it)) })
                }
                composable(Routes.HOME) { DashboardScreen(navigate, isDark, onToggleTheme) }
                composable(Routes.HEALTH) { HealthScreen(navigate) }
                composable(Routes.TOOLS) { ToolsScreen(navigate) }
                composable(Routes.STORAGE) { StorageScreen(navigate) }
                composable(Routes.SETTINGS) { SettingsScreen(navigate) }

                composable(Routes.DEVICE_INFO) { DeviceInfoScreen(back) }
                composable(Routes.PERFORMANCE) { PerformanceScreen(back) }
                composable(Routes.SPEED_UP) { SpeedUpScreen(back, navigate) }
                composable(Routes.RAM_BOOST) { RamBoostScreen(back, navigate) }
                composable(Routes.COOLING) { CoolingScreen(back, navigate) }
                composable(Routes.CHARGING) { ChargingScreen(back) }
                composable(Routes.FILES, arguments = listOf(navArgument("mode") { type = NavType.StringType })) {
                    FileListScreen(it.arguments?.getString("mode") ?: "LARGE", back)
                }
                composable(Routes.DUPLICATES) { DuplicatesScreen(back) }
                composable(Routes.JUNK) { JunkCleanerScreen(back, navigate) }
                composable(Routes.DIAGNOSTICS) { DiagnosticsScreen(back, navigate) }
                composable(Routes.DIAGNOSTIC_TEST, arguments = listOf(navArgument("test") { type = NavType.StringType })) {
                    DiagnosticTestScreen(it.arguments?.getString("test").orEmpty(), back)
                }
                composable(Routes.NETWORK) { NetworkScreen(back) }
                composable(Routes.APPS) { AppsScreen(back, navigate) }
                composable(Routes.APP_DETAIL, arguments = listOf(navArgument("pkg") { type = NavType.StringType })) {
                    AppDetailScreen(Uri.decode(it.arguments?.getString("pkg").orEmpty()), back)
                }
                composable(Routes.TIPS) { TipsScreen(back) }
                composable(Routes.DISPLAY) { DisplayScreen(back) }
                composable(Routes.LEGAL, arguments = listOf(navArgument("doc") { type = NavType.StringType })) {
                    LegalScreen(it.arguments?.getString("doc").orEmpty(), back)
                }
                composable(Routes.ABOUT) { AboutScreen(back, navigate) }
                composable(Routes.PERMISSIONS) { PermissionsScreen(back) }
            }
        }
    }
}

private fun AnimatedContentTransitionScope<androidx.navigation.NavBackStackEntry>.isTopLevelSwitch(): Boolean =
    initialState.destination.route in Routes.topLevel && targetState.destination.route in Routes.topLevel

private fun navigateTopLevel(navController: NavHostController, route: String) {
    navController.navigate(route) {
        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())

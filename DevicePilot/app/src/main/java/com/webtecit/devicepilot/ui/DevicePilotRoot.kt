package com.webtecit.devicepilot.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.NetworkCheck
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.ui.apps.AppDetailsScreen
import com.webtecit.devicepilot.ui.apps.AppsScreen
import com.webtecit.devicepilot.ui.apps.UninstallScreen
import com.webtecit.devicepilot.ui.battery.BatteryScreen
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ProvideMotion
import com.webtecit.devicepilot.ui.firewall.FirewallScreen
import com.webtecit.devicepilot.ui.home.HomeScreen
import com.webtecit.devicepilot.ui.install.ApkManagerScreen
import com.webtecit.devicepilot.ui.install.InstallScreen
import com.webtecit.devicepilot.ui.memory.MemoryScreen
import com.webtecit.devicepilot.ui.network.NetworkScreen
import com.webtecit.devicepilot.ui.onboarding.OnboardingScreen
import com.webtecit.devicepilot.ui.optimize.GuideScreen
import com.webtecit.devicepilot.ui.optimize.OptimizeScreen
import com.webtecit.devicepilot.ui.settings.AboutScreen
import com.webtecit.devicepilot.ui.settings.PrivacyScreen
import com.webtecit.devicepilot.ui.settings.SettingsScreen
import com.webtecit.devicepilot.ui.storage.StorageScreen
import com.webtecit.devicepilot.ui.temperature.TemperatureScreen
import com.webtecit.devicepilot.ui.theme.DevicePilotTheme
import com.webtecit.devicepilot.ui.theme.isDarkTheme
import kotlinx.coroutines.launch

object Routes {
    const val HOME = "home"
    const val APPS = "apps"
    const val NETWORK = "network"
    const val TEMPERATURE = "temperature"
    const val OPTIMIZE = "optimize"
    const val APP_DETAILS = "app/{pkg}"
    const val INSTALL = "install"
    const val UNINSTALL = "uninstall"
    const val APKS = "apks"
    const val FIREWALL = "firewall"
    const val BATTERY = "battery"
    const val STORAGE = "storage"
    const val MEMORY = "memory"
    const val GUIDE = "guide"
    const val SETTINGS = "settings"
    const val ABOUT = "about"
    const val PRIVACY = "privacy"
    const val RUNNING = "running"
    const val PERMISSIONS = "permissions"
    const val DISCLAIMER = "disclaimer"
    const val DEVICE_INFO = "device"
    const val HIDER = "hider"
    const val BOOST = "boost"
    const val COOL = "cool"
    const val CLEANER = "cleaner"

    fun appDetails(pkg: String) = "app/$pkg"

    val all = setOf(HOME, APPS, NETWORK, TEMPERATURE, OPTIMIZE, INSTALL, UNINSTALL, APKS, FIREWALL, BATTERY,
        STORAGE, MEMORY, GUIDE, SETTINGS, ABOUT, PRIVACY, RUNNING, PERMISSIONS, DISCLAIMER, DEVICE_INFO, HIDER, BOOST, COOL, CLEANER)
}

private data class Tab(val route: String, val label: Int, val icon: ImageVector, val selectedIcon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, R.string.tab_home, Icons.Outlined.Home, Icons.Filled.Home),
    Tab(Routes.APPS, R.string.tab_apps, Icons.Outlined.Apps, Icons.Filled.Apps),
    Tab(Routes.NETWORK, R.string.tab_network, Icons.Outlined.NetworkCheck, Icons.Filled.NetworkCheck),
    Tab(Routes.TEMPERATURE, R.string.tab_temperature, Icons.Outlined.Thermostat, Icons.Filled.Thermostat),
    Tab(Routes.OPTIMIZE, R.string.tab_optimize, Icons.Outlined.RocketLaunch, Icons.Filled.RocketLaunch),
)

private fun tabFor(route: String?): String? = when (route) {
    null -> null
    Routes.HOME, Routes.BATTERY, Routes.STORAGE, Routes.MEMORY, Routes.RUNNING, Routes.DEVICE_INFO, Routes.BOOST, Routes.COOL, Routes.CLEANER -> Routes.HOME
    Routes.APPS, Routes.APP_DETAILS, Routes.INSTALL, Routes.UNINSTALL, Routes.APKS, Routes.HIDER -> Routes.APPS
    Routes.NETWORK, Routes.FIREWALL -> Routes.NETWORK
    Routes.TEMPERATURE -> Routes.TEMPERATURE
    Routes.OPTIMIZE, Routes.GUIDE -> Routes.OPTIMIZE
    else -> null
}

private fun titleFor(route: String?): Int = when (route) {
    Routes.APPS -> R.string.title_apps
    Routes.NETWORK -> R.string.title_network
    Routes.TEMPERATURE -> R.string.title_temperature
    Routes.OPTIMIZE -> R.string.title_optimize
    Routes.APP_DETAILS -> R.string.title_app_details
    Routes.INSTALL -> R.string.title_install
    Routes.UNINSTALL -> R.string.title_uninstall
    Routes.APKS -> R.string.title_apks
    Routes.FIREWALL -> R.string.title_firewall
    Routes.BATTERY -> R.string.title_battery
    Routes.STORAGE -> R.string.title_storage
    Routes.MEMORY -> R.string.title_memory
    Routes.GUIDE -> R.string.title_guide
    Routes.SETTINGS -> R.string.title_settings
    Routes.ABOUT -> R.string.title_about
    Routes.PRIVACY -> R.string.title_privacy
    Routes.RUNNING -> R.string.title_running
    Routes.PERMISSIONS -> R.string.title_permissions
    Routes.DISCLAIMER -> R.string.title_disclaimer
    Routes.DEVICE_INFO -> R.string.title_device_info
    Routes.HIDER -> R.string.title_hider
    Routes.BOOST -> R.string.title_boost
    Routes.COOL -> R.string.title_cool
    Routes.CLEANER -> R.string.title_cleaner
    else -> R.string.app_name
}

fun NavHostController.navigateTab(route: String) {
    if (route == Routes.HOME) {
        // Pop everything above Home (e.g. Settings, About) so Home is always reachable.
        if (!popBackStack(Routes.HOME, inclusive = false)) navigate(Routes.HOME) { launchSingleTop = true }
        return
    }
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
fun DevicePilotRoot(
    container: AppContainer,
    initialRoute: String?,
    onRouteConsumed: () -> Unit,
    locked: Boolean = false,
    onUnlocked: () -> Unit = {},
) {
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = null)
    val s = settings

    CompositionLocalProvider(LocalContainer provides container) {
        DevicePilotTheme(dark = isDarkTheme(s?.theme ?: com.webtecit.devicepilot.data.ThemeMode.SYSTEM)) {
            ProvideMotion {
                when {
                    s == null -> Unit
                    !s.onboardingDone -> {
                        val scope = rememberCoroutineScope()
                        OnboardingScreen(onFinish = { scope.launch { container.settings.setOnboardingDone() } })
                    }
                    else -> androidx.compose.foundation.layout.Box {
                        MainScaffold(initialRoute, onRouteConsumed, s, container)
                        if (locked) com.webtecit.devicepilot.security.LockScreen(onUnlocked)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(
    initialRoute: String?,
    onRouteConsumed: () -> Unit,
    settings: com.webtecit.devicepilot.data.AppSettings,
    container: AppContainer,
) {
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val dark = isDarkTheme(settings.theme)
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val haptics = LocalHapticFeedback.current
    val isTopLevel = tabs.any { it.route == route }

    // First start after onboarding: show the permissions page once. It is marked as shown right
    // away, so leaving it with Back or the bottom bar does not bring it back on the next launch;
    // after that the app always opens on Home (the page stays reachable from Settings).
    LaunchedEffect(Unit) {
        if (!settings.permissionsSetupDone) {
            container.settings.setPermissionsSetupDone()
            nav.navigate(Routes.PERMISSIONS) { launchSingleTop = true }
        }
    }

    LaunchedEffect(initialRoute) {
        if (initialRoute != null && initialRoute in Routes.all) {
            nav.navigate(initialRoute) { launchSingleTop = true }
            onRouteConsumed()
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(stringResource(titleFor(route)), maxLines = 1, overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleLarge)
                },
                navigationIcon = {
                    if (route == Routes.HOME) {
                        androidx.compose.foundation.layout.Box(
                            Modifier.padding(start = 12.dp, end = 4.dp).size(34.dp)
                                .clip(androidx.compose.foundation.shape.RoundedCornerShape(10.dp))
                                .background(androidx.compose.ui.graphics.Brush.linearGradient(
                                    listOf(androidx.compose.ui.graphics.Color(0xFF2A7BFF), androidx.compose.ui.graphics.Color(0xFF0B1B3F)))),
                        ) {
                            androidx.compose.foundation.Image(
                                androidx.compose.ui.res.painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(34.dp))
                        }
                    }
                    if (!isTopLevel && route != null) {
                        IconButton(onClick = { nav.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                        }
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            container.settings.setTheme(
                                if (dark) com.webtecit.devicepilot.data.ThemeMode.LIGHT else com.webtecit.devicepilot.data.ThemeMode.DARK
                            )
                        }
                    }) {
                        Icon(if (dark) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                            stringResource(if (dark) R.string.action_light_mode else R.string.action_dark_mode))
                    }
                    if (route != Routes.SETTINGS) IconButton(onClick = { nav.navigate(Routes.SETTINGS) { launchSingleTop = true } }) {
                        Icon(Icons.Outlined.Settings, stringResource(R.string.title_settings))
                    }
                    if (route != Routes.ABOUT) IconButton(onClick = { nav.navigate(Routes.ABOUT) { launchSingleTop = true } }) {
                        Icon(Icons.Outlined.Info, stringResource(R.string.title_about))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            DpBottomBar(selectedRoute = tabFor(route)) { r ->
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                nav.navigateTab(r)
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(padding),
            enterTransition = { fadeIn(tween(220)) + slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Start, tween(260), initialOffset = { it / 12 }) },
            exitTransition = { fadeOut(tween(160)) },
            popEnterTransition = { fadeIn(tween(220)) },
            popExitTransition = { fadeOut(tween(160)) + slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.End, tween(220), targetOffset = { it / 12 }) },
        ) {
            val go: (String) -> Unit = { r ->
                if (tabs.any { it.route == r }) nav.navigateTab(r) else nav.navigate(r) { launchSingleTop = true }
            }
            composable(Routes.HOME) { HomeScreen(go) }
            composable(Routes.APPS) { AppsScreen(go) }
            composable(Routes.NETWORK) { NetworkScreen(go) }
            composable(Routes.TEMPERATURE) { TemperatureScreen(go) }
            composable(Routes.OPTIMIZE) { OptimizeScreen(go) }
            composable(Routes.APP_DETAILS, arguments = listOf(navArgument("pkg") { type = NavType.StringType })) {
                AppDetailsScreen(it.arguments?.getString("pkg").orEmpty(), go, onRemoved = { nav.popBackStack() })
            }
            composable(Routes.INSTALL) { InstallScreen(go) }
            composable(Routes.UNINSTALL) { UninstallScreen() }
            composable(Routes.APKS) { ApkManagerScreen(go) }
            composable(Routes.FIREWALL) { FirewallScreen() }
            composable(Routes.BATTERY) { BatteryScreen() }
            composable(Routes.STORAGE) { StorageScreen(go) }
            composable(Routes.MEMORY) { MemoryScreen(go) }
            composable(Routes.GUIDE) { GuideScreen() }
            composable(Routes.SETTINGS) { SettingsScreen(go) }
            composable(Routes.ABOUT) { AboutScreen(go) }
            composable(Routes.PRIVACY) { PrivacyScreen(go) }
            composable(Routes.RUNNING) { com.webtecit.devicepilot.ui.running.RunningAppsScreen(go) }
            composable(Routes.PERMISSIONS) {
                com.webtecit.devicepilot.ui.permissions.PermissionsScreen(onDone = {
                    scope.launch { container.settings.setPermissionsSetupDone() }
                    if (!nav.popBackStack()) nav.navigate(Routes.HOME)
                })
            }
            composable(Routes.BOOST) { com.webtecit.devicepilot.ui.boost.BoostScreen() }
            composable(Routes.CLEANER) { com.webtecit.devicepilot.ui.cleaner.CleanerScreen() }
            composable(Routes.COOL) { com.webtecit.devicepilot.ui.boost.CoolDownScreen() }
            composable(Routes.HIDER) { com.webtecit.devicepilot.ui.hider.AppHiderScreen() }
            composable(Routes.DEVICE_INFO) { com.webtecit.devicepilot.ui.device.DeviceInfoScreen() }
            composable(Routes.DISCLAIMER) { com.webtecit.devicepilot.ui.settings.DisclaimerScreen(go) }
        }
    }
}


/**
 * Floating bottom menu: rounded bar with a soft shadow; the selected tab gets a gradient pill
 * behind its icon and a bold coloured label. Labels stay visible on every tab for clarity.
 */
@Composable
private fun DpBottomBar(selectedRoute: String?, onSelect: (String) -> Unit) {
    androidx.compose.material3.Surface(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(26.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 10.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        androidx.compose.foundation.layout.Row(
            Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            tabs.forEach { tab ->
                val selected = selectedRoute == tab.route
                val pillAlpha by animateFloatAsState(if (selected) 1f else 0f, tween(220), label = "pill")
                val pillWidth by androidx.compose.animation.core.animateDpAsState(if (selected) 56.dp else 40.dp, tween(220), label = "w")
                val primary = MaterialTheme.colorScheme.primary
                val secondary = MaterialTheme.colorScheme.secondary
                androidx.compose.foundation.layout.Column(
                    Modifier
                        .weight(1f)
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
                        .selectable(selected = selected, role = androidx.compose.ui.semantics.Role.Tab) { onSelect(tab.route) }
                        .padding(vertical = 4.dp),
                    horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
                ) {
                    androidx.compose.foundation.layout.Box(
                        Modifier
                            .size(width = pillWidth, height = 32.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(50))
                            .background(
                                androidx.compose.ui.graphics.Brush.horizontalGradient(
                                    listOf(primary.copy(alpha = pillAlpha), secondary.copy(alpha = pillAlpha))
                                )
                            ),
                        contentAlignment = androidx.compose.ui.Alignment.Center,
                    ) {
                        Icon(
                            if (selected) tab.selectedIcon else tab.icon, null,
                            tint = if (selected) androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    androidx.compose.foundation.layout.Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(tab.label), maxLines = 1,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (selected) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Medium,
                        color = if (selected) primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

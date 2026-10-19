package com.webtecit.nayon.navigation

import androidx.compose.animation.AnimatedContentTransitionScope.SlideDirection
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.feature.about.AboutScreen
import com.webtecit.nayon.feature.about.LicensesScreen
import com.webtecit.nayon.feature.about.PrivacyPolicyScreen
import com.webtecit.nayon.feature.appearance.AppearanceRoute
import com.webtecit.nayon.feature.bookmarks.BookmarksScreen
import com.webtecit.nayon.feature.browser.BrowserScreen
import com.webtecit.nayon.feature.browser.BrowserViewModel
import com.webtecit.nayon.feature.downloads.DownloadsScreen
import com.webtecit.nayon.feature.history.HistoryScreen
import com.webtecit.nayon.feature.settings.ClearDataScreen
import com.webtecit.nayon.feature.settings.SearchEngineScreen
import com.webtecit.nayon.feature.settings.SettingsScreen
import com.webtecit.nayon.feature.tabs.TabsScreen

object Routes {
    const val BROWSER = "browser"
    const val TABS = "tabs"
    const val BOOKMARKS = "bookmarks"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val APPEARANCE = "appearance"
    const val SEARCH_ENGINE = "search_engine"
    const val CLEAR_DATA = "clear_data"
    const val ABOUT = "about"
    const val PRIVACY = "privacy"
    const val LICENSES = "licenses"
    const val DOWNLOADS = "downloads"
    const val PASSWORDS = "passwords"
    const val SITE_SETTINGS = "site_settings"
}

private const val NAV_ANIM_MS = 220

@Composable
fun NayonNavHost(
    appearance: AppearanceSettings,
    browser: BrowserViewModel,
    navController: NavHostController = rememberNavController(),
) {
    val back: () -> Unit = { navController.popBackStack() }
    fun go(route: String) = navController.navigate(route) { launchSingleTop = true }
    fun showBrowser() { navController.popBackStack(Routes.BROWSER, inclusive = false) }
    /** Opens a URL in the current tab and returns to the browser. */
    val openHere: (String) -> Unit = { url -> browser.openInCurrentTab(url); showBrowser() }
    val openNewTab: (String) -> Unit = { url -> browser.newTab(url); showBrowser() }

    LaunchedEffect(browser) { browser.showBrowser.collect { showBrowser() } }
    LaunchedEffect(browser) { browser.showDownloads.collect { browser.consumeShowDownloads(); go(Routes.DOWNLOADS) } }

    NavHost(
        navController = navController,
        startDestination = Routes.BROWSER,
        enterTransition = { slideIntoContainer(SlideDirection.Start, tween(NAV_ANIM_MS)) + fadeIn(tween(NAV_ANIM_MS)) },
        exitTransition = { fadeOut(tween(NAV_ANIM_MS / 2)) },
        popEnterTransition = { fadeIn(tween(NAV_ANIM_MS)) },
        popExitTransition = { slideOutOfContainer(SlideDirection.End, tween(NAV_ANIM_MS)) + fadeOut(tween(NAV_ANIM_MS)) },
    ) {
        composable(
            Routes.BROWSER,
            enterTransition = { fadeIn(tween(200)) + scaleIn(tween(240), initialScale = 1.04f) },
            exitTransition = { fadeOut(tween(160)) + scaleOut(tween(220), targetScale = 1.04f) },
            popEnterTransition = { fadeIn(tween(220)) + scaleIn(tween(260), initialScale = 1.04f) },
            popExitTransition = { fadeOut(tween(160)) },
        ) {
            BrowserScreen(
                viewModel = browser,
                onOpenTabs = { go(Routes.TABS) },
                onOpenBookmarks = { go(Routes.BOOKMARKS) },
                onOpenHistory = { go(Routes.HISTORY) },
                onOpenDownloads = { go(Routes.DOWNLOADS) },
                onOpenSettings = { go(Routes.SETTINGS) },
                onOpenAbout = { go(Routes.ABOUT) },
            )
        }
        // The tab switcher zooms in and out of the page, like a card stack.
        composable(
            Routes.TABS,
            enterTransition = { fadeIn(tween(200)) + scaleIn(tween(240), initialScale = 0.92f) },
            exitTransition = { fadeOut(tween(160)) },
            popEnterTransition = { fadeIn(tween(200)) },
            popExitTransition = { fadeOut(tween(180)) + scaleOut(tween(220), targetScale = 0.92f) },
        ) { TabsScreen(browser, onBack = back) }
        composable(Routes.BOOKMARKS) { BookmarksScreen(onBack = back, onOpen = openHere, onOpenInNewTab = openNewTab) }
        composable(Routes.HISTORY) { HistoryScreen(onBack = back, onOpen = openHere, onOpenClearData = { go(Routes.CLEAR_DATA) }) }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                appearance = appearance,
                browser = browser,
                onBack = back,
                onOpenAppearance = { go(Routes.APPEARANCE) },
                onOpenSearchEngine = { go(Routes.SEARCH_ENGINE) },
                onOpenClearData = { go(Routes.CLEAR_DATA) },
                onOpenDownloads = { go(Routes.DOWNLOADS) },
                onOpenAbout = { go(Routes.ABOUT) },
                onOpenPrivacy = { go(Routes.PRIVACY) },
                onOpenLicenses = { go(Routes.LICENSES) },
                onOpenPasswords = { go(Routes.PASSWORDS) },
                onOpenSiteSettings = { go(Routes.SITE_SETTINGS) },
            )
        }
        composable(Routes.APPEARANCE) { AppearanceRoute(onBack = back) }
        composable(Routes.SEARCH_ENGINE) { SearchEngineScreen(browser, onBack = back) }
        composable(Routes.CLEAR_DATA) { ClearDataScreen(browser, onBack = back) }
        composable(Routes.ABOUT) {
            AboutScreen(onBack = back, onOpenPrivacy = { go(Routes.PRIVACY) }, onOpenLicenses = { go(Routes.LICENSES) }, onOpenUrl = openNewTab)
        }
        composable(Routes.DOWNLOADS) { DownloadsScreen(onBack = back) }
        composable(Routes.PASSWORDS) { com.webtecit.nayon.feature.security.PasswordsScreen(onBack = back, onOpenSite = openNewTab) }
        composable(Routes.SITE_SETTINGS) { com.webtecit.nayon.feature.security.SiteSettingsScreen(onBack = back) }
        composable(Routes.PRIVACY) { PrivacyPolicyScreen(onBack = back) }
        composable(Routes.LICENSES) { LicensesScreen(onBack = back, onOpenUrl = openNewTab) }
    }
}

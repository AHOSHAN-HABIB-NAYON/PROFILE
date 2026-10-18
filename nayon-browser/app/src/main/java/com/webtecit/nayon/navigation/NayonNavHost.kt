package com.webtecit.nayon.navigation

import androidx.compose.animation.AnimatedContentTransitionScope.SlideDirection
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.feature.about.AboutScreen
import com.webtecit.nayon.feature.about.LicensesScreen
import com.webtecit.nayon.feature.about.PrivacyPolicyScreen
import com.webtecit.nayon.feature.appearance.AppearanceRoute
import com.webtecit.nayon.feature.home.HomeScreen
import com.webtecit.nayon.feature.settings.SettingsScreen

object Routes {
    const val HOME = "home"
    const val SETTINGS = "settings"
    const val APPEARANCE = "appearance"
    const val ABOUT = "about"
    const val PRIVACY = "privacy"
    const val LICENSES = "licenses"
}

private const val NAV_ANIM_MS = 220

@Composable
fun NayonNavHost(
    appearance: AppearanceSettings,
    navController: NavHostController = rememberNavController(),
) {
    val back: () -> Unit = { navController.popBackStack() }
    fun go(route: String) = navController.navigate(route) { launchSingleTop = true }

    NavHost(
        navController = navController,
        startDestination = Routes.HOME,
        enterTransition = { slideIntoContainer(SlideDirection.Start, tween(NAV_ANIM_MS)) + fadeIn(tween(NAV_ANIM_MS)) },
        exitTransition = { fadeOut(tween(NAV_ANIM_MS / 2)) },
        popEnterTransition = { fadeIn(tween(NAV_ANIM_MS)) },
        popExitTransition = { slideOutOfContainer(SlideDirection.End, tween(NAV_ANIM_MS)) + fadeOut(tween(NAV_ANIM_MS)) },
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                appearance = appearance,
                onOpenAppearance = { go(Routes.APPEARANCE) },
                onOpenSettings = { go(Routes.SETTINGS) },
                onOpenAbout = { go(Routes.ABOUT) },
                onOpenPrivacy = { go(Routes.PRIVACY) },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                appearance = appearance,
                onBack = back,
                onOpenAppearance = { go(Routes.APPEARANCE) },
                onOpenAbout = { go(Routes.ABOUT) },
                onOpenPrivacy = { go(Routes.PRIVACY) },
                onOpenLicenses = { go(Routes.LICENSES) },
            )
        }
        composable(Routes.APPEARANCE) { AppearanceRoute(onBack = back) }
        composable(Routes.ABOUT) {
            AboutScreen(onBack = back, onOpenPrivacy = { go(Routes.PRIVACY) }, onOpenLicenses = { go(Routes.LICENSES) })
        }
        composable(Routes.PRIVACY) { PrivacyPolicyScreen(onBack = back) }
        composable(Routes.LICENSES) { LicensesScreen(onBack = back) }
    }
}

package com.oryzenx.app.ui

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.CandlestickChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.oryzenx.app.OryzenApp
import com.oryzenx.app.data.bool
import com.oryzenx.app.data.obj
import com.oryzenx.app.data.t
import com.oryzenx.app.ui.screens.*
import com.oryzenx.app.ui.theme.Ox

private val TABS = listOf(
    Triple("home", Icons.Default.Home, "nav_home"),
    Triple("portfolio", Icons.Default.PieChart, "nav_portfolio"),
    Triple("trading", Icons.Default.CandlestickChart, "nav_trading"),
    Triple("activity", Icons.AutoMirrored.Filled.ReceiptLong, "nav_activity"),
    Triple("more", Icons.Default.Menu, "nav_more"),
)

fun NavHostController.go(route: String) = navigate(route) { launchSingleTop = true }

fun NavHostController.tab(route: String) = navigate(route) {
    popUpTo("home") { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@Composable
fun AppRoot() {
    val nav = rememberNavController()
    val context = LocalContext.current
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route ?: ""
    val user = AppState.user
    val start = when {
        user == null -> "welcome"
        !user.obj("verification").bool("email_verified") -> "verify"
        else -> "home"
    }

    // Session expired anywhere → back to sign-in
    LaunchedEffect(Unit) {
        OryzenApp.instance.api.unauthorized.collect {
            AppState.user = null
            nav.navigate("login") { popUpTo(0) }
        }
    }
    LaunchedEffect(AppState.pendingDeepLink) {
        AppState.pendingDeepLink?.let { link ->
            if (link.startsWith("reset/")) nav.navigate("reset?token=" + link.removePrefix("reset/"))
            else if (link == "notifications" && AppState.user != null) nav.navigate("notifications")
            AppState.pendingDeepLink = null
        }
    }

    val showBar = TABS.any { it.first == route }
    Scaffold(
        containerColor = Ox.colors.bg,
        bottomBar = {
            if (showBar) NavigationBar(containerColor = Ox.colors.surface, tonalElevation = androidx.compose.ui.unit.Dp.Hairline) {
                TABS.forEach { (r, icon, label) ->
                    NavigationBarItem(
                        selected = route == r,
                        onClick = { nav.tab(r) },
                        icon = {
                            if (r == "more" && AppState.unread > 0) BadgedBox(badge = { Badge() }) { Icon(icon, null) } else Icon(icon, null)
                        },
                        label = { Text(t(label)) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = Ox.colors.primary, selectedTextColor = Ox.colors.primary, indicatorColor = Ox.colors.primarySoft),
                    )
                }
            }
        },
    ) { inner ->
        NavHost(
            navController = nav, startDestination = start, modifier = Modifier.padding(inner),
            enterTransition = { fadeIn(tween(180)) }, exitTransition = { fadeOut(tween(120)) },
        ) {
            composable("welcome") { WelcomeScreen(nav) }
            composable("login") { LoginScreen(nav) }
            composable("register") { RegisterScreen(nav) }
            composable("verify") { VerifyEmailScreen(nav) }
            composable("forgot") { ForgotPasswordScreen(nav) }
            composable("reset?token={token}", arguments = listOf(navArgument("token") { type = NavType.StringType; defaultValue = "" })) {
                ResetPasswordScreen(nav, it.arguments?.getString("token").orEmpty())
            }
            composable("home") { HomeScreen(nav) }
            composable("portfolio") { PortfolioScreen(nav) }
            composable("markets") { MarketsScreen(nav) }
            composable("asset/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) { AssetScreen(nav, it.arguments?.getInt("id") ?: 0) }
            composable("trading") { TradingScreen(nav) }
            composable("trades") { TradesScreen(nav) }
            composable("pnl") { PnlScreen(nav) }
            composable("activity") { ActivityScreen(nav) }
            composable("loans") { LoansScreen(nav) }
            composable("loan/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) { LoanScreen(nav, it.arguments?.getInt("id") ?: 0) }
            composable("salary") { SalaryScreen(nav) }
            composable("notifications") { NotificationsScreen(nav) }
            composable("more") { MoreScreen(nav) }
            composable("profile") { ProfileScreen(nav) }
            composable("verification") { VerificationScreen(nav) }
            composable("security") { SecurityScreen(nav) }
            composable("language") { LanguageScreen(nav, context) }
            composable("appearance") { AppearanceScreen(nav) }
            composable("notification-settings") { NotificationSettingsScreen(nav) }
            composable("help") { HelpScreen(nav) }
            composable("legal") { LegalScreen(nav) }
        }
    }
}

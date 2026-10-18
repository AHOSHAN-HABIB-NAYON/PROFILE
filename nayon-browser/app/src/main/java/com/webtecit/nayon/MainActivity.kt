package com.webtecit.nayon

import android.animation.AnimatorSet
import android.app.SearchManager
import android.content.Intent
import android.animation.ObjectAnimator
import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.activity.compose.setContent
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.Brightness
import com.webtecit.nayon.core.designsystem.theme.NayonTheme
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import com.webtecit.nayon.core.designsystem.theme.resolveBrightness
import com.webtecit.nayon.feature.browser.BrowserViewModel
import com.webtecit.nayon.navigation.NayonNavHost
import kotlinx.coroutines.delay
import java.util.Calendar

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels { NayonViewModelFactory.Factory }
    private val browser: BrowserViewModel by viewModels { NayonViewModelFactory.Factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)

        // Keep the system splash only until saved appearance is read (a few ms), so the
        // first frame already uses the user's theme. No artificial delay.
        splash.setKeepOnScreenCondition { viewModel.appearance.value == null || !browser.ready.value }
        splash.setOnExitAnimationListener { provider ->
            val view = provider.view
            val icon: View? = runCatching { provider.iconView }.getOrNull()
            AnimatorSet().apply {
                val fade = ObjectAnimator.ofFloat(view, View.ALPHA, 1f, 0f)
                if (icon != null) {
                    playTogether(
                        fade,
                        ObjectAnimator.ofFloat(icon, View.SCALE_X, 1f, 1.12f),
                        ObjectAnimator.ofFloat(icon, View.SCALE_Y, 1f, 1.12f),
                    )
                } else {
                    play(fade)
                }
                duration = 240L
                doOnEndCompat { provider.remove() }
                start()
            }
        }

        enableEdgeToEdge()
        browser.attachActivity(this)
        if (savedInstanceState == null) handleIntent(intent)

        setContent {
            val appearance by viewModel.appearance.collectAsStateWithLifecycle()
            appearance?.let { NayonRoot(it) }
        }
    }

    @Composable
    private fun NayonRoot(settings: AppearanceSettings) {
        val systemDark = isSystemInDarkTheme()
        val minuteOfDay by rememberMinuteOfDay(ticking = settings.mode == ThemeMode.SCHEDULED)
        val brightness = resolveBrightness(settings, systemDark, minuteOfDay)
        val darkSurfaces = brightness != Brightness.LIGHT

        // System bar icons must follow the app's resolved theme, not just the device setting.
        DisposableEffect(darkSurfaces) {
            enableEdgeToEdge(
                statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { darkSurfaces },
                navigationBarStyle = SystemBarStyle.auto(LIGHT_SCRIM, DARK_SCRIM) { darkSurfaces },
            )
            onDispose {}
        }

        NayonTheme(family = settings.family, brightness = brightness) {
            NayonNavHost(appearance = settings, browser = browser)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        browser.detachActivity(this)
        super.onDestroy()
    }

    /** Opens links shared from other apps, and web searches. */
    private fun handleIntent(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_VIEW -> intent.dataString?.let { browser.openExternalLink(it) }
            Intent.ACTION_WEB_SEARCH -> intent.getStringExtra(SearchManager.QUERY)?.takeIf { it.isNotBlank() }
                ?.let { browser.openSearch(it) }
        }
    }

    private companion object {
        // Same scrims androidx.activity uses for 3-button navigation.
        val LIGHT_SCRIM = Color.argb(0xe6, 0xFF, 0xFF, 0xFF)
        val DARK_SCRIM = Color.argb(0x80, 0x1b, 0x1b, 0x1b)
    }
}

private fun currentMinuteOfDay(): Int =
    Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }

/**
 * Current minute of day. When [ticking], it updates at each minute boundary while the
 * app is visible (STARTED), so a scheduled theme switches on time without background work.
 */
@Composable
private fun rememberMinuteOfDay(ticking: Boolean): State<Int> {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    return produceState(initialValue = currentMinuteOfDay(), ticking, lifecycle) {
        if (!ticking) return@produceState
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                value = currentMinuteOfDay()
                val msIntoMinute = System.currentTimeMillis() % 60_000L
                delay(60_000L - msIntoMinute + 50L)
            }
        }
    }
}

private inline fun AnimatorSet.doOnEndCompat(crossinline action: () -> Unit) {
    addListener(object : android.animation.AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: android.animation.Animator) = action()
    })
}

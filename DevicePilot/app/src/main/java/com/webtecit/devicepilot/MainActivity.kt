package com.webtecit.devicepilot

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.os.Bundle
import android.view.View
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.animation.doOnEnd
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.webtecit.devicepilot.firewall.FirewallController
import com.webtecit.devicepilot.firewall.FirewallPhase
import com.webtecit.devicepilot.firewall.FirewallState
import android.os.Build
import com.webtecit.devicepilot.brand.Attribution
import com.webtecit.devicepilot.brand.TamperedScreen
import com.webtecit.devicepilot.ui.DevicePilotRoot
import com.webtecit.devicepilot.ui.theme.DevicePilotTheme
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private var pendingRoute by mutableStateOf<String?>(null)
    private var ready = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Keep the splash only until settings (theme/onboarding) are loaded — no artificial delay.
        splash.setKeepOnScreenCondition { !ready }
        splash.setOnExitAnimationListener { provider ->
            // The icon view is absent when Android shows the splash without an icon
            // (for example when opened from a notification), so it is optional here.
            val icon: View? = runCatching { provider.iconView }.getOrNull()
            val animators = mutableListOf<android.animation.Animator>(
                ObjectAnimator.ofFloat(provider.view, View.ALPHA, 1f, 0f),
            )
            if (icon != null) {
                animators += ObjectAnimator.ofFloat(icon, View.SCALE_X, 1f, 1.15f)
                animators += ObjectAnimator.ofFloat(icon, View.SCALE_Y, 1f, 1.15f)
            }
            AnimatorSet().apply {
                playTogether(animators)
                duration = 260
                doOnEnd { provider.remove() }
                start()
            }
        }

        requestHighestRefreshRate()

        // Refuse to run if the developer attribution or photo was modified.
        if (!Attribution.verify(this)) {
            ready = true
            setContent { DevicePilotTheme(dark = true) { TamperedScreen() } }
            return
        }

        pendingRoute = intent?.getStringExtra(EXTRA_ROUTE)
        val container = DevicePilotApp.container(this)

        lifecycleScope.launch {
            val s = container.settings.current()
            // Settings (theme, onboarding) are loaded: the first frame can be drawn.
            ready = true
            // Resume the firewall if the user left it on and consent is still valid.
            if (s.firewallWanted && s.firewallRules.isNotEmpty() &&
                FirewallState.status.value.phase == FirewallPhase.OFF &&
                FirewallController.consentIntent(this@MainActivity) == null
            ) {
                FirewallController.start(this@MainActivity)
            }
        }

        setContent {
            DevicePilotRoot(
                container = container,
                initialRoute = pendingRoute,
                onRouteConsumed = { pendingRoute = null },
            )
        }
    }

    /**
     * Asks for the display's highest refresh rate (90/120/144 Hz) at the current resolution.
     * Android may still lower it, e.g. in battery saver.
     */
    private fun requestHighestRefreshRate() {
        runCatching {
            @Suppress("DEPRECATION")
            val d = (if (Build.VERSION.SDK_INT >= 30) this.display else windowManager.defaultDisplay) ?: return
            val current = d.mode
            val best = d.supportedModes
                .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
                .maxByOrNull { it.refreshRate } ?: return
            window.attributes = window.attributes.apply {
                preferredDisplayModeId = best.modeId
                if (Build.VERSION.SDK_INT >= 30) preferredRefreshRate = best.refreshRate
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ROUTE)?.let { pendingRoute = it }
    }

    companion object {
        const val EXTRA_ROUTE = "com.webtecit.devicepilot.ROUTE"
    }
}

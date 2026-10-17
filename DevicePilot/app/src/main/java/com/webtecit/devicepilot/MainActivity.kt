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
import com.webtecit.devicepilot.ui.DevicePilotRoot
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

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ROUTE)?.let { pendingRoute = it }
    }

    companion object {
        const val EXTRA_ROUTE = "com.webtecit.devicepilot.ROUTE"
    }
}

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
            val icon: View = provider.iconView
            val fade = ObjectAnimator.ofFloat(provider.view, View.ALPHA, 1f, 0f)
            val scaleX = ObjectAnimator.ofFloat(icon, View.SCALE_X, 1f, 1.15f)
            val scaleY = ObjectAnimator.ofFloat(icon, View.SCALE_Y, 1f, 1.15f)
            AnimatorSet().apply {
                playTogether(fade, scaleX, scaleY)
                duration = 260
                doOnEnd { provider.remove() }
                start()
            }
        }

        pendingRoute = intent?.getStringExtra(EXTRA_ROUTE)
        val container = DevicePilotApp.container(this)

        lifecycleScope.launch {
            val s = container.settings.current()
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
                onReady = { ready = true },
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

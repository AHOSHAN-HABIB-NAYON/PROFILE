package com.oryzenx.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.oryzenx.app.data.Fmt
import com.oryzenx.app.data.I18n
import com.oryzenx.app.data.data
import com.oryzenx.app.data.obj
import com.oryzenx.app.data.str
import com.oryzenx.app.push.PushRegistrar
import com.oryzenx.app.ui.AppRoot
import com.oryzenx.app.ui.AppState
import com.oryzenx.app.ui.theme.OryzenTheme
import kotlinx.coroutines.launch
import java.time.ZoneId

class MainActivity : ComponentActivity() {
    private var ready = false
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { !ready }
        enableEdgeToEdge()
        preferHighRefreshRate()
        val app = application as OryzenApp
        AppState.theme = app.session.theme
        handleIntent(intent)
        lifecycleScope.launch {
            // Splash/initialisation: public config + current session (if any).
            runCatching { app.api.get("/api/app/config").data() }.getOrNull()?.let { cfg ->
                AppState.config = cfg
                cfg.str("timezone")?.let { tz -> runCatching { ZoneId.of(tz) }.getOrNull()?.let { Fmt.zone = it; app.session.timezone = tz } }
            }
            if (app.session.token != null) {
                runCatching { app.api.get("/api/me").data().obj("user") }.getOrNull()?.let { u ->
                    AppState.user = u
                    u.str("locale")?.let { loc -> if (loc != I18n.locale) { app.session.locale = loc; I18n.apply(this@MainActivity, loc) } }
                    PushRegistrar.register(this@MainActivity)
                }
            }
            ready = true
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            OryzenTheme(AppState.theme) { AppRoot() }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getStringExtra("open") == "notifications") { AppState.pendingDeepLink = "notifications"; return }
        val uri = intent?.data ?: return
        if (uri.path?.startsWith("/reset-password") == true) {
            uri.getQueryParameter("token")?.let { AppState.pendingDeepLink = "reset/$it" }
        }
    }

    /**
     * Requests the highest refresh rate the display offers at the current resolution (90/120/144 Hz panels).
     * Android may still lower it for battery saving or thermal reasons; Compose animations follow vsync,
     * so they stay smooth at whatever rate the system grants.
     */
    @Suppress("DEPRECATION")
    private fun preferHighRefreshRate() {
        val display = (if (Build.VERSION.SDK_INT >= 30) display else windowManager.defaultDisplay) ?: return
        val current = display.mode
        val best = display.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .maxByOrNull { it.refreshRate } ?: return
        if (best.modeId != current.modeId) {
            window.attributes = window.attributes.apply { preferredDisplayModeId = best.modeId }
        }
    }
}

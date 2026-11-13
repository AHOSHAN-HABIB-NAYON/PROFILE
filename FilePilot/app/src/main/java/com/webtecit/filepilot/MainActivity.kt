package com.webtecit.filepilot

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.core.designsystem.FilePilotTheme
import com.webtecit.filepilot.core.designsystem.LocalDarkTheme
import com.webtecit.filepilot.core.preferences.ThemeMirror
import com.webtecit.filepilot.navigation.AppRoot
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Keep the system splash only until preferences (theme, onboarding state) are read.
        splash.setKeepOnScreenCondition { viewModel.prefs.value == null }

        setContent {
            val prefs by viewModel.prefs.collectAsStateWithLifecycle()
            val p = prefs
            if (p != null) {
                LaunchedEffect(p.themeMode) { ThemeMirror.update(this@MainActivity, p.themeMode) }
                LaunchedEffect(p.highRefreshRate) { applyRefreshRate(p.highRefreshRate) }
                FilePilotTheme(
                    themeMode = p.themeMode,
                    accent = p.accent,
                    dynamicColor = p.dynamicColor,
                    animations = p.animations,
                ) {
                    val dark = LocalDarkTheme.current
                    DisposableEffect(dark) {
                        enableEdgeToEdge(
                            statusBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT)
                            else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                            navigationBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT)
                            else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                        )
                        onDispose { }
                    }
                    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                        AppRoot(
                            afterSplash = viewModel::routeAfterSplash,
                            afterOnboarding = viewModel::routeAfterOnboarding,
                            prefs = p,
                        )
                    }
                }
            }
        }
    }

    /**
     * Requests the display's highest refresh rate at the current resolution when "Smooth
     * scrolling" is on; otherwise lets Android choose. Android may still lower it (battery saver,
     * thermal limits), and devices without high refresh rates simply keep 60 Hz.
     */
    private fun applyRefreshRate(high: Boolean) {
        runCatching {
            @Suppress("DEPRECATION")
            val display = (if (Build.VERSION.SDK_INT >= 30) display else windowManager.defaultDisplay) ?: return
            val params = window.attributes
            if (high) {
                val current = display.mode
                val best = display.supportedModes
                    .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
                    .maxByOrNull { it.refreshRate } ?: return
                params.preferredDisplayModeId = best.modeId
            } else {
                params.preferredDisplayModeId = 0
            }
            window.attributes = params
        }
    }
}

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
import androidx.compose.runtime.setValue
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
    private var locked by androidx.compose.runtime.mutableStateOf(true)
    private var stoppedAt = 0L

    override fun onStart() {
        super.onStart()
        // Lock again after 30 seconds in the background.
        if (stoppedAt > 0 && System.currentTimeMillis() - stoppedAt > 30_000) locked = true
    }

    override fun onStop() {
        super.onStop()
        stoppedAt = System.currentTimeMillis()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Keep the system splash only until preferences (theme, onboarding state) are read.
        splash.setKeepOnScreenCondition { viewModel.prefs.value == null }

        val picking = intent?.action == android.content.Intent.ACTION_GET_CONTENT
        if (picking) {
            viewModel.startOverride = com.webtecit.filepilot.navigation.BrowserRoute(android.os.Environment.getExternalStorageDirectory().absolutePath)
        } else if (intent?.action == android.content.Intent.ACTION_VIEW) {
            intent?.data?.takeIf { it.scheme == "file" }?.path?.let { viewModel.startOverride = com.webtecit.filepilot.navigation.BrowserRoute(it) }
        }
        val picker: ((com.webtecit.filepilot.core.storage.FileItem) -> Unit)? = if (!picking) null else { item ->
            val uri = if (item.id.startsWith("/")) androidx.core.content.FileProvider.getUriForFile(this, "$packageName.files", java.io.File(item.id))
            else android.net.Uri.parse(item.id.removePrefix(com.webtecit.filepilot.core.storage.SafFileSystem.PREFIX))
            setResult(RESULT_OK, android.content.Intent().setData(uri).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION))
            finish()
        }

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
                        val lockOn = p.appLock && com.webtecit.filepilot.core.security.VaultKeys.hasPin(this@MainActivity)
                        if (lockOn && locked) {
                            com.webtecit.filepilot.core.security.PinPad(
                                "FilePilot is locked", "Enter your PIN or use your fingerprint",
                                confirmNew = false,
                                verify = { com.webtecit.filepilot.core.security.VaultKeys.checkPin(this@MainActivity, it) },
                                onDone = { locked = false },
                            )
                        } else androidx.compose.runtime.CompositionLocalProvider(com.webtecit.filepilot.feature.browser.LocalFilePicker provides picker) {
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

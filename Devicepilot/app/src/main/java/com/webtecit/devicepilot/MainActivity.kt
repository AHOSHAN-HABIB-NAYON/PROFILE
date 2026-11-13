package com.webtecit.devicepilot

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.designsystem.DevicepilotTheme
import com.webtecit.devicepilot.core.designsystem.ThemeMode
import com.webtecit.devicepilot.core.designsystem.isDark
import com.webtecit.devicepilot.core.navigation.DevicepilotNavHost
import com.webtecit.devicepilot.data.local.AppSettings
import com.webtecit.devicepilot.data.local.SettingsRepository
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface MainUiState {
    data object Loading : MainUiState
    data class Ready(val settings: AppSettings) : MainUiState
}

@HiltViewModel
class MainViewModel @Inject constructor(private val settings: SettingsRepository) : ViewModel() {
    val state: StateFlow<MainUiState> = settings.settings
        .map { MainUiState.Ready(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MainUiState.Loading)

    fun toggleTheme(currentlyDark: Boolean) {
        viewModelScope.launch { settings.setThemeMode(if (currentlyDark) ThemeMode.LIGHT else ThemeMode.DARK) }
    }
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    private val pendingRoute = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { viewModel.state.value is MainUiState.Loading }
        pendingRoute.value = intent?.getStringExtra(EXTRA_ROUTE)

        setContent {
            val state by viewModel.state.collectAsStateWithLifecycle()
            val ready = state as? MainUiState.Ready ?: return@setContent
            val dark = ready.settings.themeMode.isDark()

            DisposableEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                    else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
                    navigationBarStyle = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                    else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
                )
                onDispose {}
            }

            DevicepilotTheme(darkTheme = dark) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    DevicepilotNavHost(
                        onboardingDone = ready.settings.onboardingDone,
                        isDark = dark,
                        onToggleTheme = { viewModel.toggleTheme(dark) },
                        pendingRoute = pendingRoute.value,
                        onPendingRouteHandled = { pendingRoute.value = null },
                    )
                }
            }
        }
        requestHighRefreshRate()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ROUTE)?.let { pendingRoute.value = it }
    }

    /**
     * Asks for the display's highest refresh rate at the current resolution so scrolling is smooth
     * on 90/120 Hz panels. The system may still lower it (battery saver, thermal limits).
     */
    private fun requestHighRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        @Suppress("DEPRECATION")
        val display = windowManager.defaultDisplay ?: return
        val current = display.mode
        val best = display.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .maxByOrNull { it.refreshRate } ?: return
        window.attributes = window.attributes.also { it.preferredDisplayModeId = best.modeId }
    }

    companion object {
        const val EXTRA_ROUTE = "route"
    }
}

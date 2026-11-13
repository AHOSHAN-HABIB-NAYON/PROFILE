package com.webtecit.filepilot

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.preferences.UserPreferences
import com.webtecit.filepilot.navigation.HomeRoute
import com.webtecit.filepilot.navigation.OnboardingRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class MainViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    repository: PreferencesRepository,
) : ViewModel() {
    /** Null until preferences are loaded; the system splash stays visible until then. */
    val prefs: StateFlow<UserPreferences?> = repository.preferences.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Set when another app asked FilePilot to open a folder or pick a file. */
    var startOverride: Any? = null

    fun routeAfterSplash(): Any {
        val p = prefs.value ?: return HomeRoute
        return when {
            !p.onboardingDone -> OnboardingRoute
            startOverride != null -> startOverride!!
            else -> routeAfterOnboarding()
        }
    }

    /** Permissions are asked later, when the user opens something that needs them. */
    /** After the intro: one page asking for file access, unless it was already granted or answered. */
    fun routeAfterOnboarding(): Any {
        val p = prefs.value
        val asked = p?.permissionsSetupDone == true
        return if (!asked && !com.webtecit.filepilot.core.permissions.StorageAccess.hasFullAccess(context)) {
            com.webtecit.filepilot.navigation.PermissionsRoute(setup = true)
        } else {
            HomeRoute
        }
    }
}

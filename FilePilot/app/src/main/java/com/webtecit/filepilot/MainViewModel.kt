package com.webtecit.filepilot

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.permissions.StorageAccess
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.preferences.UserPreferences
import com.webtecit.filepilot.navigation.HomeRoute
import com.webtecit.filepilot.navigation.OnboardingRoute
import com.webtecit.filepilot.navigation.PermissionIntroRoute
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

    fun routeAfterSplash(): Any {
        val p = prefs.value ?: return HomeRoute
        return when {
            !p.onboardingDone -> OnboardingRoute
            else -> routeAfterOnboarding()
        }
    }

    fun routeAfterOnboarding(): Any {
        val p = prefs.value
        val setupDone = p?.permissionsSetupDone == true
        return if (setupDone || StorageAccess.hasFullAccess(context)) HomeRoute else PermissionIntroRoute
    }
}

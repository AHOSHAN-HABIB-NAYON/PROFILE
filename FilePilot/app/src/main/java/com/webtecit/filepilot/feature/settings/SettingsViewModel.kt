package com.webtecit.filepilot.feature.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.permissions.StorageAccess
import com.webtecit.filepilot.core.preferences.AccentColor
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.preferences.StartLocation
import com.webtecit.filepilot.core.preferences.ThemeMode
import com.webtecit.filepilot.core.preferences.UserPreferences
import com.webtecit.filepilot.core.preferences.ViewMode
import com.webtecit.filepilot.core.storage.SortOrder
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repo: PreferencesRepository,
) : ViewModel() {
    val prefs: StateFlow<UserPreferences> =
        repo.preferences.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UserPreferences())

    private val _fullAccess = MutableStateFlow(false)
    val fullAccess: StateFlow<Boolean> = _fullAccess.asStateFlow()

    fun refreshAccess() {
        _fullAccess.value = StorageAccess.hasFullAccess(context)
    }

    fun setTheme(v: ThemeMode) = launch { repo.setThemeMode(v) }
    fun setAccent(v: AccentColor) = launch { repo.setAccent(v) }
    fun setDynamic(v: Boolean) = launch { repo.setDynamicColor(v) }
    fun setAnimations(v: Boolean) = launch { repo.setAnimations(v) }
    fun setHighRefresh(v: Boolean) = launch { repo.setHighRefreshRate(v) }
    fun setShowHidden(v: Boolean) = launch { repo.setShowHidden(v) }
    fun setShowExtensions(v: Boolean) = launch { repo.setShowExtensions(v) }
    fun setSort(v: SortOrder) = launch { repo.setSortOrder(v) }
    fun setViewMode(v: ViewMode) = launch { repo.setViewMode(v) }
    fun setStartLocation(v: StartLocation) = launch { repo.setStartLocation(v) }

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }
}

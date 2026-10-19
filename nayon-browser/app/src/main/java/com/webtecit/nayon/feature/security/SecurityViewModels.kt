package com.webtecit.nayon.feature.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.nayon.data.security.SavedLogin
import com.webtecit.nayon.data.security.SecurityRepository
import com.webtecit.nayon.data.security.SiteKind
import com.webtecit.nayon.data.security.SitePermission
import com.webtecit.nayon.data.settings.BrowserPreferencesRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class PasswordsViewModel(
    private val security: SecurityRepository,
    private val prefs: BrowserPreferencesRepository,
) : ViewModel() {
    val logins: StateFlow<List<SavedLogin>?> = security.logins.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val neverSave: StateFlow<List<String>> = security.neverSaveSites.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val offerToSave: StateFlow<Boolean> = prefs.preferences.map { it.savePasswords }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    suspend fun password(id: Long): String? = security.password(id)
    fun delete(id: Long) = viewModelScope.launch { security.delete(id) }
    fun allowSaving(origin: String) = viewModelScope.launch { security.allowSaving(origin) }
    fun deleteAll() = viewModelScope.launch { security.deleteAllPasswords() }
    fun setOfferToSave(enabled: Boolean) = viewModelScope.launch { prefs.setSavePasswords(enabled) }
}

class SiteSettingsViewModel(private val security: SecurityRepository) : ViewModel() {
    /** Sites with remembered decisions, grouped by site. */
    val sites: StateFlow<Map<String, List<SitePermission>>?> = security.sitePermissions
        .map { list -> list.groupBy { it.origin }.toSortedMap() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun set(origin: String, kind: SiteKind, allowed: Boolean?) = viewModelScope.launch { security.setDecision(origin, kind, allowed) }
    fun resetSite(origin: String) = viewModelScope.launch { security.resetSite(origin) }
    fun resetAll() = viewModelScope.launch { security.resetAllPermissions() }
}

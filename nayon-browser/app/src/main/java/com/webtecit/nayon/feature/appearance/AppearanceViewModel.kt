package com.webtecit.nayon.feature.appearance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import com.webtecit.nayon.data.settings.AppearanceRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AppearanceViewModel(private val repository: AppearanceRepository) : ViewModel() {
    val settings: StateFlow<AppearanceSettings> = repository.appearance
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppearanceSettings())

    fun setMode(mode: ThemeMode) = viewModelScope.launch { repository.setMode(mode) }
    fun setFamily(family: ThemeFamily) = viewModelScope.launch { repository.setFamily(family) }
    fun setDarkStart(minute: Int) = viewModelScope.launch {
        repository.setSchedule(minute, settings.value.darkEndMinute)
    }
    fun setDarkEnd(minute: Int) = viewModelScope.launch {
        repository.setSchedule(settings.value.darkStartMinute, minute)
    }
    fun setScheduleUsesAmoled(enabled: Boolean) = viewModelScope.launch { repository.setScheduleUsesAmoled(enabled) }
}

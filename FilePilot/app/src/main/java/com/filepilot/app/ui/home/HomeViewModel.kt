package com.filepilot.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.filepilot.app.AppContainer
import com.filepilot.app.data.storage.VolumeInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

class HomeViewModel(private val container: AppContainer) : ViewModel() {
    private val _volumes = MutableStateFlow<List<VolumeInfo>>(emptyList())
    val volumes: StateFlow<List<VolumeInfo>> = _volumes.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    private val _loaded = MutableStateFlow(false)
    val loaded: StateFlow<Boolean> = _loaded.asStateFlow()

    init {
        load()
        // Storage numbers change after file operations; refresh then, not on a timer.
        viewModelScope.launch { container.operations.version.drop(1).collect { load() } }
    }

    fun load(manual: Boolean = false) {
        viewModelScope.launch {
            if (manual) _refreshing.value = true
            _volumes.value = runCatching { container.storage.volumes() }.getOrDefault(emptyList())
            _loaded.value = true
            _refreshing.value = false
        }
    }
}

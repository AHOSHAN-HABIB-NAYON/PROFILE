package com.webtecit.devicepilot.data.install

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class InstallFailure { ABORTED, BLOCKED, CONFLICT, INCOMPATIBLE, INVALID, STORAGE, TIMEOUT, OTHER }

sealed interface InstallState {
    data object Idle : InstallState
    data class Copying(val packageName: String) : InstallState
    data class WaitingForUser(val packageName: String) : InstallState
    /** Android reported success AND the package is now verified as installed. */
    data class Installed(val packageName: String, val versionCode: Long?) : InstallState
    data class Failed(val packageName: String, val reason: InstallFailure, val message: String?) : InstallState
}

/** Process-wide channel between the system result callback and the UI. */
object InstallEvents {
    private val _state = MutableStateFlow<InstallState>(InstallState.Idle)
    val state: StateFlow<InstallState> = _state.asStateFlow()

    fun update(s: InstallState) { _state.value = s }
    fun reset() { _state.value = InstallState.Idle }
}

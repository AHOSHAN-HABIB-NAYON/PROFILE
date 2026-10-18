package com.appfix.studio.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.appfix.core.util.CancelToken
import com.appfix.core.util.OperationCancelledException
import com.appfix.core.util.ProgressListener
import com.appfix.studio.AppContainer
import com.appfix.studio.data.repo.ImportOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

sealed interface ImportState {
    data object Idle : ImportState
    data class Running(val title: String, val done: Long, val total: Long, val label: String) : ImportState
    data class Done(val projectId: String, val warnings: List<String>) : ImportState
    data class Failed(val title: String, val message: String) : ImportState
}

class ImportViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<ImportState>(ImportState.Idle)
    val state: StateFlow<ImportState> = _state.asStateFlow()
    private var job: Job? = null
    private val cancelled = AtomicBoolean(false)

    fun importApk(uri: Uri) = run("Importing APK") { p, c -> container.projects.importApk(uri, p, c) }
    fun importZip(uri: Uri) = run("Importing ZIP project") { p, c -> container.projects.importZip(uri, p, c) }
    fun importFolder(uri: Uri) = run("Copying folder") { p, c -> container.projects.importFolder(uri, p, c) }
    fun importSample() = run("Importing sample project") { p, c -> container.projects.importSample(p, c) }
    fun importGitHub(repo: String, ref: String?, token: String?) =
        run("Downloading from GitHub") { p, c -> container.projects.importGitHub(repo, ref, token, p, c) }

    private fun run(title: String, block: suspend (ProgressListener, CancelToken) -> ImportOutcome) {
        if (_state.value is ImportState.Running) return
        cancelled.set(false)
        _state.value = ImportState.Running(title, 0, -1, "Starting…")
        val progress = ProgressListener { done, total, label ->
            if (!cancelled.get()) _state.value = ImportState.Running(title, done, total, label)
        }
        val cancel = CancelToken { cancelled.get() }
        job = viewModelScope.launch {
            try {
                val outcome = block(progress, cancel)
                container.settings.setCurrentProject(outcome.projectId)
                _state.value = ImportState.Done(outcome.projectId, outcome.warnings)
            } catch (e: OperationCancelledException) {
                _state.value = ImportState.Idle
            } catch (e: CancellationException) {
                _state.value = ImportState.Idle
                throw e
            } catch (e: Exception) {
                _state.value = ImportState.Failed(title, e.message ?: "Import failed")
            }
        }
    }

    fun cancel() {
        cancelled.set(true)
    }

    fun dismiss() {
        if (_state.value !is ImportState.Running) _state.value = ImportState.Idle
    }
}

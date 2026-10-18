package com.appfix.studio.ui.repair

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.appfix.core.analysis.AnalysisReport
import com.appfix.core.analysis.BuildLogReport
import com.appfix.core.analysis.CrashReport
import com.appfix.core.analysis.Finding
import com.appfix.core.patch.ChangeSet
import com.appfix.core.util.CancelToken
import com.appfix.studio.AppContainer
import com.appfix.studio.data.db.ProjectEntity
import com.appfix.studio.data.settings.AppSettings
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import java.util.concurrent.atomic.AtomicBoolean

data class FixPreview(val finding: Finding, val change: ChangeSet, val problems: List<String>)

class RepairViewModel(private val container: AppContainer) : ViewModel() {
    private val repo = container.projects

    val projects: StateFlow<List<ProjectEntity>> = repo.projects.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val settings: StateFlow<AppSettings> = container.settings.settings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())
    val selected: StateFlow<ProjectEntity?> = combine(projects, settings) { list, s -> list.firstOrNull { it.id == s.currentProjectId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val analysis = MutableStateFlow<AnalysisReport?>(null)
    val analyzing = MutableStateFlow(false)
    val preview = MutableStateFlow<FixPreview?>(null)
    val crash = MutableStateFlow<CrashReport?>(null)
    val buildLog = MutableStateFlow<BuildLogReport?>(null)
    val message = MutableStateFlow<String?>(null)
    val working = MutableStateFlow(false)

    private var analysisJob: Job? = null
    private val cancelFlag = AtomicBoolean(false)
    private var loadedFor: String? = null

    fun select(id: String) {
        viewModelScope.launch { container.settings.setCurrentProject(id) }
    }

    /** Loads the cached analysis when the selected project changes. */
    fun onProjectShown(id: String?) {
        if (id == loadedFor) return
        loadedFor = id
        analysis.value = null
        crash.value = null
        buildLog.value = null
        if (id != null) viewModelScope.launch { analysis.value = withContext(Dispatchers.IO) { repo.lastAnalysis(id) } }
    }

    fun analyze() {
        val id = selected.value?.id ?: return
        if (analyzing.value) return
        cancelFlag.set(false)
        analyzing.value = true
        analysisJob = viewModelScope.launch {
            try {
                analysis.value = repo.analyze(id, CancelToken { cancelFlag.get() })
            } catch (e: com.appfix.core.util.OperationCancelledException) {
                message.value = "Analysis cancelled"
            } catch (e: Exception) {
                message.value = "Analysis failed: ${e.message}"
            } finally {
                analyzing.value = false
            }
        }
    }

    fun cancelAnalysis() = cancelFlag.set(true)

    fun previewFix(finding: Finding) {
        val id = selected.value?.id ?: return
        working.value = true
        viewModelScope.launch {
            try {
                val change = repo.createFix(id, finding)
                preview.value = FixPreview(finding, change, repo.validateChange(id, change))
            } catch (e: Exception) {
                message.value = e.message ?: "No fix available"
            } finally {
                working.value = false
            }
        }
    }

    fun applyPreview() {
        val id = selected.value?.id ?: return
        val p = preview.value ?: return
        working.value = true
        viewModelScope.launch {
            try {
                repo.applyChange(id, p.change, settings.value.autoBackupBeforeChanges)
                preview.value = null
                message.value = "Fix applied. You can undo it from the project's History tab."
                analysis.value = repo.analyze(id, CancelToken.NONE)
                crash.value = null
            } catch (e: Exception) {
                message.value = "Could not apply: ${e.message}"
            } finally {
                working.value = false
            }
        }
    }

    fun discardPreview() { preview.value = null }

    fun analyzeCrash(text: String) {
        if (text.isBlank()) { message.value = "Paste a crash log first"; return }
        working.value = true
        viewModelScope.launch {
            try { crash.value = repo.analyzeCrash(selected.value?.id, text.take(MAX_LOG)) } catch (e: Exception) { message.value = e.message } finally { working.value = false }
        }
    }

    fun analyzeBuildLog(text: String) {
        if (text.isBlank()) { message.value = "Paste a build log first"; return }
        working.value = true
        viewModelScope.launch {
            try { buildLog.value = repo.analyzeBuildLog(selected.value?.id, text.take(MAX_LOG)) } catch (e: Exception) { message.value = e.message } finally { working.value = false }
        }
    }

    fun consumeMessage() { message.value = null }

    companion object {
        const val MAX_LOG = 2_000_000
    }
}

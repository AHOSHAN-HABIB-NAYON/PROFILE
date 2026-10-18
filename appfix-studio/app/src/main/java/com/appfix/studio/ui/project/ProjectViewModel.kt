package com.appfix.studio.ui.project

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.appfix.core.apk.ApkReport
import com.appfix.core.backup.Snapshot
import com.appfix.core.patch.ChangeRecord
import com.appfix.core.project.ProjectInfo
import com.appfix.studio.AppContainer
import com.appfix.studio.data.db.ProjectEntity
import com.appfix.studio.signing.SignatureVerification
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ProjectViewModel(private val container: AppContainer, val projectId: String) : ViewModel() {
    private val repo = container.projects

    val project: StateFlow<ProjectEntity?> = repo.observe(projectId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val apkReport = MutableStateFlow<ApkReport?>(null)
    val info = MutableStateFlow<ProjectInfo?>(null)
    val signature = MutableStateFlow<SignatureVerification?>(null)
    val backups = MutableStateFlow<List<Snapshot>>(emptyList())
    val history = MutableStateFlow<List<ChangeRecord>>(emptyList())
    val busy = MutableStateFlow<String?>(null)
    val message = MutableStateFlow<String?>(null)
    /** Set when an undo was refused because files changed afterwards; the UI offers a forced undo. */
    val undoConflict = MutableStateFlow<ChangeRecord?>(null)
    /** Bumped after anything that changes workspace files, so file trees reload. */
    val revision = MutableStateFlow(0)

    init {
        reload()
        viewModelScope.launch { container.settings.setCurrentProject(projectId) }
    }

    fun reload() {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                apkReport.value = repo.apkReport(projectId)
                info.value = repo.projectInfo(projectId)
            }
            backups.value = repo.backups(projectId)
            history.value = repo.history(projectId)
        }
    }

    fun verifySignature() = task("Verifying signature…") { signature.value = repo.verifySignature(projectId) }

    fun createBackup(label: String) = task("Creating backup…") {
        val s = repo.createBackup(projectId, label)
        backups.value = repo.backups(projectId)
        message.value = "Backup created (${s.fileCount} files)"
    }

    fun restoreBackup(snapshot: Snapshot) = task("Restoring backup…") {
        repo.createBackup(projectId, "Before restoring \"${snapshot.label}\"")
        repo.restoreBackup(projectId, snapshot.id)
        info.value = repo.refreshProjectInfo(projectId)
        backups.value = repo.backups(projectId)
        revision.value++
        message.value = "Restored \"${snapshot.label}\". The previous state was saved as a backup."
    }

    fun deleteBackup(snapshot: Snapshot) = task("Deleting backup…") {
        repo.deleteBackup(projectId, snapshot.id)
        backups.value = repo.backups(projectId)
    }

    fun undo(record: ChangeRecord, force: Boolean = false) = task("Undoing change…") {
        try {
            repo.undo(projectId, record.changeSet.id, force)
        } catch (e: com.appfix.core.patch.ChangeConflictException) {
            undoConflict.value = record
            return@task
        }
        history.value = repo.history(projectId)
        info.value = repo.refreshProjectInfo(projectId)
        revision.value++
        message.value = "Undid \"${record.changeSet.title}\""
    }

    fun rename(name: String) = task(null) { repo.rename(projectId, name) }

    fun delete(onDone: () -> Unit) = task("Deleting project…") {
        container.settings.setCurrentProject(null)
        repo.delete(projectId)
        onDone()
    }

    fun consumeMessage() { message.value = null }

    private fun task(label: String?, block: suspend () -> Unit) {
        if (busy.value != null) return
        busy.value = label ?: ""
        viewModelScope.launch {
            try {
                block()
            } catch (e: Exception) {
                message.value = e.message ?: e.javaClass.simpleName
            } finally {
                busy.value = null
            }
        }
    }
}

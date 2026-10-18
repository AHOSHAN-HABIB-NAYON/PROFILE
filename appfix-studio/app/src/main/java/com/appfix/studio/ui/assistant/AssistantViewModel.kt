package com.appfix.studio.ui.assistant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.appfix.core.ai.AiClient
import com.appfix.core.ai.AiConfig
import com.appfix.core.ai.AiContextBuilder
import com.appfix.core.ai.AiMessage
import com.appfix.core.ai.AiPrompt
import com.appfix.core.ai.AiRequest
import com.appfix.core.analysis.Finding
import com.appfix.core.analysis.Severity
import com.appfix.core.build.BuildPlanner
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.UnifiedPatch
import com.appfix.core.project.ProjectInfo
import com.appfix.core.util.CancelToken
import com.appfix.core.util.TextFiles
import com.appfix.studio.AppContainer
import com.appfix.studio.security.SecretStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class ChatTurn(val role: String, val text: String, val sharedFiles: List<String> = emptyList())

/** A patch found in an answer, already checked against the current files. */
data class ProposedPatch(val turnIndex: Int, val change: ChangeSet?, val problems: List<String>)

data class ValidationResult(val errorsBefore: Int, val errorsAfter: Int, val newFindings: List<Finding>, val resolved: List<Finding>)

class AssistantViewModel(private val container: AppContainer, val projectId: String) : ViewModel() {
    private val repo = container.projects
    val config = MutableStateFlow(AiConfig())
    val hasKey = MutableStateFlow(container.secrets.has(SecretStore.AI_KEY))
    val files = MutableStateFlow<List<String>>(emptyList())
    val selected = MutableStateFlow<List<String>>(emptyList())
    val findings = MutableStateFlow<List<Finding>>(emptyList())
    val includeFindings = MutableStateFlow(true)
    val log = MutableStateFlow("")
    val turns = MutableStateFlow<List<ChatTurn>>(emptyList())
    val preview = MutableStateFlow<AiPrompt?>(null)
    val sending = MutableStateFlow(false)
    val patch = MutableStateFlow<ProposedPatch?>(null)
    val validation = MutableStateFlow<ValidationResult?>(null)
    val message = MutableStateFlow<String?>(null)
    private var info: ProjectInfo? = null
    private var job: Job? = null

    private val workspace: File get() = container.storage.workspace(projectId)
    private val prefix: String get() = info?.root?.takeIf { it.isNotEmpty() }?.let { "$it/" }.orEmpty()
    private val projectRoot: File get() = info?.root?.takeIf { it.isNotEmpty() }?.let { File(workspace, it) } ?: workspace

    init {
        viewModelScope.launch {
            config.value = container.settings.settings.first().aiConfig
            info = withContext(Dispatchers.IO) { repo.projectInfo(projectId) }
            val report = withContext(Dispatchers.IO) { repo.lastAnalysis(projectId) }
            findings.value = report?.findings.orEmpty().filter { it.severity != Severity.INFO }
            files.value = withContext(Dispatchers.IO) { listFiles(projectRoot) }
            // Pre-select the files the findings point at, plus the main build files.
            val wanted = (findings.value.mapNotNull { it.file?.removePrefix(prefix) } + listOf("app/build.gradle.kts", "app/build.gradle", "app/src/main/AndroidManifest.xml"))
            selected.value = wanted.filter { it in files.value }.distinct().take(6)
        }
    }

    fun saveConfig(newConfig: AiConfig, key: String?) {
        config.value = newConfig
        viewModelScope.launch {
            container.settings.setAiConfig(newConfig)
            if (key != null) {
                if (key.isBlank()) container.secrets.remove(SecretStore.AI_KEY) else container.secrets.put(SecretStore.AI_KEY, key.trim())
                hasKey.value = container.secrets.has(SecretStore.AI_KEY)
            }
            message.value = "AI settings saved"
        }
    }

    fun toggleFile(path: String) {
        selected.value = if (path in selected.value) selected.value - path else (selected.value + path).take(20)
    }

    private fun request(question: String) = AiRequest(
        question = question,
        files = selected.value,
        findings = if (includeFindings.value) findings.value else emptyList(),
        log = log.value.takeIf { it.isNotBlank() },
    )

    /** Builds exactly what will be sent so the user can review it before anything leaves the device. */
    fun prepare(question: String) {
        if (question.isBlank()) return
        viewModelScope.launch {
            preview.value = withContext(Dispatchers.IO) { AiContextBuilder.build(projectRoot, info, request(question)) }
        }
    }

    fun cancelPreview() { preview.value = null }

    fun send() {
        val prompt = preview.value ?: return
        preview.value = null
        val problem = config.value.problem(hasKey.value)
        if (problem != null) { message.value = problem; return }
        val question = prompt.user.substringAfterLast("## Question\n").trim()
        val history = turns.value
        turns.value = history + ChatTurn("user", question, prompt.shared.map { it.path })
        sending.value = true
        job = viewModelScope.launch {
            try {
                // Earlier turns are resent as plain text; file contents only go with the newest question.
                val messages = history.map { AiMessage(it.role, it.text) } + AiMessage("user", prompt.user)
                val answer = withContext(Dispatchers.IO) {
                    AiClient(config.value, container.secrets.get(SecretStore.AI_KEY)).complete(prompt.system, messages)
                }
                turns.value = turns.value + ChatTurn("assistant", answer)
                checkPatch(turns.value.lastIndex, answer)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                message.value = e.message ?: e.javaClass.simpleName
                turns.value = turns.value.dropLast(1)
            } finally {
                sending.value = false
            }
        }
    }

    fun cancelSend() { job?.cancel(); sending.value = false }

    private suspend fun checkPatch(index: Int, answer: String) {
        val diff = UnifiedPatch.extract(answer) ?: return
        val result = withContext(Dispatchers.IO) {
            UnifiedPatch.toChangeSet(projectRoot, diff, "AI patch", "ai", "Proposed by the AI assistant; review before applying.")
        }
        val change = result.changeSet?.let { set -> set.copy(changes = set.changes.map { it.copy(path = prefix + it.path) }) }
        val problems = result.problems + change?.let { repo.validateChange(projectId, it) }.orEmpty()
        patch.value = ProposedPatch(index, if (problems.isEmpty()) change else null, problems)
        validation.value = null
    }

    fun rejectPatch() {
        patch.value = null
        message.value = "Patch rejected. Nothing was changed."
    }

    /** Applies the reviewed patch (with a backup when enabled), then re-runs analysis to compare. */
    fun applyPatch() {
        val change = patch.value?.change ?: return
        sending.value = true
        viewModelScope.launch {
            try {
                val before = repo.lastAnalysis(projectId) ?: repo.analyze(projectId, CancelToken.NONE)
                repo.applyChange(projectId, change, container.settings.settings.first().autoBackupBeforeChanges)
                patch.value = null
                val after = repo.analyze(projectId, CancelToken.NONE)
                val beforeKeys = before.findings.map { it.key }.toSet()
                val afterKeys = after.findings.map { it.key }.toSet()
                validation.value = ValidationResult(
                    errorsBefore = before.findings.count { it.severity == Severity.ERROR },
                    errorsAfter = after.findings.count { it.severity == Severity.ERROR },
                    newFindings = after.findings.filter { it.key !in beforeKeys && it.severity != Severity.INFO },
                    resolved = before.findings.filter { it.key !in afterKeys },
                )
                findings.value = after.findings.filter { it.severity != Severity.INFO }
                files.value = withContext(Dispatchers.IO) { listFiles(projectRoot) }
                message.value = "Patch applied. Undo it from the project's History tab if needed."
            } catch (e: Exception) {
                message.value = "Could not apply: ${e.message}"
            } finally {
                sending.value = false
            }
        }
    }

    fun clearChat() { turns.value = emptyList(); patch.value = null; validation.value = null }
    fun consumeMessage() { message.value = null }

    companion object {
        private val skip = setOf("build", ".gradle", ".git", ".idea", ".kotlin", "node_modules", ".cxx")

        fun listFiles(root: File, limit: Int = 3000): List<String> {
            val out = mutableListOf<String>()
            fun walk(dir: File, rel: String) {
                val children = dir.listFiles()?.sortedBy { it.name } ?: return
                for (f in children) {
                    if (out.size >= limit) return
                    val path = if (rel.isEmpty()) f.name else "$rel/${f.name}"
                    if (f.isDirectory) { if (f.name !in skip) walk(f, path) }
                    else if (f.length() < 2_000_000 && !BuildPlanner.isSecret(path) && TextFiles.isProbablyText(f)) out += path
                }
            }
            walk(root, "")
            return out
        }
    }
}

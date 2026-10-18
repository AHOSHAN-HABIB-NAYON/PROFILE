package com.appfix.studio.ui.editor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.appfix.core.highlight.Highlighter
import com.appfix.core.highlight.SyntaxLanguage
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.Diff
import com.appfix.core.patch.FileChange
import com.appfix.core.util.PathSafety
import com.appfix.core.util.TextFiles
import com.appfix.core.util.formatBytes
import com.appfix.studio.AppContainer
import com.appfix.studio.data.db.ProjectEntity
import com.appfix.studio.data.db.ProjectKind
import io.github.rosemoe.sora.text.Content
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Request from another screen (Repair, Search, Project) to open a file in the editor. */
data class OpenRequest(val projectId: String, val path: String, val line: Int? = null)

data class EditorTab(val path: String, val dirty: Boolean, val language: SyntaxLanguage)

data class SaveConflict(val path: String, val diskText: String)

/** Line to move the cursor to once [path] is shown. Consumed by the screen. */
data class JumpTarget(val path: String, val line: Int, val token: Long = System.nanoTime())

private class Buffer(val content: Content, var savedText: String, val language: SyntaxLanguage)

private class Session(val projectId: String) {
    val buffers = LinkedHashMap<String, Buffer>()
    var active: String? = null
}

class EditorViewModel(private val container: AppContainer) : ViewModel() {
    private val repo = container.projects
    private val sessions = HashMap<String, Session>()

    val project: StateFlow<ProjectEntity?> = combine(repo.projects, container.settings.settings.map { it.currentProjectId }.distinctUntilChanged()) { list, id ->
        list.firstOrNull { it.id == id && it.kind == ProjectKind.SOURCE }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val tabs = MutableStateFlow<List<EditorTab>>(emptyList())
    val active = MutableStateFlow<String?>(null)
    val message = MutableStateFlow<String?>(null)
    val conflict = MutableStateFlow<SaveConflict?>(null)
    val jump = MutableStateFlow<JumpTarget?>(null)
    val treeRevision = MutableStateFlow(0)
    val busy = MutableStateFlow(false)
    private var currentSession: Session? = null
    private val dirtyFlags = HashMap<Pair<String, String>, Boolean>()

    init {
        viewModelScope.launch { project.collect { p -> showSession(p?.id) } }
        viewModelScope.launch {
            container.editorRequests.collect { req ->
                if (req == null) return@collect
                container.editorRequests.value = null
                if (project.value?.id != req.projectId) container.settings.setCurrentProject(req.projectId)
                open(req.projectId, req.path, req.line)
            }
        }
    }

    private fun showSession(projectId: String?) {
        currentSession = projectId?.let { sessions.getOrPut(it) { Session(it) } }
        publish()
    }

    private fun publish() {
        val s = currentSession
        tabs.value = s?.buffers?.map { (path, b) -> EditorTab(path, dirtyFlags[s.projectId to path] == true, b.language) }.orEmpty()
        active.value = s?.active
    }

    /** The live editor content for [path] in the current project. */
    fun contentOf(path: String): Content? = currentSession?.buffers?.get(path)?.content

    fun languageOf(path: String): SyntaxLanguage = currentSession?.buffers?.get(path)?.language ?: Highlighter.languageFor(path)

    fun open(path: String, line: Int? = null) {
        val id = project.value?.id ?: return
        open(id, path, line)
    }

    private fun open(projectId: String, path: String, line: Int?) {
        viewModelScope.launch {
            val session = sessions.getOrPut(projectId) { Session(projectId) }
            if (path !in session.buffers) {
                val loaded = withContext(Dispatchers.IO) {
                    val f = PathSafety.resolveInside(container.storage.workspace(projectId), path) ?: return@withContext Result.failure<String>(IllegalArgumentException("Invalid path"))
                    when {
                        !f.isFile -> Result.failure(IllegalStateException("File not found: $path"))
                        f.length() > MAX_EDIT_BYTES -> Result.failure(IllegalStateException("${f.name} is ${formatBytes(f.length())}; files over ${formatBytes(MAX_EDIT_BYTES)} open read-only in the viewer."))
                        !TextFiles.isProbablyText(f) -> Result.failure(IllegalStateException("${f.name} is a binary file and cannot be edited as text."))
                        else -> Result.success(f.readText())
                    }
                }
                val text = loaded.getOrElse { message.value = it.message; return@launch }
                session.buffers[path] = Buffer(Content(text), text, Highlighter.languageFor(path.substringAfterLast('/')))
            }
            session.active = path
            if (line != null && line > 0) jump.value = JumpTarget(path, line)
            if (currentSession?.projectId == projectId) publish()
        }
    }

    fun activate(path: String) {
        currentSession?.active = path
        publish()
    }

    fun markDirty(path: String) {
        val s = currentSession ?: return
        val key = s.projectId to path
        if (dirtyFlags[key] != true) {
            dirtyFlags[key] = true
            publish()
        }
    }

    fun isDirty(path: String): Boolean = currentSession?.let { dirtyFlags[it.projectId to path] } == true

    fun hasUnsavedChanges(): Boolean = tabs.value.any { it.dirty }

    fun close(path: String) {
        val s = currentSession ?: return
        s.buffers.remove(path)
        dirtyFlags.remove(s.projectId to path)
        if (s.active == path) s.active = s.buffers.keys.lastOrNull()
        publish()
    }

    /** Reverts the buffer to the saved text (or reloads from disk when [fromDisk]). */
    fun revert(path: String, fromDisk: Boolean = false) {
        val s = currentSession ?: return
        val b = s.buffers[path] ?: return
        viewModelScope.launch {
            val text = if (fromDisk) withContext(Dispatchers.IO) { PathSafety.resolveInside(container.storage.workspace(s.projectId), path)?.takeIf { it.isFile }?.readText() } else b.savedText
            if (text == null) { message.value = "$path no longer exists"; return@launch }
            s.buffers[path] = Buffer(Content(text), text, b.language)
            dirtyFlags.remove(s.projectId to path)
            publish()
            treeRevision.value++
        }
    }

    /** Pending diff between the last saved text and the current buffer. */
    fun pendingChange(path: String): FileChange? {
        val b = currentSession?.buffers?.get(path) ?: return null
        val now = b.content.toString()
        return if (now == b.savedText) null else FileChange(path, b.savedText, now)
    }

    /**
     * Saves through ChangeApplier, so every save is recorded in History and can be undone.
     * If the file changed on disk since it was opened, a [SaveConflict] is raised instead.
     */
    fun save(path: String, overwrite: Boolean = false) {
        val s = currentSession ?: return
        val b = s.buffers[path] ?: return
        val text = b.content.toString()
        busy.value = true
        viewModelScope.launch {
            try {
                val disk = withContext(Dispatchers.IO) { PathSafety.resolveInside(container.storage.workspace(s.projectId), path)?.takeIf { it.isFile }?.readText() }
                if (disk == null) { message.value = "$path was deleted; it cannot be saved"; return@launch }
                if (disk != b.savedText && !overwrite) { conflict.value = SaveConflict(path, disk); return@launch }
                if (disk == text) {
                    b.savedText = text
                    dirtyFlags.remove(s.projectId to path); publish()
                    message.value = "No changes to save"
                    return@launch
                }
                val change = FileChange(path, disk, text)
                val d = Diff.structured(change)
                val large = d.added + d.removed >= LARGE_EDIT_LINES
                val set = ChangeSet(title = "Edit ${path.substringAfterLast('/')}", description = "+${d.added} −${d.removed} lines in $path", source = "editor", changes = listOf(change))
                if (large && container.settings.settings.first().autoBackupBeforeChanges) repo.createBackup(s.projectId, "Before large edit of ${path.substringAfterLast('/')}")
                repo.applyChange(s.projectId, set, backupFirst = false)
                b.savedText = text
                dirtyFlags.remove(s.projectId to path)
                conflict.value = null
                publish()
                message.value = "Saved ${path.substringAfterLast('/')}" + if (large) " (backup created first)" else ""
            } catch (e: Exception) {
                message.value = "Save failed: ${e.message}"
            } finally {
                busy.value = false
            }
        }
    }

    fun saveAll() = tabs.value.filter { it.dirty }.forEach { save(it.path) }

    /** Creates a file through the change pipeline so it can be undone. */
    fun createFile(relativePath: String) {
        val s = currentSession ?: return
        val norm = PathSafety.normalizeRelative(relativePath.trim())
        if (norm == null) { message.value = "Invalid file name"; return }
        viewModelScope.launch {
            try {
                val target = PathSafety.resolveInside(container.storage.workspace(s.projectId), norm)!!
                if (withContext(Dispatchers.IO) { target.exists() }) { message.value = "$norm already exists"; return@launch }
                repo.applyChange(s.projectId, ChangeSet(title = "Create ${norm.substringAfterLast('/')}", source = "editor", changes = listOf(FileChange(norm, null, ""))), backupFirst = false)
                treeRevision.value++
                open(s.projectId, norm, null)
            } catch (e: Exception) {
                message.value = "Could not create file: ${e.message}"
            }
        }
    }

    fun deleteFile(path: String) {
        val s = currentSession ?: return
        viewModelScope.launch {
            try {
                val f = PathSafety.resolveInside(container.storage.workspace(s.projectId), path) ?: return@launch
                val text = withContext(Dispatchers.IO) { if (f.isFile && TextFiles.isProbablyText(f) && f.length() <= MAX_EDIT_BYTES) f.readText() else null }
                if (text == null) { message.value = "Only text files can be deleted from the editor (so the deletion can be undone)."; return@launch }
                repo.applyChange(s.projectId, ChangeSet(title = "Delete ${f.name}", source = "editor", changes = listOf(FileChange(path, text, null))), backupFirst = false)
                close(path)
                treeRevision.value++
                message.value = "Deleted ${f.name}. Undo it from the project's History tab."
            } catch (e: Exception) {
                message.value = "Could not delete: ${e.message}"
            }
        }
    }

    fun consumeMessage() { message.value = null }
    fun consumeJump() { jump.value = null }

    companion object {
        const val MAX_EDIT_BYTES = 2L * 1024 * 1024
        const val LARGE_EDIT_LINES = 80
    }
}

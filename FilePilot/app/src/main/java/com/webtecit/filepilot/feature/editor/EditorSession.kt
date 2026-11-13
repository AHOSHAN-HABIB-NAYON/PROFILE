package com.webtecit.filepilot.feature.editor

import android.content.Context
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.operations.Checksums
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.FsError
import com.webtecit.filepilot.core.storage.FsException
import com.webtecit.filepilot.core.text.TextCodec
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

data class EditorTab(
    val id: String,
    val name: String,
    /** CodeMirror mode as a JSON value. */
    val mode: String,
    val charset: String,
    val bom: Boolean,
    val crlf: Boolean,
    val text: String,
    val dirty: Boolean = false,
    val readOnly: Boolean = false,
    val projectRoot: String? = null,
    /** A draft from a previous session that differs from the file on disk. */
    val draft: String? = null,
) {
    val isHtml: Boolean get() = FileTypes.extensionOf(name) in setOf("html", "htm")
    val isJson: Boolean get() = FileTypes.extensionOf(name) == "json"
    val isXml: Boolean get() = FileTypes.extensionOf(name) in setOf("xml", "svg")
}

/**
 * Open documents, shared by every editor screen. Text is kept here as well as in the editor page,
 * so tabs survive leaving the editor, and unsaved work is also written to drafts on disk.
 */
@Singleton
class EditorSession @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileSystems: FileSystems,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    private val _tabs = MutableStateFlow<List<EditorTab>>(emptyList())
    val tabs: StateFlow<List<EditorTab>> = _tabs.asStateFlow()
    private val _active = MutableStateFlow<String?>(null)
    val active: StateFlow<String?> = _active.asStateFlow()

    private val draftDir get() = File(context.filesDir, "drafts").apply { mkdirs() }

    suspend fun open(id: String, projectRoot: String?, charset: String? = null) {
        _tabs.value.firstOrNull { it.id == id }?.let { existing ->
            if (charset == null) { _active.value = existing.id; return }
        }
        val fs = fileSystems.of(id)
        val item: FileItem = fs.stat(id) ?: throw FsException(FsError.NOT_FOUND, "This file no longer exists.")
        if (item.size > MAX_BYTES) throw FsException(FsError.NOT_SUPPORTED, "This file is too large to edit (over 8 MB).")
        val bytes = withContext(io) { fs.openInput(id).use { it.readBytes() } }
        if (charset == null && TextCodec.looksBinary(bytes) && !FileTypes.isTextLike(item.name)) {
            throw FsException(FsError.NOT_SUPPORTED, "\"${item.name}\" is a binary file. Open it with the HEX viewer instead.")
        }
        val decoded = TextCodec.decode(bytes, charset)
        val draft = withContext(io) { draftFile(id).takeIf { it.exists() }?.readText() }?.takeIf { it != decoded.text }
        val tab = EditorTab(
            id = id, name = item.name, mode = modeOf(item.name), charset = decoded.charset, bom = decoded.bom,
            crlf = decoded.crlf, text = decoded.text, projectRoot = projectRoot, draft = draft,
        )
        _tabs.update { list -> if (list.any { it.id == id }) list.map { if (it.id == id) tab else it } else list + tab }
        _active.value = id
    }

    fun activate(id: String) { _active.value = id }

    fun update(id: String, text: String, dirty: Boolean) {
        _tabs.update { list -> list.map { if (it.id == id) it.copy(text = text, dirty = dirty) else it } }
    }

    fun setDirty(id: String, dirty: Boolean) {
        _tabs.update { list -> list.map { if (it.id == id) it.copy(dirty = dirty) else it } }
    }

    fun dismissDraft(id: String) {
        _tabs.update { list -> list.map { if (it.id == id) it.copy(draft = null) else it } }
        draftFile(id).delete()
    }

    suspend fun saveDraft(id: String, text: String) = withContext(io) {
        runCatching { draftFile(id).writeText(text) }
    }

    suspend fun save(id: String, text: String) {
        val tab = _tabs.value.firstOrNull { it.id == id } ?: return
        val bytes = TextCodec.encode(text, tab.charset, tab.bom, tab.crlf)
        withContext(io) {
            fileSystems.of(id).openOutput(id).use { it.write(bytes) }
            draftFile(id).delete()
        }
        _tabs.update { list -> list.map { if (it.id == id) it.copy(text = text, dirty = false, draft = null) else it } }
    }

    /** Saves [text] as a new file next to the tab's file and opens it. */
    suspend fun saveAs(id: String, text: String, newName: String): String {
        val tab = _tabs.value.firstOrNull { it.id == id } ?: throw FsException(FsError.NOT_FOUND, "Nothing to save.")
        val fs = fileSystems.of(id)
        val parent = fs.parentId(id) ?: throw FsException(FsError.NOT_SUPPORTED, "This location doesn't support Save as.")
        val created = fs.createFile(parent, newName)
        withContext(io) { fs.openOutput(created.id).use { it.write(TextCodec.encode(text, tab.charset, tab.bom, tab.crlf)) } }
        open(created.id, tab.projectRoot)
        return created.id
    }

    fun close(id: String) {
        val remaining = _tabs.value.filterNot { it.id == id }
        _tabs.value = remaining
        draftFile(id).delete()
        if (_active.value == id) _active.value = remaining.lastOrNull()?.id
    }

    private fun draftFile(id: String) = File(draftDir, Checksums.toHex(java.security.MessageDigest.getInstance("SHA-1").digest(id.toByteArray())) + ".txt")

    companion object {
        const val MAX_BYTES = 8_000_000L

        fun modeOf(name: String): String = when (FileTypes.extensionOf(name)) {
            "html", "htm", "vue" -> "\"htmlmixed\""
            "css" -> "\"css\""
            "js", "mjs", "cjs", "jsx" -> "\"javascript\""
            "ts", "tsx" -> "{\"name\":\"javascript\",\"typescript\":true}"
            "json", "webmanifest" -> "{\"name\":\"javascript\",\"json\":true}"
            "xml", "svg" -> "\"xml\""
            "php" -> "\"application/x-httpd-php\""
            "py" -> "\"python\""
            "java" -> "\"text/x-java\""
            "kt", "kts", "gradle" -> "\"text/x-kotlin\""
            "c", "h" -> "\"text/x-csrc\""
            "cpp", "hpp", "cc" -> "\"text/x-c++src\""
            "cs" -> "\"text/x-csharp\""
            "dart" -> "\"text/x-dart\""
            "sql" -> "\"text/x-sql\""
            "md", "markdown" -> "\"markdown\""
            "yaml", "yml" -> "\"yaml\""
            "sh", "bash" -> "\"shell\""
            "properties", "ini", "conf" -> "\"properties\""
            "toml" -> "\"toml\""
            else -> "null"
        }
    }
}

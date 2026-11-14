package com.webtecit.filepilot.feature.editor

import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.map
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.preferences.UserPreferences
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.NameRules
import com.webtecit.filepilot.core.storage.userMessage
import com.webtecit.filepilot.data.LibraryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import java.io.StringReader
import java.io.StringWriter
import javax.inject.Inject
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.stream.StreamResult
import javax.xml.transform.stream.StreamSource
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@HiltViewModel
class EditorViewModel @Inject constructor(
    val session: EditorSession,
    private val fileSystems: FileSystems,
    private val preferences: PreferencesRepository,
    private val library: LibraryRepository,
) : ViewModel() {
    val tabs = session.tabs
    val active = session.active
    val prefs: StateFlow<UserPreferences> = preferences.preferences.stateIn(viewModelScope, SharingStarted.Eagerly, UserPreferences())

    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun open(id: String, projectRoot: String?) {
        viewModelScope.launch {
            try {
                session.open(id, projectRoot)
                fileSystems.of(id).stat(id)?.let { library.addRecent(it) }
            } catch (e: Exception) {
                message(e.userMessage())
            }
        }
    }

    /** Code and text files opened recently, for the start screen. */
    val recentCode: StateFlow<List<com.webtecit.filepilot.data.LibraryEntry>> = library.recents
        .map { list -> list.filter { !it.isDirectory && com.webtecit.filepilot.core.storage.FileTypes.isTextLike(it.name) }.take(5) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Creates a new file with starter text in [dir] and opens it. */
    fun createFile(dir: String, fileName: String, text: String) {
        viewModelScope.launch {
            try {
                val file = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val folder = java.io.File(dir).apply { mkdirs() }
                    val target = uniqueFile(folder, fileName)
                    target.writeText(text)
                    target
                }
                open(file.absolutePath, null)
            } catch (e: Exception) {
                message("Couldn't create the file: ${e.userMessage()}")
            }
        }
    }

    /** Creates a project folder with [files] (name to text) and opens the first file. */
    fun createProject(dir: String, name: String, files: List<Pair<String, String>>) {
        viewModelScope.launch {
            try {
                val (root, first) = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val parent = java.io.File(dir).apply { mkdirs() }
                    val folder = uniqueFile(parent, name).apply { mkdirs() }
                    files.forEach { (n, t) -> java.io.File(folder, n).apply { parentFile?.mkdirs() }.writeText(t) }
                    folder to java.io.File(folder, files.first().first)
                }
                open(first.absolutePath, root.absolutePath)
            } catch (e: Exception) {
                message("Couldn't create the project: ${e.userMessage()}")
            }
        }
    }

    private fun uniqueFile(dir: java.io.File, name: String): java.io.File {
        var f = java.io.File(dir, name)
        var n = 1
        val base = name.substringBeforeLast('.', name)
        val ext = name.substringAfterLast('.', "")
        while (f.exists()) f = java.io.File(dir, if (ext.isEmpty() || base == name) "$name ($n)" else "$base ($n).$ext").also { n++ }
        return f
    }

    fun reopen(id: String, charset: String) {
        viewModelScope.launch {
            try {
                session.open(id, session.tabs.value.firstOrNull { it.id == id }?.projectRoot, charset)
                message("Reopened as $charset.")
            } catch (e: Exception) {
                message(e.userMessage())
            }
        }
    }

    fun snapshot(id: String, text: String, dirty: Boolean) {
        session.update(id, text, dirty)
        if (dirty) viewModelScope.launch { session.saveDraft(id, text) }
    }

    fun save(id: String, text: String, onSaved: () -> Unit) {
        viewModelScope.launch {
            try {
                session.save(id, text)
                onSaved()
                com.webtecit.filepilot.core.designsystem.Feedback.saved("Saved!", "", file = if (id.startsWith("/")) java.io.File(id) else null)
            } catch (e: Exception) {
                message("Not saved: ${e.userMessage()} Your changes are kept as a draft.")
                session.saveDraft(id, text)
            }
        }
    }

    fun saveAs(id: String, text: String, name: String) {
        viewModelScope.launch {
            try {
                session.saveAs(id, text, name)
                com.webtecit.filepilot.core.designsystem.Feedback.saved("Saved!", name)
            } catch (e: Exception) {
                message(e.userMessage())
            }
        }
    }

    fun validateName(name: String): String? = NameRules.validate(name)

    fun setFontSize(v: Int) = viewModelScope.launch { preferences.setEditorFontSize(v) }
    fun setWrap(v: Boolean) = viewModelScope.launch { preferences.setEditorWrap(v) }

    /** The folder served for HTML preview, and the page's path inside it; null for files not on local storage. */
    fun previewTarget(tab: EditorTab): Pair<String, String>? {
        if (!tab.id.startsWith("/")) return null
        val file = File(tab.id)
        val root = tab.projectRoot?.let(::File)?.takeIf { file.absolutePath.startsWith(it.absolutePath + "/") } ?: file.parentFile ?: return null
        return root.absolutePath to file.absolutePath.removePrefix(root.absolutePath).trimStart('/')
    }

    fun format(tab: EditorTab, text: String): String? = runCatching {
        when {
            tab.isJson -> text.trim().let { if (it.startsWith("[")) JSONArray(it).toString(2) else JSONObject(it).toString(2) }.replace("\\/", "/")
            tab.isXml || tab.isHtml && text.trimStart().startsWith("<?xml") -> {
                val t = TransformerFactory.newInstance().newTransformer()
                t.setOutputProperty(OutputKeys.INDENT, "yes")
                t.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2")
                val out = StringWriter()
                t.transform(StreamSource(StringReader(text)), StreamResult(out))
                out.toString()
            }
            else -> null
        }
    }.getOrElse {
        message("Couldn't format: ${it.message ?: "the content isn't valid"}.")
        null
    }

    fun message(text: String) {
        _events.trySend(UiEvent.Message(text))
    }
}

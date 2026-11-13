package com.webtecit.filepilot.feature.editor

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
                message("Saved.")
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
                message("Saved as \"$name\".")
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

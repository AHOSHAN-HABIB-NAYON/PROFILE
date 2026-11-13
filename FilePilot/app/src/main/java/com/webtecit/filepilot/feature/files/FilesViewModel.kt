package com.webtecit.filepilot.feature.files

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.permissions.AccessLevel
import com.webtecit.filepilot.core.permissions.StorageAccess
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.preferences.StartLocation
import com.webtecit.filepilot.core.storage.StorageVolumeInfo
import com.webtecit.filepilot.core.storage.StorageVolumes
import com.webtecit.filepilot.core.storage.userMessage
import com.webtecit.filepilot.data.FileOpener
import com.webtecit.filepilot.data.LibraryEntry
import com.webtecit.filepilot.data.LibraryRepository
import com.webtecit.filepilot.data.SafRoot
import com.webtecit.filepilot.data.SafRootsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FilesState(
    val volumes: List<StorageVolumeInfo> = emptyList(),
    val safRoots: List<SafRoot> = emptyList(),
    val bookmarks: List<LibraryEntry> = emptyList(),
    val access: AccessLevel = AccessLevel.LIMITED,
    val startLocation: StartLocation? = null,
)

@HiltViewModel
class FilesViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val volumes: StorageVolumes,
    private val safRoots: SafRootsRepository,
    private val library: LibraryRepository,
    private val opener: FileOpener,
    preferences: PreferencesRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(FilesState())
    val state: StateFlow<FilesState> = _state.asStateFlow()

    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch { safRoots.roots.collect { r -> _state.update { it.copy(safRoots = r) } } }
        viewModelScope.launch { library.bookmarks.collect { b -> _state.update { it.copy(bookmarks = b) } } }
        viewModelScope.launch { preferences.preferences.collect { p -> _state.update { it.copy(startLocation = p.startLocation) } } }
    }

    fun refresh() {
        viewModelScope.launch {
            val vols = runCatching { volumes.load() }.getOrDefault(emptyList())
            _state.update { it.copy(volumes = vols, access = StorageAccess.level(context)) }
        }
    }

    fun primaryRoot(): String = volumes.primaryRoot()

    fun addRoot(uri: Uri) {
        viewModelScope.launch {
            try {
                val root = safRoots.add(uri)
                _events.send(UiEvent.Message("\"${root.label}\" added."))
                _events.send(UiEvent.OpenFolder(root.rootId))
            } catch (e: Exception) {
                _events.send(UiEvent.Message(e.userMessage()))
            }
        }
    }

    fun removeRoot(root: SafRoot) {
        viewModelScope.launch {
            safRoots.remove(root.treeUri)
            _events.send(UiEvent.Message("\"${root.label}\" removed. Its files were not changed."))
        }
    }

    fun removeBookmark(entry: LibraryEntry) {
        viewModelScope.launch { library.removeBookmark(entry.id) }
    }

    fun open(id: String) {
        viewModelScope.launch { _events.send(opener.openId(id)) }
    }
}

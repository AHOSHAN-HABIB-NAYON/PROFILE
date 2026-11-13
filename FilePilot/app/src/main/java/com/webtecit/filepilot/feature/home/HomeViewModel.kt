package com.webtecit.filepilot.feature.home

import android.content.Context
import android.os.Environment
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.permissions.AccessLevel
import com.webtecit.filepilot.core.permissions.StorageAccess
import com.webtecit.filepilot.core.storage.CategoryRepository
import com.webtecit.filepilot.core.storage.CategorySummary
import com.webtecit.filepilot.core.storage.StorageVolumeInfo
import com.webtecit.filepilot.core.storage.StorageVolumes
import com.webtecit.filepilot.data.FileOpener
import com.webtecit.filepilot.data.LibraryEntry
import com.webtecit.filepilot.data.LibraryRepository
import com.webtecit.filepilot.data.SafRoot
import com.webtecit.filepilot.data.SafRootsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class QuickFolderType { DOWNLOADS, CAMERA, PICTURES, DOCUMENTS, MUSIC, MOVIES }

data class QuickFolder(val type: QuickFolderType, val label: String, val id: String)

data class HomeState(
    val volumes: List<StorageVolumeInfo> = emptyList(),
    val access: AccessLevel = AccessLevel.LIMITED,
    val quickFolders: List<QuickFolder> = emptyList(),
    val categories: List<CategorySummary> = emptyList(),
    val favorites: List<LibraryEntry> = emptyList(),
    val recents: List<LibraryEntry> = emptyList(),
    val safRoots: List<SafRoot> = emptyList(),
    val downloadsId: String = "",
    val loaded: Boolean = false,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val volumes: StorageVolumes,
    private val categories: CategoryRepository,
    library: LibraryRepository,
    safRoots: SafRootsRepository,
    private val opener: FileOpener,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch { library.favorites.collect { f -> _state.update { it.copy(favorites = f) } } }
        viewModelScope.launch { library.recents.collect { r -> _state.update { it.copy(recents = r) } } }
        viewModelScope.launch { safRoots.roots.collect { r -> _state.update { it.copy(safRoots = r) } } }
    }

    fun refresh() {
        viewModelScope.launch {
            val access = StorageAccess.level(context)
            val vols = runCatching { volumes.load() }.getOrDefault(emptyList())
            val quick = if (access == AccessLevel.FULL) withContext(io) { quickFolders() } else emptyList()
            val downloads = File(Environment.getExternalStorageDirectory(), Environment.DIRECTORY_DOWNLOADS).absolutePath
            _state.update { it.copy(volumes = vols, access = access, quickFolders = quick, downloadsId = downloads, loaded = true) }
            if (access == AccessLevel.FULL) {
                val sums = runCatching { categories.summaries() }.getOrDefault(emptyList())
                _state.update { it.copy(categories = sums) }
            }
        }
    }

    fun open(id: String) {
        viewModelScope.launch { _events.send(opener.openId(id)) }
    }

    private fun quickFolders(): List<QuickFolder> {
        val root = Environment.getExternalStorageDirectory()
        return listOf(
            QuickFolder(QuickFolderType.DOWNLOADS, "Downloads", File(root, Environment.DIRECTORY_DOWNLOADS).absolutePath),
            QuickFolder(QuickFolderType.CAMERA, "Camera", File(root, "${Environment.DIRECTORY_DCIM}/Camera").absolutePath),
            QuickFolder(QuickFolderType.PICTURES, "Pictures", File(root, Environment.DIRECTORY_PICTURES).absolutePath),
            QuickFolder(QuickFolderType.DOCUMENTS, "Documents", File(root, Environment.DIRECTORY_DOCUMENTS).absolutePath),
            QuickFolder(QuickFolderType.MUSIC, "Music", File(root, Environment.DIRECTORY_MUSIC).absolutePath),
            QuickFolder(QuickFolderType.MOVIES, "Movies", File(root, Environment.DIRECTORY_MOVIES).absolutePath),
        ).filter { File(it.id).isDirectory }
    }
}

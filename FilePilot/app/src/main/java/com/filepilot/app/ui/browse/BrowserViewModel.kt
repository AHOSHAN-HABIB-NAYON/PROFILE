package com.filepilot.app.ui.browse

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.filepilot.app.AppContainer
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.sortedWith
import com.filepilot.app.data.AppSettings
import com.filepilot.app.data.files.LocalFiles
import com.filepilot.app.data.files.userMessage
import com.filepilot.app.ui.navigation.Selection
import java.io.File
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class Crumb(val label: String, val location: Location)

data class BrowserUiState(
    val location: Location? = null,
    val crumbs: List<Crumb> = emptyList(),
    val raw: List<FileItem> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val canWrite: Boolean = false,
    val canGoBack: Boolean = false,
    val canGoForward: Boolean = false,
)

/**
 * Holds the folder being browsed plus back/forward history. Lives as long as the browser's
 * navigation entry, so opening a preview and coming back keeps the folder and scroll position.
 */
class BrowserViewModel(private val container: AppContainer, private val saved: SavedStateHandle) : ViewModel() {
    private data class Entry(val location: Location, val crumbs: List<Crumb>)

    private val backStack = ArrayDeque<Entry>()
    private val forwardStack = ArrayDeque<Entry>()
    private val scrollMemory = HashMap<String, Pair<Int, Int>>()
    private var loadJob: Job? = null

    private val _state = MutableStateFlow(BrowserUiState())
    val state: StateFlow<BrowserUiState> = _state.asStateFlow()

    val selection = Selection()

    private val _filter = MutableStateFlow("")
    val filter: StateFlow<String> = _filter.asStateFlow()

    val settings: StateFlow<AppSettings> = container.store.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings(onboardingDone = true))

    /** Sorted, filtered items ready to display. */
    val items: StateFlow<List<FileItem>> = combine(_state, settings, _filter) { s, st, f ->
        val visible = if (f.isBlank()) s.raw else s.raw.filter { it.name.contains(f.trim(), ignoreCase = true) }
        visible.sortedWith(st.sort)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        val start = Location.decode(saved.get<String>("current")) ?: Location.decode(saved.get<String>("loc"))
        if (start != null) {
            _state.value = BrowserUiState(location = start, crumbs = crumbsFor(start, null))
            load(start)
        } else {
            _state.value = BrowserUiState(loading = false, error = "This location can't be opened")
        }
        viewModelScope.launch {
            container.operations.version.drop(1).collect { reload() }
        }
        viewModelScope.launch {
            settings.map { it.showHidden }.distinctUntilChanged().drop(1).collect { reload() }
        }
        viewModelScope.launch {
            container.access.drop(1).collect { reload() }
        }
    }

    fun setFilter(text: String) {
        _filter.value = text
    }

    fun open(location: Location, label: String) {
        val current = _state.value.location ?: return
        backStack.addLast(Entry(current, _state.value.crumbs))
        forwardStack.clear()
        navigateTo(location, crumbsFor(location, _state.value.crumbs + Crumb(label, location)))
    }

    fun openCrumb(crumb: Crumb) {
        val s = _state.value
        val current = s.location ?: return
        if (crumb.location == current) return
        backStack.addLast(Entry(current, s.crumbs))
        forwardStack.clear()
        val idx = s.crumbs.indexOf(crumb)
        navigateTo(crumb.location, if (idx >= 0) s.crumbs.take(idx + 1) else crumbsFor(crumb.location, null))
    }

    /** Returns false when there is no folder history left (the screen should close). */
    fun goBack(): Boolean {
        val prev = backStack.removeLastOrNull() ?: return false
        _state.value.location?.let { forwardStack.addLast(Entry(it, _state.value.crumbs)) }
        navigateTo(prev.location, prev.crumbs)
        return true
    }

    fun goForward() {
        val next = forwardStack.removeLastOrNull() ?: return
        _state.value.location?.let { backStack.addLast(Entry(it, _state.value.crumbs)) }
        navigateTo(next.location, next.crumbs)
    }

    private fun navigateTo(location: Location, crumbs: List<Crumb>) {
        selection.clear()
        _filter.value = ""
        saved["current"] = location.encode()
        _state.value = _state.value.copy(
            location = location,
            crumbs = crumbs,
            raw = emptyList(),
            loading = true,
            error = null,
            canGoBack = backStack.isNotEmpty(),
            canGoForward = forwardStack.isNotEmpty(),
        )
        load(location)
    }

    fun refresh() {
        _state.value.location?.let { load(it, pull = true) }
    }

    private fun reload() {
        _state.value.location?.let { load(it, quiet = true) }
    }

    private fun load(location: Location, pull: Boolean = false, quiet: Boolean = false) {
        loadJob?.cancel()
        if (pull) _state.value = _state.value.copy(refreshing = true)
        else if (!quiet) _state.value = _state.value.copy(loading = true)
        loadJob = viewModelScope.launch {
            try {
                val showHidden = settings.value.showHidden
                val list = container.files.list(location, showHidden)
                val writable = runCatching { container.files.canWriteTo(location) }.getOrDefault(false)
                if (_state.value.location != location) return@launch
                selection.retain(list)
                _state.value = _state.value.copy(
                    raw = list, loading = false, refreshing = false, error = null, canWrite = writable,
                    canGoBack = backStack.isNotEmpty(), canGoForward = forwardStack.isNotEmpty(),
                )
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _state.value = _state.value.copy(
                    raw = emptyList(), loading = false, refreshing = false, error = e.userMessage(),
                    canGoBack = backStack.isNotEmpty(), canGoForward = forwardStack.isNotEmpty(),
                )
            }
        }
    }

    fun scrollFor(key: String): Pair<Int, Int> = scrollMemory[key] ?: (0 to 0)
    fun saveScroll(key: String, index: Int, offset: Int) {
        scrollMemory[key] = index to offset
    }

    fun createFolder(name: String) {
        val loc = _state.value.location ?: return
        viewModelScope.launch {
            try {
                val created = container.files.createFolder(loc, name)
                container.store.addHistory("New folder", created.name, com.filepilot.app.data.OperationStatus.SUCCESS, 1, 0)
                container.message("Folder “${created.name}” created")
                container.operations.notifyChanged()
            } catch (e: Exception) {
                container.message(e.userMessage())
            }
        }
    }

    fun paste() {
        val loc = _state.value.location ?: return
        val clip = container.clipboard.value ?: return
        if (container.operations.copy(clip.items, loc, clip.move)) {
            container.setClipboard(null)
        } else {
            container.message("Another operation is still running")
        }
    }

    /** Breadcrumbs for local paths come from the path itself; SAF folders keep the trail walked so far. */
    private fun crumbsFor(location: Location, walked: List<Crumb>?): List<Crumb> = when (location) {
        is Location.Local -> localCrumbs(location.path)
        is Location.Saf -> walked ?: listOf(Crumb(location.name.ifBlank { "Folder" }, location))
    }

    private fun localCrumbs(path: String): List<Crumb> {
        val primary = LocalFiles.primaryRoot
        val (rootPath, rootLabel) = when {
            path.startsWith(primary) -> primary to "Internal storage"
            path.startsWith("/storage/") -> {
                val parts = path.removePrefix("/storage/").split('/')
                "/storage/${parts.first()}" to "SD card"
            }
            else -> "/" to "Device"
        }
        val crumbs = mutableListOf(Crumb(rootLabel, Location.Local(rootPath)))
        val rest = path.removePrefix(rootPath).trim('/')
        if (rest.isNotEmpty()) {
            var current = File(rootPath)
            rest.split('/').forEach { seg ->
                current = File(current, seg)
                crumbs += Crumb(seg, Location.Local(current.absolutePath))
            }
        }
        return crumbs
    }
}

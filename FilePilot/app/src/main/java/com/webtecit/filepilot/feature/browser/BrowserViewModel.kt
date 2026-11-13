package com.webtecit.filepilot.feature.browser

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.webtecit.filepilot.core.common.DefaultDispatcher
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.operations.BatchRename
import com.webtecit.filepilot.core.operations.BatchRenameRule
import com.webtecit.filepilot.core.operations.ClipMode
import com.webtecit.filepilot.core.operations.ConflictPolicy
import com.webtecit.filepilot.core.operations.FileClip
import com.webtecit.filepilot.core.operations.FileClipboard
import com.webtecit.filepilot.core.operations.FileOperationManager
import com.webtecit.filepilot.core.operations.OperationKind
import com.webtecit.filepilot.core.operations.RenamePreview
import com.webtecit.filepilot.core.permissions.StorageAccess
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.preferences.UserPreferences
import com.webtecit.filepilot.core.preferences.ViewMode
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSorting
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.FsError
import com.webtecit.filepilot.core.storage.FsException
import com.webtecit.filepilot.core.storage.NameRules
import com.webtecit.filepilot.core.storage.SortOrder
import com.webtecit.filepilot.core.storage.StorageVolumes
import com.webtecit.filepilot.core.storage.userMessage
import com.webtecit.filepilot.data.FileOpener
import com.webtecit.filepilot.data.LibraryRepository
import com.webtecit.filepilot.data.SafRootsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class Crumb(val id: String, val label: String)

data class BrowserError(val message: String, val needsAccess: Boolean)

data class PendingPaste(val conflicts: List<String>, val itemCount: Int)

data class BrowserUiState(
    val currentId: String? = null,
    val crumbs: List<Crumb> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: BrowserError? = null,
    val visibleCount: Int = 0,
    val folderCount: Int = 0,
    val fileCount: Int = 0,
    val selection: Set<String> = emptySet(),
    val searchActive: Boolean = false,
    val query: String = "",
    val deepSearch: Boolean = false,
    val deepSearchRunning: Boolean = false,
    val prefs: UserPreferences = UserPreferences(),
    val favoriteIds: Set<String> = emptySet(),
    val bookmarkIds: Set<String> = emptySet(),
    val clip: FileClip? = null,
    val pendingPaste: PendingPaste? = null,
) {
    val title: String get() = crumbs.lastOrNull()?.label.orEmpty()
    val selectionMode: Boolean get() = selection.isNotEmpty()
    val bookmarked: Boolean get() = currentId != null && currentId in bookmarkIds
    val showingDeepResults: Boolean get() = searchActive && deepSearch && query.isNotBlank()

    /** A category such as Images: a collection of files, not a real folder. */
    val virtual: Boolean get() = currentId?.startsWith(com.webtecit.filepilot.core.storage.CategoryFileSystem.PREFIX) == true
}

@OptIn(FlowPreview::class)
@HiltViewModel
class BrowserViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileSystems: FileSystems,
    private val volumes: StorageVolumes,
    private val safRoots: SafRootsRepository,
    private val preferences: PreferencesRepository,
    private val library: LibraryRepository,
    private val operations: FileOperationManager,
    private val clipboard: FileClipboard,
    private val opener: FileOpener,
    private val recycleBin: com.webtecit.filepilot.core.cleaning.RecycleBin,
    private val pdfTools: com.webtecit.filepilot.feature.pdf.PdfTools,
    private val vault: com.webtecit.filepilot.feature.vault.VaultRepository,
    private val tasks: com.webtecit.filepilot.core.tasks.BackgroundTasks,
    @com.webtecit.filepilot.core.common.ApplicationScope private val appScope: kotlinx.coroutines.CoroutineScope,
    @IoDispatcher private val io: CoroutineDispatcher,
    @DefaultDispatcher private val default: CoroutineDispatcher,
) : ViewModel() {

    private val _state = MutableStateFlow(BrowserUiState())
    val state: StateFlow<BrowserUiState> = _state.asStateFlow()

    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()

    /** The sorted, filtered items currently shown. */
    private val snapshot = MutableStateFlow<List<FileItem>>(emptyList())
    private var pagingSource: ListPagingSource<FileItem>? = null

    val items: Flow<PagingData<FileItem>> = Pager(
        PagingConfig(
            pageSize = 60,
            prefetchDistance = 40,
            enablePlaceholders = true,
            initialLoadSize = 120,
            jumpThreshold = 240,
        ),
    ) { ListPagingSource(snapshot.value).also { pagingSource = it } }
        .flow
        .cachedIn(viewModelScope)

    private var rawItems: List<FileItem> = emptyList()
    private var deepResults: List<FileItem> = emptyList()
    private var started = false
    private var loadJob: Job? = null
    private var publishJob: Job? = null
    private var deepJob: Job? = null
    private var finishLoadingPending = false
    private val queryFlow = MutableStateFlow("")
    private val scrollPositions = HashMap<String, Int>()

    init {
        viewModelScope.launch { snapshot.drop(1).collect { pagingSource?.invalidate() } }
        viewModelScope.launch {
            preferences.preferences.collect { prefs ->
                val old = _state.value.prefs
                _state.update { it.copy(prefs = prefs) }
                if (old.showHidden != prefs.showHidden || old.sortOrder != prefs.sortOrder) requestPublish()
            }
        }
        viewModelScope.launch { library.favoriteIds.collect { ids -> _state.update { it.copy(favoriteIds = ids) } } }
        viewModelScope.launch {
            library.bookmarks.collect { list -> _state.update { s -> s.copy(bookmarkIds = list.mapTo(HashSet()) { it.id }) } }
        }
        viewModelScope.launch { clipboard.clip.collect { clip -> _state.update { it.copy(clip = clip) } } }
        viewModelScope.launch {
            queryFlow.drop(1).debounce(200).collectLatest {
                if (_state.value.showingDeepResults) runDeepSearch() else requestPublish()
            }
        }
        viewModelScope.launch {
            operations.finished.collect { op ->
                if (op.kind == OperationKind.DELETE) library.onDeleted(op.succeededIds)
                val current = _state.value.currentId
                if (current != null && (current in op.affectedDirs || _state.value.virtual)) refresh()
            }
        }
    }

    /** Opens [locationId] the first time the screen is shown; later calls are ignored. */
    fun start(locationId: String) {
        if (started) return
        started = true
        viewModelScope.launch {
            if (volumes.last.isEmpty()) runCatching { volumes.load() }
            val chain = runCatching { buildChain(locationId) }.getOrDefault(listOf(Crumb(locationId, locationId)))
            _state.update { it.copy(crumbs = chain) }
            load(chain.last().id, spinner = true)
        }
    }

    /** Reloads the folder quietly; the pull-to-refresh spinner shows only when the user pulled ([byUser]). */
    fun refresh(byUser: Boolean = false) {
        _state.value.currentId?.let { load(it, spinner = false, pulled = byUser) }
    }

    fun savedScroll(id: String?): Int = id?.let { scrollPositions[it] } ?: 0

    // --- navigation -----------------------------------------------------------------------

    /**
     * Folders visited on this screen, so Back returns to where the user came from: into a folder and
     * back out, and finally back to the screen that opened the browser (Home, a category, a tool).
     */
    private val history = ArrayDeque<List<Crumb>>()

    fun openFolder(item: FileItem, currentScroll: Int) {
        history.addLast(_state.value.crumbs)
        rememberScroll(currentScroll)
        val wasDeep = _state.value.showingDeepResults
        resetSearch()
        if (wasDeep) {
            viewModelScope.launch {
                val chain = runCatching { buildChain(item.id) }.getOrDefault(_state.value.crumbs + Crumb(item.id, item.name))
                _state.update { it.copy(crumbs = chain, selection = emptySet()) }
                load(item.id, spinner = true)
            }
        } else {
            _state.update { it.copy(crumbs = it.crumbs + Crumb(item.id, item.name), selection = emptySet()) }
            load(item.id, spinner = true)
        }
    }

    fun openCrumb(index: Int, currentScroll: Int) {
        val crumbs = _state.value.crumbs
        if (index !in crumbs.indices || index == crumbs.lastIndex) return
        history.addLast(crumbs)
        rememberScroll(currentScroll)
        resetSearch()
        _state.update { it.copy(crumbs = crumbs.take(index + 1), selection = emptySet()) }
        load(crumbs[index].id, spinner = true)
    }

    /** Goes back to the previously shown folder. Returns false when there is none, so the screen closes. */
    fun goUp(currentScroll: Int): Boolean {
        val previous = history.removeLastOrNull() ?: return false
        rememberScroll(currentScroll)
        resetSearch()
        _state.update { it.copy(crumbs = previous, selection = emptySet()) }
        load(previous.last().id, spinner = true)
        return true
    }

    private fun rememberScroll(index: Int) {
        _state.value.currentId?.let { scrollPositions[it] = index }
    }

    private suspend fun buildChain(id: String): List<Crumb> {
        val fs = fileSystems.of(id)
        if (fs === fileSystems.local) {
            val volume = volumes.volumeOf(id) ?: return listOf(Crumb(id, fs.nameOf(id)))
            val result = mutableListOf(Crumb(volume.rootId, volume.label))
            val relative = id.removePrefix(volume.rootId).trim('/')
            var path = volume.rootId
            if (relative.isNotEmpty()) {
                for (segment in relative.split('/')) {
                    path = "$path/$segment"
                    result += Crumb(path, segment)
                }
            }
            return result
        }
        val roots = safRoots.roots.first()
        val ids = generateSequence(id) { fs.parentId(it) }.take(64).toList().reversed()
        return ids.map { cid ->
            val root = roots.firstOrNull { it.rootId == cid }
            Crumb(cid, root?.label ?: fs.nameOf(cid).ifBlank { "Folder" })
        }
    }

    // --- loading --------------------------------------------------------------------------

    private fun load(id: String, spinner: Boolean, pulled: Boolean = false) {
        loadJob?.cancel()
        deepJob?.cancel()
        _state.update { it.copy(currentId = id, loading = spinner, refreshing = pulled, error = null) }
        loadJob = viewModelScope.launch {
            try {
                rawItems = fileSystems.of(id).list(id)
                finishLoadingPending = true
                requestPublish()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                rawItems = emptyList()
                val needsAccess = e is FsException && e.error == FsError.ACCESS_DENIED &&
                    !StorageAccess.hasFullAccess(context)
                _state.update { it.copy(error = BrowserError(e.userMessage(), needsAccess)) }
                finishLoadingPending = true
                requestPublish()
            }
        }
    }

    private fun requestPublish() {
        publishJob?.cancel()
        publishJob = viewModelScope.launch {
            val s = _state.value
            val prefs = s.prefs
            val query = if (s.searchActive) s.query.trim() else ""
            val source = if (s.showingDeepResults) deepResults else rawItems
            val visible = withContext(default) {
                val filtered = source.filter { item ->
                    (prefs.showHidden || !item.isHidden) && (query.isEmpty() || item.name.contains(query, ignoreCase = true))
                }
                FileSorting.sort(filtered, prefs.sortOrder)
            }
            val ids = visible.mapTo(HashSet()) { it.id }
            val folders = visible.count { it.isDirectory }
            snapshot.value = visible
            val finish = finishLoadingPending
            finishLoadingPending = false
            _state.update {
                it.copy(
                    visibleCount = visible.size,
                    folderCount = folders,
                    fileCount = visible.size - folders,
                    selection = it.selection.filterTo(HashSet()) { id -> id in ids },
                    loading = if (finish) false else it.loading,
                    refreshing = if (finish) false else it.refreshing,
                )
            }
        }
    }

    // --- search ---------------------------------------------------------------------------

    fun openSearch() = _state.update { it.copy(searchActive = true) }

    fun closeSearch() {
        resetSearch()
        requestPublish()
    }

    fun setQuery(query: String) {
        _state.update { it.copy(query = query) }
        queryFlow.value = query
        if (query.isBlank()) {
            deepJob?.cancel()
            deepResults = emptyList()
            _state.update { it.copy(deepSearchRunning = false) }
        }
    }

    fun setDeepSearch(enabled: Boolean) {
        _state.update { it.copy(deepSearch = enabled) }
        if (enabled) {
            runDeepSearch()
        } else {
            deepJob?.cancel()
            deepResults = emptyList()
            _state.update { it.copy(deepSearchRunning = false) }
            requestPublish()
        }
    }

    private fun resetSearch() {
        deepJob?.cancel()
        deepResults = emptyList()
        queryFlow.value = ""
        _state.update { it.copy(searchActive = false, query = "", deepSearch = false, deepSearchRunning = false) }
    }

    private fun runDeepSearch() {
        deepJob?.cancel()
        val root = _state.value.currentId ?: return
        val query = _state.value.query.trim()
        if (query.isEmpty()) {
            deepResults = emptyList()
            requestPublish()
            return
        }
        val showHidden = _state.value.prefs.showHidden
        _state.update { it.copy(deepSearchRunning = true) }
        deepJob = viewModelScope.launch {
            val found = ArrayList<FileItem>()
            withContext(io) {
                val queue = ArrayDeque<Pair<String, Int>>()
                queue.addLast(root to 0)
                var lastPublish = 0L
                while (queue.isNotEmpty() && found.size < MAX_SEARCH_RESULTS) {
                    ensureActive()
                    val (dir, depth) = queue.removeFirst()
                    val children = runCatching { fileSystems.of(dir).list(dir) }.getOrDefault(emptyList())
                    for (child in children) {
                        if (!showHidden && child.isHidden) continue
                        if (child.name.contains(query, ignoreCase = true)) found += child
                        if (child.isDirectory && depth < MAX_SEARCH_DEPTH) queue.addLast(child.id to depth + 1)
                    }
                    val now = System.currentTimeMillis()
                    if (now - lastPublish > 400) {
                        lastPublish = now
                        val partial = found.toList()
                        withContext(Dispatchers.Main) {
                            deepResults = partial
                            requestPublish()
                        }
                    }
                }
            }
            deepResults = found.toList()
            requestPublish()
            _state.update { it.copy(deepSearchRunning = false) }
        }
    }

    // --- selection ------------------------------------------------------------------------

    fun toggleSelection(item: FileItem) = _state.update {
        it.copy(selection = if (item.id in it.selection) it.selection - item.id else it.selection + item.id)
    }

    fun selectAll() = _state.update { it.copy(selection = snapshot.value.mapTo(HashSet()) { item -> item.id }) }

    fun clearSelection() = _state.update { it.copy(selection = emptySet()) }

    fun selectedItems(): List<FileItem> {
        val selection = _state.value.selection
        return snapshot.value.filter { it.id in selection }
    }

    fun visibleItems(): List<FileItem> = snapshot.value

    // --- opening --------------------------------------------------------------------------

    fun openFile(item: FileItem, chooser: Boolean) {
        viewModelScope.launch { _events.send(opener.openFile(item, chooser)) }
    }

    fun share(items: List<FileItem>) {
        viewModelScope.launch { _events.send(opener.share(items)) }
    }

    // --- clipboard ------------------------------------------------------------------------

    fun putOnClipboard(items: List<FileItem>, mode: ClipMode) {
        val dir = _state.value.currentId ?: return
        if (items.isEmpty()) return
        val total = clipboard.add(items, mode, dir)
        clearSelection()
        val what = if (items.size == 1) "\"${items[0].name}\"" else Formatters.count(items.size, "item")
        val verb = if (mode == ClipMode.COPY) "copy" else "move"
        message(
            if (total > items.size) "Added $what — ${Formatters.count(total, "item")} ready to $verb. Open a folder and tap Paste."
            else "Ready to $verb $what. Open the destination folder and tap Paste.",
        )
    }

    fun clearClipboard() = clipboard.clear()

    fun removeFromClipboard(id: String) = clipboard.remove(id)

    /** Copies or moves items straight to a chosen folder (without the clipboard). */
    fun transferTo(items: List<FileItem>, targetDirId: String, move: Boolean) {
        clearSelection()
        viewModelScope.launch {
            val conflicts = runCatching { operations.conflicts(items, targetDirId) }.getOrDefault(emptyList())
            operations.transfer(items, targetDirId, move, if (conflicts.isEmpty()) ConflictPolicy.KEEP_BOTH else ConflictPolicy.KEEP_BOTH)
            message("${if (move) "Moving" else "Copying"} ${Formatters.count(items.size, "item")}. Same names are kept as copies.")
        }
    }

    /** Creates an archive in the current folder in the background. */
    fun createArchive(
        items: List<FileItem>,
        name: String,
        format: com.webtecit.filepilot.core.archive.ArchiveFormat,
        password: String?,
        level: com.webtecit.filepilot.core.archive.CompressLevel,
        splitBytes: Long,
    ) {
        if (items.any { !it.id.startsWith("/") }) { message("Archives can be created from files on device storage."); return }
        // In categories and search results there is no real folder, so archives go to Download.
        val current = _state.value.currentId
        val dir = current?.takeIf { it.startsWith("/") }
            ?: android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS).absolutePath
        val existing = java.io.File(dir).list()?.toList().orEmpty()
        val out = java.io.File(dir, NameRules.uniqueName("$name.${format.extension}", existing))
        clearSelection()
        appScope.launch {
            val title = "Zipping ${out.name}"
            val id = tasks.start(title, "Starting…", coroutineContext[kotlinx.coroutines.Job])
            val sources = items.map { java.io.File(it.id) }
            val result = runCatching {
                withContext(io) {
                    val total = sources.sumOf { s -> if (s.isDirectory) s.walkTopDown().count { it.isFile } else 1 }.coerceAtLeast(1)
                    com.webtecit.filepilot.core.archive.ArchiveEngine.create(
                        sources, out, format, password?.takeIf { it.isNotEmpty() }?.toCharArray(), level, splitBytes,
                    ) { n, f -> tasks.update(title, "$n of $total files · $f", (n.toFloat() / total).coerceIn(0f, 1f)) }
                }
            }
            result.onSuccess {
                tasks.finish(id, "Created ${out.name} (${Formatters.size(out.length())})")
                com.webtecit.filepilot.core.designsystem.Feedback.saved("Archive created", "${out.name} · ${Formatters.size(out.length())}")
            }.onFailure {
                out.delete()
                tasks.dismiss(id)
                if (it !is kotlinx.coroutines.CancellationException) message("Couldn't create the archive: ${it.userMessage()}")
            }
            refresh()
        }
    }

    fun paste() {
        val clip = clipboard.clip.value ?: return
        val target = _state.value.currentId ?: return
        if (clip.mode == ClipMode.CUT && clip.items.all { fileSystems.of(it.id).parentId(it.id) == target }) {
            message("These items are already in this folder.")
            return
        }
        viewModelScope.launch {
            val conflicts = try {
                operations.conflicts(clip.items, target)
            } catch (e: Exception) {
                message(e.userMessage())
                return@launch
            }
            if (conflicts.isEmpty()) startPaste(clip, target, ConflictPolicy.KEEP_BOTH)
            else _state.update { it.copy(pendingPaste = PendingPaste(conflicts, clip.items.size)) }
        }
    }

    /** Answers the conflict dialog; null cancels the paste. */
    fun resolvePaste(policy: ConflictPolicy?) {
        _state.update { it.copy(pendingPaste = null) }
        val clip = clipboard.clip.value ?: return
        val target = _state.value.currentId ?: return
        if (policy != null) startPaste(clip, target, policy)
    }

    private fun startPaste(clip: FileClip, target: String, policy: ConflictPolicy) {
        operations.transfer(clip.items, target, move = clip.mode == ClipMode.CUT, policy = policy)
        if (clip.mode == ClipMode.CUT) clipboard.clear()
    }

    // --- create, rename, delete -----------------------------------------------------------

    /** Error message for a new name in this folder, or null. [currentName] is the item being renamed. */
    fun validateName(name: String, currentName: String? = null): String? {
        NameRules.validate(name)?.let { return it }
        val clash = rawItems.any { it.name.equals(name, ignoreCase = true) && it.name != currentName }
        return if (clash) "An item named \"$name\" already exists here." else null
    }

    fun createFolder(name: String) = create(name, folder = true)

    fun createFile(name: String) = create(name, folder = false)

    private fun create(name: String, folder: Boolean) {
        val dir = _state.value.currentId ?: return
        viewModelScope.launch {
            try {
                val fs = fileSystems.of(dir)
                if (folder) fs.createDirectory(dir, name) else fs.createFile(dir, name)
                message(if (folder) "Folder \"$name\" created." else "File \"$name\" created.")
                refresh()
            } catch (e: Exception) {
                message(e.userMessage())
            }
        }
    }

    fun rename(item: FileItem, newName: String) {
        viewModelScope.launch {
            try {
                val renamed = fileSystems.of(item.id).rename(item.id, newName)
                library.onRenamed(item.id, renamed)
                clearSelection()
                message("Renamed to \"${renamed.name}\".")
                refresh()
            } catch (e: Exception) {
                message(e.userMessage())
            }
        }
    }

    /** True when these items would go to the Recycle Bin rather than being deleted permanently. */
    fun usesRecycleBin(items: List<FileItem>): Boolean =
        _state.value.prefs.recycleBin && items.isNotEmpty() && items.all(recycleBin::supports)

    fun delete(items: List<FileItem>, permanently: Boolean = false) {
        if (items.isEmpty()) return
        clearSelection()
        if (!permanently && usesRecycleBin(items)) {
            viewModelScope.launch {
                try {
                    val entries = recycleBin.trashEntries(items)
                    library.onDeleted(items.map { it.id })
                    com.webtecit.filepilot.core.designsystem.Feedback.deleted(
                        "Moved to Recycle Bin",
                        if (items.size == 1) items[0].name else Formatters.count(items.size, "item"),
                        undo = {
                            recycleBin.undo(entries)
                            refresh()
                        },
                    )
                } catch (e: Exception) {
                    message(e.userMessage())
                }
                refresh()
            }
        } else {
            operations.delete(items)
        }
    }

    fun batchRenamePreview(items: List<FileItem>, rule: BatchRenameRule): List<RenamePreview> {
        val ids = items.mapTo(HashSet()) { it.id }
        return BatchRename.preview(
            items.map { it.name to it.isDirectory },
            rule,
            rawItems.filter { it.id !in ids }.map { it.name },
        )
    }

    fun batchRename(items: List<FileItem>, rule: BatchRenameRule) {
        val previews = batchRenamePreview(items, rule)
        if (previews.any { it.error != null }) {
            message("Fix the highlighted names first.")
            return
        }
        val changes = items.zip(previews).filter { it.second.changed }
        if (changes.isEmpty()) {
            message("Nothing to rename: the new names are the same.")
            return
        }
        viewModelScope.launch {
            var renamed = 0
            val failures = ArrayList<String>()
            val sourceNames = changes.mapTo(HashSet()) { it.first.name.lowercase() }
            val twoPhase = changes.any { it.second.newName.lowercase() in sourceNames }
            if (twoPhase) {
                // Avoid collisions such as a→b while b→c by going through temporary names.
                val staged = ArrayList<Triple<FileItem, FileItem, String>>()
                changes.forEachIndexed { i, (item, preview) ->
                    try {
                        val temp = fileSystems.of(item.id).rename(item.id, ".fmp-rename-$i-${System.nanoTime()}")
                        staged += Triple(item, temp, preview.newName)
                    } catch (e: Exception) {
                        failures += "${item.name}: ${e.userMessage()}"
                    }
                }
                for ((original, temp, newName) in staged) {
                    try {
                        val result = fileSystems.of(temp.id).rename(temp.id, newName)
                        library.onRenamed(original.id, result)
                        renamed++
                    } catch (e: Exception) {
                        runCatching { fileSystems.of(temp.id).rename(temp.id, original.name) }
                        failures += "${original.name}: ${e.userMessage()}"
                    }
                }
            } else {
                for ((item, preview) in changes) {
                    try {
                        val result = fileSystems.of(item.id).rename(item.id, preview.newName)
                        library.onRenamed(item.id, result)
                        renamed++
                    } catch (e: Exception) {
                        failures += "${item.name}: ${e.userMessage()}"
                    }
                }
            }
            clearSelection()
            refresh()
            message(
                if (failures.isEmpty()) "Renamed ${Formatters.count(renamed, "item")}."
                else "Renamed $renamed, ${failures.size} failed. ${failures.first()}",
            )
        }
    }

    // --- tools on files -------------------------------------------------------------------

    private val busyJobs = MutableStateFlow(0)

    /** Creates [name] (made unique) in the current folder and writes it with [write]. */
    private suspend fun writeNew(name: String, write: suspend (java.io.OutputStream) -> Unit): FileItem {
        val dir = _state.value.currentId ?: throw FsException(FsError.NOT_FOUND, "No folder is open.")
        val fs = fileSystems.of(dir)
        val unique = NameRules.uniqueName(name, rawItems.map { it.name })
        val created = fs.createFile(dir, unique)
        try {
            withContext(io) { fs.openOutput(created.id).use { write(it) } }
        } catch (e: Throwable) {
            runCatching { fs.delete(created.id) }
            throw e
        }
        return fileSystems.of(created.id).stat(created.id) ?: created
    }

    private fun runTool(start: String, block: suspend () -> String) {
        clearSelection()
        message(start)
        viewModelScope.launch {
            busyJobs.value++
            val result = try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { e.userMessage() }
            busyJobs.value--
            refresh()
            message(result)
        }
    }

    fun compressToZip(items: List<FileItem>) {
        if (items.any { !it.id.startsWith("/") }) { message("ZIP creation works with files on device storage."); return }
        val name = (if (items.size == 1) items[0].name.substringBeforeLast('.').ifBlank { items[0].name } else "Archive") + ".zip"
        runTool("Creating $name…") {
            val out = writeNew(name) { com.webtecit.filepilot.core.archive.ZipTools.zip(items.map { java.io.File(it.id) }, it) }
            "Created \"${out.name}\" (${Formatters.size(out.size)})."
        }
    }

    fun imagesToPdf(items: List<FileItem>) = runTool("Creating PDF from ${Formatters.count(items.size, "image")}…") {
        val out = writeNew("Images ${java.text.SimpleDateFormat("yyyy-MM-dd HHmm", java.util.Locale.US).format(java.util.Date())}.pdf") { pdfTools.imagesToPdf(items, it) }
        "Created \"${out.name}\"."
    }

    fun mergePdfs(items: List<FileItem>) = runTool("Merging ${Formatters.count(items.size, "PDF")}…") {
        val out = writeNew("Merged.pdf") { pdfTools.merge(items, it) }
        "Created \"${out.name}\". Pages are stored as images, so text can't be selected in the merged file."
    }

    fun compressPdf(item: FileItem) = runTool("Compressing \"${item.name}\"…") {
        val out = writeNew(item.name.removeSuffix(".pdf").removeSuffix(".PDF") + " (compressed).pdf") { pdfTools.merge(listOf(item), it, dpi = 110, jpegQuality = 70) }
        if (out.size >= item.size) {
            fileSystems.of(out.id).delete(out.id)
            "This PDF is already compact; compressing wouldn't make it smaller."
        } else "Saved \"${out.name}\": ${Formatters.size(item.size)} → ${Formatters.size(out.size)}."
    }

    fun moveToVault(items: List<FileItem>) = runTool("Encrypting ${Formatters.count(items.size, "file")}…") {
        val n = vault.importItems(items)
        library.onDeleted(items.map { it.id })
        "Moved $n to the Secure Folder. The originals were deleted after encryption."
    }

    fun split(item: FileItem, partMb: Int) {
        if (!item.id.startsWith("/")) { message("Splitting works with files on device storage."); return }
        runTool("Splitting \"${item.name}\"…") {
            val parts = withContext(io) {
                com.webtecit.filepilot.feature.devtools.FileToolsLogic.split(java.io.File(item.id), java.io.File(item.id).parentFile!!, partMb * 1_000_000L)
            }
            "Split into ${parts.size} parts (${parts.firstOrNull()?.name} …)."
        }
    }

    fun mergeParts(item: FileItem) {
        val parts = com.webtecit.filepilot.feature.devtools.FileToolsLogic.partsOf(java.io.File(item.id))
        if (parts.size < 2) { message("No other parts (.001, .002 …) were found next to this file."); return }
        val target = java.io.File(parts[0].parentFile, NameRules.uniqueName(parts[0].name.substringBeforeLast('.'), rawItems.map { it.name }))
        runTool("Joining ${parts.size} parts…") {
            withContext(io) { com.webtecit.filepilot.feature.devtools.FileToolsLogic.merge(parts, target) }
            "Created \"${target.name}\" (${Formatters.size(target.length())})."
        }
    }

    // --- library --------------------------------------------------------------------------

    fun toggleFavorite(items: List<FileItem>) {
        if (items.isEmpty()) return
        viewModelScope.launch {
            val allFavorite = items.all { it.id in _state.value.favoriteIds }
            library.setFavorite(items, !allFavorite)
            message(if (allFavorite) "Removed from favorites." else "Added to favorites.")
        }
    }

    fun toggleBookmark() {
        val s = _state.value
        val id = s.currentId ?: return
        viewModelScope.launch {
            if (s.bookmarked) {
                library.removeBookmark(id)
                message("Bookmark removed.")
            } else {
                library.addBookmark(id, s.title)
                message("Folder bookmarked. Find it in Library and Files.")
            }
        }
    }

    // --- preferences ----------------------------------------------------------------------

    fun setViewMode(mode: ViewMode) {
        viewModelScope.launch { preferences.setViewMode(mode) }
    }

    fun setSortOrder(order: SortOrder) {
        viewModelScope.launch { preferences.setSortOrder(order) }
    }

    fun setShowHidden(show: Boolean) {
        viewModelScope.launch { preferences.setShowHidden(show) }
    }

    fun displayPath(id: String): String = runCatching { fileSystems.of(id).displayPath(id) }.getOrDefault(id)

    fun parentPathOf(item: FileItem): String {
        val fs = runCatching { fileSystems.of(item.id) }.getOrNull() ?: return ""
        val parent = fs.parentId(item.id) ?: return ""
        val path = fs.displayPath(parent)
        val volume = volumes.volumeOf(parent)
        return if (volume != null) volume.label + path.removePrefix(volume.rootId) else path
    }

    private fun message(text: String) {
        _events.trySend(UiEvent.Message(text))
    }

    private companion object {
        const val MAX_SEARCH_RESULTS = 5000
        const val MAX_SEARCH_DEPTH = 24
    }
}

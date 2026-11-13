package com.webtecit.filepilot.feature.cleaner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.cleaning.RecycleBin
import com.webtecit.filepilot.core.cleaning.Scanners
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.operations.FileOperationManager
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.StorageVolumes
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class CleanGroup(val label: String, val description: String) {
    TEMP("Temporary files", "Leftover temporary, backup and partial download files"),
    EMPTY("Empty folders", "Folders with nothing inside"),
    DUPLICATES("Duplicate files", "Identical content (SHA-256 verified); the newest copy is kept"),
    APKS("Old APKs", "Installer files; already-installed apps don't need them"),
    LARGE("Large files", "Files over 100 MB — review before removing"),
    WHATSAPP("WhatsApp media", "Media folders WhatsApp shares on your storage"),
    FACEBOOK("Facebook media", "Photos and videos saved by Facebook apps"),
}

data class CleanItem(val path: String, val name: String, val size: Long, val isDirectory: Boolean, val group: CleanGroup, val note: String = "")

data class CleanerState(
    val scanning: Boolean = false,
    val progress: String = "",
    val scanned: Boolean = false,
    val items: List<CleanItem> = emptyList(),
    val selected: Set<String> = emptySet(),
    val cleaning: Boolean = false,
) {
    val selectedBytes: Long get() = items.filter { it.path in selected }.sumOf { it.size }
}

/** Runs cleaner scans at app level, so they continue when the user leaves the screen. */
@javax.inject.Singleton
class CleanerEngine @Inject constructor(
    @com.webtecit.filepilot.core.common.ApplicationScope private val scope: kotlinx.coroutines.CoroutineScope,
    private val tasks: com.webtecit.filepilot.core.tasks.BackgroundTasks,
    private val volumes: StorageVolumes,
    private val recycleBin: RecycleBin,
    private val operations: FileOperationManager,
    private val preferences: PreferencesRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    private val _state = MutableStateFlow(CleanerState())
    val state = _state.asStateFlow()
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()
    private var job: Job? = null

    fun scan() {
        job?.cancel()
        _state.value = CleanerState(scanning = true, progress = "Looking through your files…")
        job = scope.launch {
            val task = tasks.start("Cleaner scan", "Looking for junk and duplicates", coroutineContext[kotlinx.coroutines.Job])
            val root = File(volumes.primaryRoot())
            val items = ArrayList<CleanItem>()
            val preselect = HashSet<String>()
            withContext(io) {
                val files = ArrayList<File>()
                val dirs = ArrayList<File>()
                var count = 0
                Scanners.walk(root, onDir = { dirs += it }) { f ->
                    files += f
                    if (++count % 500 == 0) {
                        _state.update { it.copy(progress = "Scanned ${"%,d".format(count)} files…") }
                        tasks.update("Cleaner scan", "Scanned ${"%,d".format(count)} files", null)
                    }
                }
                val monthAgo = System.currentTimeMillis() - 30L * 24 * 3600 * 1000
                files.filter(Scanners::isTemporary).forEach { items += item(it, CleanGroup.TEMP); preselect += it.absolutePath }
                Scanners.emptyFolders(dirs.filter { it != root && !it.name.startsWith(".") && it.absolutePath.count { c -> c == '/' } > root.absolutePath.count { c -> c == '/' } + 0 })
                    .take(300).forEach { items += item(it, CleanGroup.EMPTY); preselect += it.absolutePath }
                files.filter { FileTypes.extensionOf(it.name) in setOf("apk", "xapk", "apks") }.forEach {
                    items += item(it, CleanGroup.APKS, if (it.lastModified() < monthAgo) "Older than 30 days" else "Recent")
                    if (it.lastModified() < monthAgo) preselect += it.absolutePath
                }
                files.filter { it.length() > 100_000_000 }.sortedByDescending { it.length() }.forEach { items += item(it, CleanGroup.LARGE) }
                mediaFolders(root, listOf("Android/media/com.whatsapp/WhatsApp/Media", "WhatsApp/Media", "Android/media/com.whatsapp.w4b/WhatsApp Business/Media"))
                    .forEach { items += it.copy(group = CleanGroup.WHATSAPP) }
                mediaFolders(root, listOf("Pictures/Facebook", "DCIM/Facebook", "Movies/Facebook", "Pictures/Messenger", "Android/media/com.facebook.katana", "Android/media/com.facebook.orca"))
                    .forEach { items += it.copy(group = CleanGroup.FACEBOOK) }
                _state.update { it.copy(progress = "Comparing files for duplicates…") }
                val candidates = files.filter { !it.absolutePath.contains("/.") }
                val groups = Scanners.duplicates(candidates, minSize = 4096) { done, total ->
                    if (done % 25 == 0) {
                        _state.update { it.copy(progress = "Checking duplicates: $done of $total") }
                        tasks.update("Cleaner scan", "Checking duplicates: $done of $total", if (total > 0) done.toFloat() / total else null)
                    }
                }
                groups.forEachIndexed { gi, g ->
                    g.forEachIndexed { i, f ->
                        val keep = i == 0
                        items += item(f, CleanGroup.DUPLICATES, if (keep) "Copy ${gi + 1} · kept (newest)" else "Copy ${gi + 1} · duplicate")
                        if (!keep) preselect += f.absolutePath
                    }
                }
            }
            _state.value = CleanerState(scanned = true, items = items, selected = preselect)
            tasks.finish(task, "Found ${Formatters.count(items.size, "item")} to review")
        }
        job?.invokeOnCompletion { e ->
            if (e != null) {
                tasks.clearAll("Cleaner scan")
                _state.update { it.copy(scanning = false, scanned = it.items.isNotEmpty()) }
            }
        }
    }

    /** Stops a running scan; what was found so far is dropped. */
    fun stopScan() {
        job?.cancel()
    }

    private fun item(f: File, group: CleanGroup, note: String = "") =
        CleanItem(f.absolutePath, f.name, if (f.isDirectory) 0 else f.length(), f.isDirectory, group, note)

    private fun mediaFolders(root: File, paths: List<String>): List<CleanItem> = paths.map { File(root, it) }.filter { it.isDirectory }
        .flatMap { base -> base.listFiles().orEmpty().filter { it.isDirectory } }
        .map { d ->
            val files = d.walkTopDown().filter { it.isFile && it.name != ".nomedia" }.toList()
            CleanItem(d.absolutePath, d.name, files.sumOf { it.length() }, true, CleanGroup.WHATSAPP, Formatters.count(files.size, "file"))
        }.filter { it.size > 0 }

    fun toggle(path: String) = _state.update { s -> s.copy(selected = if (path in s.selected) s.selected - path else s.selected + path) }

    fun toggleGroup(group: CleanGroup, select: Boolean) = _state.update { s ->
        val paths = s.items.filter { it.group == group }.map { it.path }.toSet()
        s.copy(selected = if (select) s.selected + paths else s.selected - paths)
    }

    fun clean(permanently: Boolean = false) {
        val s = _state.value
        val chosen = s.items.filter { it.path in s.selected }.distinctBy { it.path }
        if (chosen.isEmpty()) return
        _state.update { it.copy(cleaning = true) }
        scope.launch {
            val useBin = preferences.current().recycleBin && !permanently
            val asItems = chosen.map { FileItem(it.path, it.name, it.isDirectory, it.size, File(it.path).lastModified(), FileTypes.mimeOf(it.name)) }
            val (empty, rest) = asItems.partition { it.isDirectory && chosen.first { c -> c.path == it.id }.group == CleanGroup.EMPTY }
            try {
                withContext(io) { empty.forEach { File(it.id).deleteRecursively() } }
                val freed = "Freed ${Formatters.size(chosen.sumOf { it.size })}"
                if (useBin) {
                    val entries = recycleBin.trashEntries(rest)
                    com.webtecit.filepilot.core.designsystem.Feedback.deleted("Cleaned", "$freed · kept in the Recycle Bin", undo = { recycleBin.undo(entries) })
                } else if (rest.isNotEmpty()) {
                    // The delete engine shows its own "Deleted" confirmation when it finishes.
                    operations.delete(rest)
                } else {
                    com.webtecit.filepilot.core.designsystem.Feedback.deleted("Cleaned", freed)
                }
            } catch (e: Exception) {
                _events.send(UiEvent.Message(e.userMessage()))
            }
            val removed = chosen.map { it.path }.toSet()
            _state.update { it.copy(cleaning = false, items = it.items.filterNot { i -> i.path in removed }, selected = emptySet()) }
        }
    }
}

@HiltViewModel
class CleanerViewModel @Inject constructor(private val engine: CleanerEngine) : ViewModel() {
    val state = engine.state
    val events = engine.events
    fun scan() = engine.scan()
    fun stopScan() = engine.stopScan()
    fun toggle(path: String) = engine.toggle(path)
    fun toggleGroup(group: CleanGroup, select: Boolean) = engine.toggleGroup(group, select)
    fun clean(permanently: Boolean) = engine.clean(permanently)
}

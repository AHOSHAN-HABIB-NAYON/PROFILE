package com.filepilot.app.ui.archive

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.filepilot.app.AppContainer
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.FileType
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.NaturalOrder
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.archive.ZipArchives
import com.filepilot.app.data.archive.ZipEntryInfo
import com.filepilot.app.data.files.userMessage
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.ErrorState
import com.filepilot.app.ui.components.LoadingState
import com.filepilot.app.ui.components.TypeTile
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.appViewModel
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ArchiveUi(
    val loading: Boolean = true,
    val error: String? = null,
    val entries: List<ZipEntryInfo> = emptyList(),
    /** Entries grouped by parent folder and pre-sorted, so opening a folder is instant. */
    val byParent: Map<String, List<ZipEntryInfo>> = emptyMap(),
    val fileCount: Int = 0,
    val dir: String = "",
    val selected: Set<String> = emptySet(),
)

class ArchiveViewModel(private val container: AppContainer, saved: SavedStateHandle) : ViewModel() {
    val archive: FileItem? = saved.get<String>("item")?.let { FileItem.fromJsonString(it) }
    private val _ui = MutableStateFlow(ArchiveUi())
    val ui: StateFlow<ArchiveUi> = _ui.asStateFlow()

    init {
        load()
    }

    fun load() {
        val a = archive ?: run {
            _ui.value = ArchiveUi(loading = false, error = "This archive can't be opened")
            return
        }
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                ZipArchives.ensureZip(a)
                val entries = ZipArchives.list(container.files, a)
                val order = compareByDescending<ZipEntryInfo> { it.isDirectory }.thenComparator { x, y -> NaturalOrder.compare(x.name, y.name) }
                val grouped = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
                    entries.groupBy { it.parent }.mapValues { (_, v) -> v.sortedWith(order) }
                }
                _ui.value = ArchiveUi(loading = false, entries = entries, byParent = grouped, fileCount = entries.count { !it.isDirectory })
            } catch (e: Exception) {
                _ui.value = ArchiveUi(loading = false, error = e.userMessage())
            }
        }
    }

    fun children(ui: ArchiveUi): List<ZipEntryInfo> = ui.byParent[ui.dir].orEmpty()

    fun enter(dir: String) {
        _ui.value = _ui.value.copy(dir = dir, selected = emptySet())
    }

    fun up(): Boolean {
        val d = _ui.value.dir
        if (d.isEmpty()) return false
        enter(d.substringBeforeLast('/', ""))
        return true
    }

    fun toggle(path: String) {
        val s = _ui.value.selected
        _ui.value = _ui.value.copy(selected = if (path in s) s - path else s + path)
    }

    fun clearSelection() {
        _ui.value = _ui.value.copy(selected = emptySet())
    }

    /** Folder next to the archive, when it is a local file in a writable folder. */
    fun besideArchive(): Location? {
        val a = archive ?: return null
        if (a.source != SourceKind.LOCAL) return null
        val parent = a.path?.let { File(it).parentFile } ?: return null
        return if (parent.canWrite()) Location.Local(parent.absolutePath) else null
    }

    fun extract(destination: Location) {
        val a = archive ?: return
        val ui = _ui.value
        val selection = ui.selected.ifEmpty { null } ?: if (ui.dir.isNotEmpty()) setOf(ui.dir) else null
        val base = if (ui.dir.isNotEmpty()) ui.dir else ""
        if (container.operations.extract(a, destination, selection, basePath = base)) {
            container.message("Extracting ${a.name}…")
            clearSelection()
        } else {
            container.message("Another operation is still running")
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ArchiveScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    val vm = appViewModel { c, s -> ArchiveViewModel(c, s) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var choosing by remember { mutableStateOf(false) }
    val archive = vm.archive

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            scope.launch {
                val folder = container.addPickedFolder(uri)
                if (folder != null) vm.extract(container.files.saf.rootLocation(folder.treeUri, folder.name))
            }
        }
    }

    BackHandler(enabled = ui.selected.isNotEmpty() || ui.dir.isNotEmpty()) {
        if (ui.selected.isNotEmpty()) vm.clearSelection() else vm.up()
    }

    Scaffold(
        topBar = {
            BackTopBar(
                title = archive?.name ?: "Archive",
                subtitle = if (ui.dir.isNotEmpty()) "/${ui.dir}" else archive?.let { "${Format.size(it.size)} · ${ui.fileCount} files" },
                onBack = { if (!vm.up()) navigator.back() },
            )
        },
        bottomBar = {
            if (!ui.loading && ui.error == null && ui.entries.isNotEmpty()) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Row(
                        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            when {
                                ui.selected.isNotEmpty() -> "${ui.selected.size} selected"
                                ui.dir.isNotEmpty() -> "This folder"
                                else -> "Whole archive"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Button(onClick = { choosing = true }) {
                            Icon(Icons.Rounded.Unarchive, null)
                            Spacer(Modifier.width(8.dp))
                            Text("Extract")
                        }
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when {
                ui.loading -> LoadingState(label = "Reading archive…")
                ui.error != null -> ErrorState(
                    ui.error!!, onRetry = vm::load,
                    extraLabel = archive?.let { "Open in another app" },
                    onExtra = archive?.let { a -> { navigator.openExternal(a, chooser = true) } },
                )
                ui.entries.isEmpty() -> EmptyState(Icons.Rounded.FolderZip, "Empty archive", "This archive doesn't contain any files.")
                else -> {
                    Text(
                        "Tap folders to look inside. Long-press to select items to extract.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                    )
                    val children = vm.children(ui)
                    LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                        items(children, key = { it.path }) { e ->
                            val selected = e.path in ui.selected
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .background(if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f) else androidx.compose.ui.graphics.Color.Transparent)
                                    .combinedClickable(
                                        onClick = {
                                            when {
                                                ui.selected.isNotEmpty() -> vm.toggle(e.path)
                                                e.isDirectory -> vm.enter(e.path)
                                                else -> vm.toggle(e.path)
                                            }
                                        },
                                        onLongClick = { vm.toggle(e.path) },
                                    )
                                    .padding(horizontal = 16.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                TypeTile(if (e.isDirectory) FileType.FOLDER else FileType.fromExtension(e.name.substringAfterLast('.', "")))
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Text(e.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                                    Text(
                                        if (e.isDirectory) "Folder" else "${Format.size(e.size)} · compressed ${Format.size(e.compressedSize)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (ui.selected.isNotEmpty() || !e.isDirectory) {
                                    Checkbox(checked = selected, onCheckedChange = { vm.toggle(e.path) })
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (choosing) {
        val beside = vm.besideArchive()
        AlertDialog(
            onDismissRequest = { choosing = false },
            icon = { Icon(Icons.Rounded.Unarchive, null) },
            title = { Text("Extract to") },
            text = {
                Text(
                    if (beside != null) {
                        "Files are placed in a new folder named “${archive?.name?.substringBeforeLast('.')}”. Existing files are never overwritten. Entries with unsafe paths are skipped."
                    } else {
                        "Choose a folder with Android's folder picker. Existing files are never overwritten. Entries with unsafe paths are skipped."
                    },
                )
            },
            confirmButton = {
                if (beside != null) {
                    TextButton(onClick = {
                        choosing = false
                        vm.extract(beside)
                    }) { Text("Same folder") }
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    choosing = false
                    picker.launch(null)
                }) { Text("Choose folder…") }
            },
        )
    }
}

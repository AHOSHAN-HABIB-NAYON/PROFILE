package com.filepilot.app.ui.cleanup

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.FolderOff
import androidx.compose.material.icons.rounded.SdStorage
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.filepilot.app.AppContainer
import com.filepilot.app.core.model.FileCategory
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.files.userMessage
import com.filepilot.app.data.tools.DuplicateGroup
import com.filepilot.app.data.tools.ScanProgress
import com.filepilot.app.permissions.rememberAccessRequester
import com.filepilot.app.ui.components.AccessNotice
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.DeleteDialog
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.FileThumb
import com.filepilot.app.ui.components.SectionHeader
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes
import com.filepilot.app.ui.navigation.appViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

private data class Suggestion(val count: Int, val bytes: Long)

/** Overview of cleanup opportunities. Read-only: nothing is removed without a confirmed delete. */
@Composable
fun CleanupScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val access by container.access.collectAsStateWithLifecycle()
    val version by container.operations.version.collectAsStateWithLifecycle()
    var large by remember { mutableStateOf<Suggestion?>(null) }
    var apks by remember { mutableStateOf<Suggestion?>(null) }
    var downloads by remember { mutableStateOf<Suggestion?>(null) }
    val requester = rememberAccessRequester()

    LaunchedEffect(access, version) {
        fun summarize(items: List<FileItem>) = Suggestion(items.size, items.sumOf { it.size.coerceAtLeast(0) })
        large = summarize(container.files.media.category(FileCategory.LARGE, access, 100L shl 20).items)
        apks = summarize(container.files.media.category(FileCategory.APKS, access, 0).items)
        val cutoff = System.currentTimeMillis() - 90L * 24 * 3600 * 1000
        downloads = summarize(container.files.media.category(FileCategory.DOWNLOADS, access, 0).items.filter { it.lastModified in 1 until cutoff })
    }

    Scaffold(topBar = { BackTopBar("Storage cleanup", navigator::back) }) { padding ->
        LazyColumn(contentPadding = PaddingValues(top = padding.calculateTopPadding(), bottom = 24.dp)) {
            item {
                Text(
                    "Suggestions to free up space. FilePilot never deletes anything automatically — you review and confirm every removal.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
            }
            if (!access.fullAccess) {
                item {
                    AccessNotice(
                        "Get complete suggestions",
                        "Without full file access, suggestions only cover photos, videos and audio.",
                        "Allow full access",
                        requester::requestFullAccess,
                    )
                }
            }
            item {
                SuggestionCard(Icons.Rounded.SdStorage, Color(0xFFEC4899), "Large files", large?.let { "${Format.items(it.count)} over 100 MB · ${Format.size(it.bytes)}" }) {
                    navigator.go(Routes.category(FileCategory.LARGE))
                }
                SuggestionCard(Icons.Rounded.ContentCopy, Color(0xFF6366F1), "Duplicate files", "Find identical copies by size and content") {
                    navigator.go(Routes.DUPLICATES)
                }
                SuggestionCard(Icons.Rounded.FolderOff, Color(0xFF64748B), "Empty folders", if (access.fullAccess) "Find folders with nothing inside" else "Needs full file access") {
                    navigator.go(Routes.EMPTY_FOLDERS)
                }
                SuggestionCard(Icons.Rounded.Android, Color(0xFF65A30D), "APK installers", apks?.let { "${Format.items(it.count)} · ${Format.size(it.bytes)} — usually safe to remove after installing" }) {
                    navigator.go(Routes.category(FileCategory.APKS))
                }
                SuggestionCard(Icons.Rounded.Download, Color(0xFF0EA5E9), "Old downloads", downloads?.let { "${Format.items(it.count)} older than 90 days · ${Format.size(it.bytes)}" }) {
                    navigator.go(Routes.category(FileCategory.DOWNLOADS))
                }
            }
        }
    }
}

@Composable
private fun SuggestionCard(icon: ImageVector, color: Color, title: String, detail: String?, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = onClick,
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = color)
            }
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(detail ?: "Checking…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------------------------------------------------------------- Duplicates

data class ScanUi<T>(
    val running: Boolean = false,
    val progress: ScanProgress? = null,
    val result: List<T>? = null,
    val error: String? = null,
)

class DuplicatesViewModel(private val container: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow(ScanUi<DuplicateGroup>())
    val ui: StateFlow<ScanUi<DuplicateGroup>> = _ui.asStateFlow()
    val verify = MutableStateFlow(true)
    val selected = MutableStateFlow<Set<String>>(emptySet())
    private var job: Job? = null

    init {
        viewModelScope.launch {
            container.operations.version.drop(1).collect {
                if (_ui.value.result != null) scan()
            }
        }
    }

    fun scan() {
        job?.cancel()
        selected.value = emptySet()
        _ui.value = ScanUi(running = true)
        job = viewModelScope.launch {
            try {
                val groups = container.cleanup.findDuplicates(container.access.value, verify.value) { p ->
                    _ui.value = _ui.value.copy(progress = p)
                }
                _ui.value = ScanUi(result = groups)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.value = ScanUi(error = e.userMessage())
            }
        }
    }

    fun cancel() {
        job?.cancel()
        _ui.value = ScanUi()
    }

    fun toggle(id: String) {
        val s = selected.value
        selected.value = if (id in s) s - id else s + id
    }

    /** Selects every copy except the most recently modified one in each group. */
    fun selectAllButNewest() {
        val groups = _ui.value.result ?: return
        selected.value = groups.flatMap { g ->
            val keep = g.items.maxByOrNull { it.lastModified }
            g.items.filter { it != keep && it.canDelete }.map { it.id }
        }.toSet()
    }
}

@Composable
fun DuplicatesScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val vm = appViewModel { c, _ -> DuplicatesViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val verify by vm.verify.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val access by container.access.collectAsStateWithLifecycle()
    var deleting by remember { mutableStateOf<List<FileItem>?>(null) }
    val groups = ui.result.orEmpty()
    val selectedItems = remember(groups, selected) { groups.flatMap { it.items }.filter { it.id in selected }.distinctBy { it.id } }

    Scaffold(
        topBar = { BackTopBar("Duplicate files", navigator::back) },
        bottomBar = {
            if (selectedItems.isNotEmpty()) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${selectedItems.size} selected · ${Format.size(selectedItems.sumOf { it.size })}",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Button(
                            onClick = { deleting = selectedItems },
                            enabled = selectedItems.all { it.canDelete },
                        ) { Text("Delete") }
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (!access.hasAnyAccess) {
                AccessNotice("Storage access needed", "Allow access so FilePilot can compare your files.", "Review access") { navigator.go(Routes.PERMISSIONS) }
                return@Column
            }
            Row(Modifier.fillMaxWidth().clickable { vm.verify.value = !verify }.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Compare contents", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Reads files to confirm they are byte-identical (SHA-256). Slower, but exact. Off: matches by size and type only.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = verify, onCheckedChange = { vm.verify.value = it }, enabled = !ui.running)
            }
            when {
                ui.running -> {
                    val p = ui.progress
                    Column(Modifier.padding(20.dp)) {
                        if (p != null && p.total > 0) {
                            LinearProgressIndicator(progress = { p.done.toFloat() / p.total }, modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(8.dp))
                            Text("Comparing ${p.done} of ${p.total}: ${p.current}", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        } else {
                            LinearProgressIndicator(Modifier.fillMaxWidth())
                            Spacer(Modifier.height(8.dp))
                            Text("Looking for files with the same size…", style = MaterialTheme.typography.bodySmall)
                        }
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton(onClick = vm::cancel) { Text("Cancel scan") }
                    }
                }
                ui.error != null -> EmptyState(Icons.Rounded.CleaningServices, "Scan failed", ui.error!!, actionLabel = "Try again", onAction = vm::scan)
                ui.result == null -> EmptyState(
                    Icons.Rounded.ContentCopy, "Find duplicate files",
                    "FilePilot compares files on this device only. Nothing is deleted until you choose files and confirm.",
                    actionLabel = "Start scan", onAction = vm::scan,
                )
                groups.isEmpty() -> EmptyState(Icons.Rounded.TaskAlt, "No duplicates found", "Every file checked is unique.", actionLabel = "Scan again", onAction = vm::scan)
                else -> {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${groups.size} groups · up to ${Format.size(groups.sumOf { it.reclaimable })} reclaimable",
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                        )
                        TextButton(onClick = vm::selectAllButNewest) { Text("Keep newest") }
                    }
                    LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                        groups.forEachIndexed { gi, g ->
                            item(key = "h$gi") {
                                SectionHeader("${g.items.size} copies · ${Format.size(g.size)} each")
                            }
                            items(g.items, key = { "$gi:${it.id}" }) { f ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { navigator.open(f) }.padding(horizontal = 16.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    FileThumb(f, size = 40.dp)
                                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                        Text(f.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            "${Format.date(f.lastModified)} · ${f.path?.substringBeforeLast('/') ?: "Media library"}",
                                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    Checkbox(checked = f.id in selected, onCheckedChange = { vm.toggle(f.id) }, enabled = f.canDelete)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    deleting?.let { items ->
        DeleteDialog(items, onDismiss = { deleting = null }) {
            deleting = null
            if (!container.operations.delete(items)) container.message("Another operation is still running")
        }
    }
}

// ---------------------------------------------------------------- Empty folders

class EmptyFoldersViewModel(private val container: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow(ScanUi<FileItem>())
    val ui: StateFlow<ScanUi<FileItem>> = _ui.asStateFlow()
    val selected = MutableStateFlow<Set<String>>(emptySet())
    private var job: Job? = null

    init {
        viewModelScope.launch {
            container.operations.version.drop(1).collect { if (_ui.value.result != null) scan() }
        }
    }

    fun scan() {
        job?.cancel()
        selected.value = emptySet()
        _ui.value = ScanUi(running = true)
        job = viewModelScope.launch {
            try {
                val roots = container.storage.volumes().mapNotNull { it.path }
                val result = container.cleanup.findEmptyFolders(roots) { p -> _ui.value = _ui.value.copy(progress = p) }
                _ui.value = ScanUi(result = result)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.value = ScanUi(error = e.userMessage())
            }
        }
    }

    fun cancel() {
        job?.cancel()
        _ui.value = ScanUi()
    }

    fun toggle(id: String) {
        val s = selected.value
        selected.value = if (id in s) s - id else s + id
    }

    fun selectAll() {
        selected.value = _ui.value.result.orEmpty().filter { it.canDelete }.mapTo(HashSet()) { it.id }
    }
}

@Composable
fun EmptyFoldersScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val vm = appViewModel { c, _ -> EmptyFoldersViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val access by container.access.collectAsStateWithLifecycle()
    val requester = rememberAccessRequester()
    var deleting by remember { mutableStateOf<List<FileItem>?>(null) }
    val result = ui.result.orEmpty()
    val chosen = remember(result, selected) { result.filter { it.id in selected } }

    Scaffold(
        topBar = { BackTopBar("Empty folders", navigator::back) },
        bottomBar = {
            if (chosen.isNotEmpty()) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${chosen.size} selected", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Button(onClick = { deleting = chosen }) { Text("Delete") }
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when {
                !access.fullAccess -> EmptyState(
                    Icons.Rounded.FolderOff, "Needs full file access",
                    "Finding empty folders means looking through all folders on shared storage, which requires full file access.",
                    actionLabel = "Allow full access", onAction = requester::requestFullAccess,
                )
                ui.running -> Column(Modifier.padding(20.dp)) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    Text("Checked ${ui.progress?.done ?: 0} folders… ${ui.progress?.current.orEmpty()}", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = vm::cancel) { Text("Cancel scan") }
                }
                ui.error != null -> EmptyState(Icons.Rounded.FolderOff, "Scan failed", ui.error!!, actionLabel = "Try again", onAction = vm::scan)
                ui.result == null -> EmptyState(
                    Icons.Rounded.FolderOff, "Find empty folders",
                    "Lists folders with no files or subfolders. App-private folders are skipped. Nothing is deleted unless you confirm.",
                    actionLabel = "Start scan", onAction = vm::scan,
                )
                result.isEmpty() -> EmptyState(Icons.Rounded.TaskAlt, "No empty folders", "Your storage has no empty folders.", actionLabel = "Scan again", onAction = vm::scan)
                else -> {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${result.size} empty folders", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f).padding(start = 8.dp))
                        TextButton(onClick = vm::selectAll) { Text("Select all") }
                    }
                    LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                        items(result, key = { it.id }) { f ->
                            Row(
                                Modifier.fillMaxWidth().clickable { vm.toggle(f.id) }.padding(horizontal = 16.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                FileThumb(f, size = 38.dp)
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Text(f.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(f.path.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Checkbox(checked = f.id in selected, onCheckedChange = { vm.toggle(f.id) }, enabled = f.canDelete)
                            }
                        }
                    }
                }
            }
        }
    }
    deleting?.let { items ->
        DeleteDialog(items, onDismiss = { deleting = null }) {
            deleting = null
            if (!container.operations.delete(items)) container.message("Another operation is still running")
        }
    }
}

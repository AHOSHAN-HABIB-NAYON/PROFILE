@file:OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.webtecit.filepilot.feature.recent

import android.content.Context
import android.provider.MediaStore
import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.Feedback
import com.webtecit.filepilot.core.designsystem.FileThumb
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.data.FileOpener
import com.webtecit.filepilot.feature.browser.DeleteSheet
import com.webtecit.filepilot.feature.browser.ItemAction
import com.webtecit.filepilot.feature.browser.ItemActionsSheet
import com.webtecit.filepilot.feature.browser.SelectTick
import com.webtecit.filepilot.feature.browser.subtitle
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.Calendar
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Which recent files to show. */
enum class RecentFilter(val label: String) {
    ALL("All"), DOWNLOADS("Downloads"), IMAGES("Images"), VIDEOS("Videos"), AUDIO("Audio"), DOCS("Documents"), APKS("APKs"), ARCHIVES("Archives"),
}

private fun RecentFilter.matches(f: FileItem): Boolean = when (this) {
    RecentFilter.ALL -> true
    RecentFilter.DOWNLOADS -> f.id.contains("/Download/", ignoreCase = true)
    RecentFilter.IMAGES -> f.kind == FileKind.IMAGE
    RecentFilter.VIDEOS -> f.kind == FileKind.VIDEO
    RecentFilter.AUDIO -> f.kind == FileKind.AUDIO
    RecentFilter.DOCS -> f.kind in setOf(FileKind.DOCUMENT, FileKind.PDF, FileKind.SPREADSHEET, FileKind.PRESENTATION, FileKind.TEXT)
    RecentFilter.APKS -> f.kind == FileKind.APK
    RecentFilter.ARCHIVES -> f.kind == FileKind.ARCHIVE
}

data class RecentUi(
    val loading: Boolean = true,
    val files: List<FileItem> = emptyList(),
    val filter: RecentFilter = RecentFilter.ALL,
    val selected: Set<String> = emptySet(),
)

/** Files that recently arrived on the phone (downloads, photos, received files…), newest first. */
@HiltViewModel
class RecentFilesViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val opener: FileOpener,
    @IoDispatcher private val io: CoroutineDispatcher,
    private val recycleBin: com.webtecit.filepilot.core.cleaning.RecycleBin,
    private val operations: com.webtecit.filepilot.core.operations.FileOperationManager,
    private val preferences: com.webtecit.filepilot.core.preferences.PreferencesRepository,
) : ViewModel() {
    val state = MutableStateFlow(RecentUi())
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init { load() }

    fun load() {
        state.value = state.value.copy(loading = true)
        viewModelScope.launch {
            val found = withContext(io) { runCatching { query() }.getOrDefault(emptyList()) }
            state.value = state.value.copy(loading = false, files = found, selected = state.value.selected.intersect(found.map { it.id }.toSet()))
        }
    }

    @Suppress("DEPRECATION")
    private fun query(): List<FileItem> {
        val since = System.currentTimeMillis() / 1000 - DAYS * 24 * 3600
        val added = MediaStore.Files.FileColumns.DATE_ADDED
        val projection = arrayOf(
            MediaStore.Files.FileColumns.DATA, MediaStore.Files.FileColumns.DISPLAY_NAME, MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_MODIFIED, added,
        )
        // Files only (folders have no MIME type), newest arrival first.
        val selection = "$added >= ? AND ${MediaStore.Files.FileColumns.MIME_TYPE} IS NOT NULL AND ${MediaStore.Files.FileColumns.SIZE} > 0"
        val out = ArrayList<FileItem>()
        context.contentResolver.query(MediaStore.Files.getContentUri("external"), projection, selection, arrayOf(since.toString()), "$added DESC")?.use { cur ->
            while (cur.moveToNext() && out.size < MAX) {
                val path = cur.getString(0) ?: continue
                if (path.contains("/.") || path.contains("/Android/data/") || path.contains("/Android/obb/")) continue
                val name = cur.getString(1) ?: File(path).name
                val addedMs = cur.getLong(4) * 1000
                out += FileItem(path, name, false, cur.getLong(2), addedMs.takeIf { it > 0 } ?: (cur.getLong(3) * 1000), FileTypes.mimeOf(name))
            }
        }
        return out.filter { File(it.id).isFile }
    }

    fun setFilter(f: RecentFilter) { state.value = state.value.copy(filter = f, selected = emptySet()) }
    fun shown(): List<FileItem> = state.value.files.filter { state.value.filter.matches(it) }
    fun toggle(item: FileItem) {
        val sel = state.value.selected
        state.value = state.value.copy(selected = if (item.id in sel) sel - item.id else sel + item.id)
    }
    fun selectAll() { state.value = state.value.copy(selected = shown().map { it.id }.toSet()) }
    fun clearSelection() { state.value = state.value.copy(selected = emptySet()) }
    fun selectedItems(): List<FileItem> = state.value.files.filter { it.id in state.value.selected }

    fun open(item: FileItem) { viewModelScope.launch { _events.send(opener.openFile(item, chooser = false)) } }
    fun openWith(item: FileItem) { viewModelScope.launch { _events.send(opener.openFile(item, chooser = true)) } }
    fun share(items: List<FileItem>) { viewModelScope.launch { _events.send(opener.share(items)) } }

    fun canUseBin(items: List<FileItem>): Boolean =
        runCatching { kotlinx.coroutines.runBlocking { preferences.current().recycleBin } }.getOrDefault(true) && items.all(recycleBin::supports)

    fun delete(items: List<FileItem>, permanently: Boolean) {
        if (items.isEmpty()) return
        val freed = Formatters.size(items.sumOf { it.size })
        val what = if (items.size == 1) items[0].name else Formatters.count(items.size, "file")
        viewModelScope.launch {
            if (!permanently && items.all(recycleBin::supports)) {
                runCatching { recycleBin.trashEntries(items) }
                    .onSuccess { entries -> Feedback.deleted("Deleted", "$what · $freed", undo = { recycleBin.undo(entries); load() }) }
                    .onFailure { Feedback.error("Couldn't delete", it.message.orEmpty()); return@launch }
            } else {
                operations.delete(items)
            }
            val gone = items.map { it.id }.toSet()
            state.value = state.value.copy(files = state.value.files.filterNot { it.id in gone }, selected = state.value.selected - gone)
        }
    }

    companion object {
        const val DAYS = 60L
        const val MAX = 1500
    }
}

/** "Today", "Yesterday", "This week", "This month" or "Earlier". */
private fun dayGroup(ms: Long): String {
    val cal = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
    val today = cal.timeInMillis
    return when {
        ms >= today -> "Today"
        ms >= today - DateUtils.DAY_IN_MILLIS -> "Yesterday"
        ms >= today - 6 * DateUtils.DAY_IN_MILLIS -> "This week"
        ms >= today - 29 * DateUtils.DAY_IN_MILLIS -> "This month"
        else -> "Earlier"
    }
}

private val RecentActions = setOf(
    ItemAction.OPEN, ItemAction.SHARE, ItemAction.OPEN_WITH, ItemAction.DELETE, ItemAction.SHOW_IN_FOLDER, ItemAction.COPY_PATH,
    ItemAction.EDIT, ItemAction.TOOL_APK, ItemAction.TOOL_ARCHIVE, ItemAction.TOOL_PDF, ItemAction.TOOL_HEX, ItemAction.TOOL_FONT, ItemAction.TOOL_SQLITE,
)

@Composable
fun RecentFilesScreen(
    onBack: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenRoute: (Any) -> Unit,
    routeFor: (String) -> Any?,
    viewModel: RecentFilesViewModel = hiltViewModel(),
) {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    val context = LocalContext.current
    var sheetFor by remember { mutableStateOf<FileItem?>(null) }
    var deleting by remember { mutableStateOf<List<FileItem>?>(null) }
    val selecting = ui.selected.isNotEmpty()
    BackHandler(enabled = selecting) { viewModel.clearSelection() }
    val shown = ui.files.filter { ui.filter.matches(it) }

    fun openItem(item: FileItem) {
        routeFor(item.id)?.let(onOpenRoute) ?: viewModel.open(item)
    }

    fun onAction(item: FileItem, action: ItemAction) {
        sheetFor = null
        when (action) {
            ItemAction.OPEN -> openItem(item)
            ItemAction.SHARE -> viewModel.share(listOf(item))
            ItemAction.OPEN_WITH -> viewModel.openWith(item)
            ItemAction.DELETE -> deleting = listOf(item)
            ItemAction.SHOW_IN_FOLDER -> onOpenFolder(item.id.substringBeforeLast('/'))
            ItemAction.COPY_PATH -> {
                context.getSystemService(android.content.ClipboardManager::class.java)
                    ?.setPrimaryClip(android.content.ClipData.newPlainText("Path", item.id))
                android.widget.Toast.makeText(context, "Path copied", android.widget.Toast.LENGTH_SHORT).show()
            }
            ItemAction.EDIT -> onOpenRoute(com.webtecit.filepilot.navigation.EditorRoute(item.id))
            ItemAction.TOOL_APK -> onOpenRoute(com.webtecit.filepilot.navigation.ApkRoute(item.id))
            ItemAction.TOOL_ARCHIVE -> onOpenRoute(com.webtecit.filepilot.navigation.ArchiveRoute(item.id))
            ItemAction.TOOL_PDF -> onOpenRoute(com.webtecit.filepilot.navigation.PdfRoute(item.id))
            ItemAction.TOOL_HEX -> onOpenRoute(com.webtecit.filepilot.navigation.HexRoute(item.id))
            ItemAction.TOOL_FONT -> onOpenRoute(com.webtecit.filepilot.navigation.FontRoute(item.id))
            ItemAction.TOOL_SQLITE -> onOpenRoute(com.webtecit.filepilot.navigation.SqliteRoute(item.id))
            else -> Unit
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (selecting) Text("${ui.selected.size} selected")
                    else Column {
                        Text("Recent files")
                        Text("Last ${RecentFilesViewModel.DAYS} days · newest first", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = {
                    if (selecting) IconButton(onClick = viewModel::clearSelection) { Icon(Icons.Rounded.Close, "Cancel selection") }
                    else IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
                },
                actions = {
                    if (selecting) Text(
                        if (ui.selected.size == shown.size) "Clear" else "Select all", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { if (ui.selected.size == shown.size) viewModel.clearSelection() else viewModel.selectAll() }.padding(12.dp),
                    )
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RecentFilter.entries.forEach { f ->
                    val count = ui.files.count { f.matches(it) }
                    if (f == RecentFilter.ALL || count > 0) {
                        FilterChip(selected = ui.filter == f, onClick = { viewModel.setFilter(f) }, label = { Text("${f.label} $count") })
                    }
                }
            }
            if (ui.loading && ui.files.isEmpty()) LinearProgressIndicator(Modifier.fillMaxWidth())
            PullToRefreshBox(isRefreshing = ui.loading && ui.files.isNotEmpty(), onRefresh = viewModel::load, modifier = Modifier.fillMaxSize()) {
                if (!ui.loading && shown.isEmpty()) {
                    EmptyState(Icons.Rounded.History, "No recent files", "New downloads, photos and received files from the last ${RecentFilesViewModel.DAYS} days appear here.")
                } else {
                    val groups = shown.groupBy { dayGroup(it.lastModified) }
                    LazyColumn(Modifier.fillMaxSize().testTag("recent_list"), contentPadding = PaddingValues(bottom = if (selecting) 100.dp else 24.dp)) {
                        groups.forEach { (title, list) ->
                            item(key = "h_$title") {
                                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                                    Text("${list.size} · ${Formatters.size(list.sumOf { it.size })}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            items(list, key = { it.id }) { item ->
                                val selected = item.id in ui.selected
                                Row(
                                    Modifier.fillMaxWidth()
                                        .background(if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f) else Color.Transparent)
                                        .combinedClickable(
                                            onClick = { if (selecting) viewModel.toggle(item) else openItem(item) },
                                            onLongClick = { viewModel.toggle(item) },
                                        )
                                        .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (selecting) { SelectTick(selected); Spacer(Modifier.width(12.dp)) }
                                    FileThumb(item, size = 48.dp)
                                    Spacer(Modifier.width(14.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(item.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            "${Formatters.size(item.size)} · ${DateUtils.getRelativeTimeSpanString(item.lastModified, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)} · ${item.id.substringBeforeLast('/').substringAfterLast('/')}",
                                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    if (!selecting) IconButton(onClick = { sheetFor = item }) {
                                        Icon(Icons.Rounded.MoreVert, "Actions for ${item.name}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                }
                if (selecting) {
                    Row(
                        Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp)
                            .clip(RoundedCornerShape(22.dp)).background(Color(0xFF151A2D)).padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        BarButton(Icons.Rounded.Share, "Share", Color.White) { viewModel.share(viewModel.selectedItems()) }
                        BarButton(Icons.Rounded.Delete, "Delete", Color(0xFFFF8A9A)) { deleting = viewModel.selectedItems() }
                    }
                }
            }
        }
    }

    sheetFor?.let { item ->
        ItemActionsSheet(item = item, favorite = false, onAction = { onAction(item, it) }, onDismiss = { sheetFor = null }, allowed = RecentActions)
    }
    deleting?.let { list ->
        DeleteSheet(
            items = list,
            canUseRecycleBin = viewModel.canUseBin(list),
            onDelete = { permanently -> deleting = null; viewModel.delete(list, permanently) },
            onDismiss = { deleting = null },
        )
    }
}

@Composable
private fun BarButton(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = tint)
        Text(label, color = tint, style = MaterialTheme.typography.labelSmall)
    }
}

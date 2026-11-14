@file:OptIn(ExperimentalMaterial3Api::class, kotlinx.coroutines.FlowPreview::class, androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.webtecit.filepilot.feature.search

import android.content.Context
import android.provider.MediaStore
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.combinedClickable
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.FileThumb
import com.webtecit.filepilot.core.designsystem.ScanAnimation
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.data.FileOpener
import com.webtecit.filepilot.feature.browser.subtitle
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class SearchUi(
    val text: String = "",
    val query: SmartQuery = SmartQuery(),
    val searching: Boolean = false,
    val results: List<FileItem>? = null,
    val recent: List<String> = emptyList(),
    val selected: Set<String> = emptySet(),
)

@HiltViewModel
class SmartSearchViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val opener: FileOpener,
    @IoDispatcher private val io: CoroutineDispatcher,
    private val recycleBin: com.webtecit.filepilot.core.cleaning.RecycleBin,
    private val operations: com.webtecit.filepilot.core.operations.FileOperationManager,
    private val preferences: com.webtecit.filepilot.core.preferences.PreferencesRepository,
) : ViewModel() {
    val state = MutableStateFlow(SearchUi(recent = loadRecent()))
    private val input = MutableStateFlow("")
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            input.debounce(300).collectLatest { text ->
                val q = SmartQueryParser.parse(text)
                state.value = state.value.copy(query = q, searching = !q.isEmpty, results = if (q.isEmpty) null else state.value.results)
                if (q.isEmpty) return@collectLatest
                val found = withContext(io) { runCatching { search(q) }.getOrDefault(emptyList()) }
                state.value = state.value.copy(searching = false, results = found)
            }
        }
    }

    fun setText(t: String) {
        state.value = state.value.copy(text = t)
        input.value = t
    }

    fun toggle(item: FileItem) {
        val sel = state.value.selected
        state.value = state.value.copy(selected = if (item.id in sel) sel - item.id else sel + item.id)
    }

    fun selectAll() { state.value = state.value.copy(selected = state.value.results.orEmpty().map { it.id }.toSet()) }
    fun clearSelection() { state.value = state.value.copy(selected = emptySet()) }
    fun selectedItems(): List<FileItem> = state.value.results.orEmpty().filter { it.id in state.value.selected }
    fun rememberQuery() = saveRecent(state.value.text)

    fun share(items: List<FileItem>) { viewModelScope.launch { _events.send(opener.share(items)) } }
    fun openWith(item: FileItem) { viewModelScope.launch { _events.send(opener.openFile(item, chooser = true)) } }

    fun recycleBinOn(): Boolean = runCatching { kotlinx.coroutines.runBlocking { preferences.current().recycleBin } }.getOrDefault(true)
    fun canUseBin(items: List<FileItem>) = recycleBinOn() && items.all(recycleBin::supports)

    /** Deletes [items] (to the Recycle Bin unless [permanently]) and drops them from the results. */
    fun delete(items: List<FileItem>, permanently: Boolean) {
        if (items.isEmpty()) return
        val freed = com.webtecit.filepilot.core.common.Formatters.size(items.filter { !it.isDirectory }.sumOf { it.size })
        val what = if (items.size == 1) items[0].name else com.webtecit.filepilot.core.common.Formatters.count(items.size, "item")
        viewModelScope.launch {
            if (!permanently && items.all(recycleBin::supports)) {
                runCatching { recycleBin.trashEntries(items) }
                    .onSuccess { entries ->
                        com.webtecit.filepilot.core.designsystem.Feedback.deleted("Deleted", "$what · $freed", undo = {
                            recycleBin.undo(entries)
                            state.value = state.value.copy(results = (state.value.results.orEmpty() + items).distinctBy { it.id })
                        })
                    }
                    .onFailure { com.webtecit.filepilot.core.designsystem.Feedback.error("Couldn't delete", it.message.orEmpty()); return@launch }
            } else {
                operations.delete(items)
            }
            val gone = items.map { it.id }.toSet()
            state.value = state.value.copy(results = state.value.results?.filterNot { it.id in gone }, selected = state.value.selected - gone)
        }
    }

    fun open(item: FileItem) {
        saveRecent(state.value.text)
        viewModelScope.launch {
            _events.send(if (item.isDirectory) UiEvent.OpenFolder(item.id) else opener.openFile(item, chooser = false))
        }
    }

    @Suppress("DEPRECATION")
    private fun search(q: SmartQuery): List<FileItem> {
        val c = MediaStore.Files.FileColumns.DISPLAY_NAME
        val parts = ArrayList<String>()
        val args = ArrayList<String>()
        q.words.forEach { parts += "$c LIKE ?"; args += "%$it%" }
        q.minSize?.let { parts += "${MediaStore.Files.FileColumns.SIZE} >= ?"; args += it.toString() }
        q.maxSize?.let { parts += "${MediaStore.Files.FileColumns.SIZE} <= ?"; args += it.toString() }
        q.after?.let { parts += "${MediaStore.Files.FileColumns.DATE_MODIFIED} >= ?"; args += (it / 1000).toString() }
        q.before?.let { parts += "${MediaStore.Files.FileColumns.DATE_MODIFIED} < ?"; args += (it / 1000).toString() }
        val typeParts = ArrayList<String>()
        val mt = MediaStore.Files.FileColumns.MEDIA_TYPE
        q.kinds.forEach { k ->
            when (k) {
                FileKind.IMAGE -> typeParts += "$mt = ${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}"
                FileKind.VIDEO -> typeParts += "$mt = ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO}"
                FileKind.AUDIO -> typeParts += "$mt = ${MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO}"
                else -> extensionsOf(k).forEach { e -> typeParts += "$c LIKE ?"; args += "%.$e" }
            }
        }
        q.extensions.forEach { e -> typeParts += "$c LIKE ?"; args += "%.$e" }
        if (typeParts.isNotEmpty()) parts += typeParts.joinToString(" OR ", "(", ")")
        val selection = parts.joinToString(" AND ").ifEmpty { null }
        val projection = arrayOf(MediaStore.Files.FileColumns.DATA, c, MediaStore.Files.FileColumns.SIZE, MediaStore.Files.FileColumns.DATE_MODIFIED)
        val order = if (q.minSize != null) "${MediaStore.Files.FileColumns.SIZE} DESC" else "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"
        val out = ArrayList<FileItem>()
        context.contentResolver.query(MediaStore.Files.getContentUri("external"), projection, selection, args.toTypedArray(), order)?.use { cur ->
            while (cur.moveToNext() && out.size < 500) {
                val path = cur.getString(0) ?: continue
                val name = cur.getString(1) ?: File(path).name
                if (name.startsWith(".")) continue
                val dir = File(path).isDirectory
                out += FileItem(path, name, dir, cur.getLong(2), cur.getLong(3) * 1000, if (dir) FileTypes.DIRECTORY_MIME else FileTypes.mimeOf(name))
            }
        }
        return out
    }

    private fun extensionsOf(k: FileKind) = when (k) {
        FileKind.DOCUMENT -> listOf("doc", "docx", "odt", "rtf", "txt", "md", "xls", "xlsx", "ppt", "pptx", "csv", "pdf", "epub")
        FileKind.APK -> listOf("apk", "xapk", "apks")
        FileKind.ARCHIVE -> listOf("zip", "rar", "7z", "tar", "gz", "tgz")
        FileKind.CODE -> listOf("html", "htm", "css", "js", "json", "xml", "kt", "java", "py", "php", "sql", "c", "cpp")
        else -> emptyList()
    }

    private val prefs get() = context.getSharedPreferences("search_history", Context.MODE_PRIVATE)
    private fun loadRecent(): List<String> = prefs.getString("recent", "")!!.split('\n').filter { it.isNotBlank() }
    private fun saveRecent(text: String) {
        val t = text.trim()
        if (t.isEmpty()) return
        val list = (listOf(t) + loadRecent().filter { it != t }).take(8)
        prefs.edit().putString("recent", list.joinToString("\n")).apply()
        state.value = state.value.copy(recent = list)
    }

    fun clearRecent() {
        prefs.edit().remove("recent").apply()
        state.value = state.value.copy(recent = emptyList())
    }
}

private val examples = listOf(
    "large videos from last week",
    "photos from 2024",
    "pdf invoice",
    "apk files bigger than 50 mb",
    "music",
    "documents from this month",
    ".html files",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SmartSearchScreen(
    onBack: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenRoute: (Any) -> Unit = {},
    routeFor: (String) -> Any? = { null },
    viewModel: SmartSearchViewModel = hiltViewModel(),
) {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar, onOpenFolder)
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val primary = MaterialTheme.colorScheme.primary
    val tertiary = MaterialTheme.colorScheme.tertiary
    val glow = rememberInfiniteTransition(label = "glow")
    val shift by glow.animateFloat(0f, 1f, infiniteRepeatable(tween(2600, easing = LinearEasing)), label = "shift")
    val context = androidx.compose.ui.platform.LocalContext.current
    var sheetFor by remember { mutableStateOf<FileItem?>(null) }
    var deleting by remember { mutableStateOf<List<FileItem>?>(null) }
    val selecting = ui.selected.isNotEmpty()
    androidx.activity.compose.BackHandler(enabled = selecting) { viewModel.clearSelection() }

    fun openItem(item: FileItem) {
        viewModel.rememberQuery()
        when {
            item.isDirectory -> onOpenFolder(item.id)
            item.id.startsWith("/") -> routeFor(item.id)?.let(onOpenRoute) ?: viewModel.open(item)
            else -> viewModel.open(item)
        }
    }

    fun onAction(item: FileItem, action: com.webtecit.filepilot.feature.browser.ItemAction) {
        sheetFor = null
        when (action) {
            com.webtecit.filepilot.feature.browser.ItemAction.OPEN -> openItem(item)
            com.webtecit.filepilot.feature.browser.ItemAction.SHARE -> viewModel.share(listOf(item))
            com.webtecit.filepilot.feature.browser.ItemAction.OPEN_WITH -> viewModel.openWith(item)
            com.webtecit.filepilot.feature.browser.ItemAction.DELETE -> deleting = listOf(item)
            com.webtecit.filepilot.feature.browser.ItemAction.SHOW_IN_FOLDER -> onOpenFolder(item.id.substringBeforeLast('/'))
            com.webtecit.filepilot.feature.browser.ItemAction.COPY_PATH -> {
                val cm = context.getSystemService(android.content.ClipboardManager::class.java)
                cm?.setPrimaryClip(android.content.ClipData.newPlainText("Path", item.id))
                android.widget.Toast.makeText(context, "Path copied", android.widget.Toast.LENGTH_SHORT).show()
            }
            com.webtecit.filepilot.feature.browser.ItemAction.EDIT -> onOpenRoute(com.webtecit.filepilot.navigation.EditorRoute(item.id))
            com.webtecit.filepilot.feature.browser.ItemAction.TOOL_APK -> onOpenRoute(com.webtecit.filepilot.navigation.ApkRoute(item.id))
            com.webtecit.filepilot.feature.browser.ItemAction.TOOL_ARCHIVE -> onOpenRoute(com.webtecit.filepilot.navigation.ArchiveRoute(item.id))
            com.webtecit.filepilot.feature.browser.ItemAction.TOOL_PDF -> onOpenRoute(com.webtecit.filepilot.navigation.PdfRoute(item.id))
            com.webtecit.filepilot.feature.browser.ItemAction.TOOL_HEX -> onOpenRoute(com.webtecit.filepilot.navigation.HexRoute(item.id))
            com.webtecit.filepilot.feature.browser.ItemAction.TOOL_FONT -> onOpenRoute(com.webtecit.filepilot.navigation.FontRoute(item.id))
            com.webtecit.filepilot.feature.browser.ItemAction.TOOL_SQLITE -> onOpenRoute(com.webtecit.filepilot.navigation.SqliteRoute(item.id))
            else -> Unit
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
                // An animated gradient border marks the smart search field.
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(26.dp))
                        .background(Brush.linearGradient(listOf(primary, tertiary, primary), start = androidx.compose.ui.geometry.Offset(shift * 600f, 0f), end = androidx.compose.ui.geometry.Offset(shift * 600f + 600f, 300f)))
                        .padding(2.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surface)
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.AutoAwesome, null, tint = primary)
                        Spacer(Modifier.width(10.dp))
                        Box(Modifier.weight(1f)) {
                            if (ui.text.isEmpty()) Text("Describe what you're looking for…", color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                            BasicTextField(
                                value = ui.text,
                                onValueChange = viewModel::setText,
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                                cursorBrush = SolidColor(primary),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                keyboardActions = KeyboardActions(onSearch = { }),
                                modifier = Modifier.fillMaxWidth().focusRequester(focus).testTag("smart_search_field"),
                            )
                        }
                        if (ui.text.isNotEmpty()) Icon(Icons.Rounded.Close, "Clear", Modifier.clickable { viewModel.setText("") })
                    }
                }
            }
            AnimatedVisibility(ui.query.labels.isNotEmpty()) {
                FlowRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Understood:", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                    ui.query.labels.forEach { l ->
                        Text(
                            l, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primaryContainer).padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
            }
            if (ui.searching) LinearProgressIndicator(Modifier.fillMaxWidth())
            val results = ui.results
            when {
                ui.text.isBlank() -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                    if (ui.recent.isNotEmpty()) {
                        item {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Recent searches", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                Text("Clear", color = primary, modifier = Modifier.clickable { viewModel.clearRecent() }.padding(8.dp))
                            }
                        }
                        items(ui.recent) { r -> Suggestion(Icons.Rounded.History, r) { viewModel.setText(r) } }
                    }
                    item { Text("Try asking", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)) }
                    items(examples) { e -> Suggestion(Icons.Rounded.AutoAwesome, e) { viewModel.setText(e) } }
                }
                ui.searching && results == null -> ScanAnimation("Searching your files", "Looking through names, types, sizes and dates", size = 180.dp)
                results != null && results.isEmpty() && !ui.searching -> EmptyState(
                    Icons.Rounded.SearchOff, "Nothing found", "No files match. Try fewer words, or a different type or time.",
                )
                results != null -> Box(Modifier.fillMaxSize()) {
                    LazyColumn(contentPadding = PaddingValues(bottom = if (selecting) 96.dp else 24.dp), modifier = Modifier.testTag("search_results")) {
                        item {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (selecting) {
                                    val bytes = viewModel.selectedItems().filter { !it.isDirectory }.sumOf { it.size }
                                    Text("${ui.selected.size} selected", style = MaterialTheme.typography.labelLarge, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                                    Text(" · ${com.webtecit.filepilot.core.common.Formatters.size(bytes)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                                    Text(if (ui.selected.size == results.size) "Clear" else "Select all", color = primary, style = MaterialTheme.typography.labelLarge,
                                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { if (ui.selected.size == results.size) viewModel.clearSelection() else viewModel.selectAll() }.padding(6.dp))
                                } else {
                                    Text("${results.size}${if (results.size == 500) "+" else ""} results", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                                    Text("Long-press to select", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        items(results, key = { it.id }) { item ->
                            val selected = item.id in ui.selected
                            Row(
                                Modifier.fillMaxWidth()
                                    .background(if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f) else androidx.compose.ui.graphics.Color.Transparent)
                                    .combinedClickable(
                                        onClick = { if (selecting) viewModel.toggle(item) else openItem(item) },
                                        onLongClick = { viewModel.toggle(item) },
                                    )
                                    .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (selecting) {
                                    com.webtecit.filepilot.feature.browser.SelectTick(selected)
                                    Spacer(Modifier.width(12.dp))
                                }
                                FileThumb(item, size = 48.dp)
                                Spacer(Modifier.width(14.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(item.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${item.subtitle()} · ${item.id.substringBeforeLast('/').substringAfterLast('/')}",
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                if (!selecting) IconButton(onClick = { sheetFor = item }) {
                                    Icon(androidx.compose.material.icons.Icons.Rounded.MoreVert, "Actions for ${item.name}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    if (selecting) {
                        Row(
                            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp)
                                .clip(RoundedCornerShape(22.dp)).background(androidx.compose.ui.graphics.Color(0xFF151A2D)).padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                        ) {
                            SelBarButton(androidx.compose.material.icons.Icons.Rounded.Share, "Share", androidx.compose.ui.graphics.Color.White) { viewModel.share(viewModel.selectedItems()) }
                            SelBarButton(androidx.compose.material.icons.Icons.Rounded.Close, "Cancel", androidx.compose.ui.graphics.Color.White) { viewModel.clearSelection() }
                            SelBarButton(androidx.compose.material.icons.Icons.Rounded.Delete, "Delete", androidx.compose.ui.graphics.Color(0xFFFF8A9A)) { deleting = viewModel.selectedItems() }
                        }
                    }
                }
            }
        }
    }

    sheetFor?.let { item ->
        com.webtecit.filepilot.feature.browser.ItemActionsSheet(
            item = item,
            favorite = false,
            onAction = { onAction(item, it) },
            onDismiss = { sheetFor = null },
            allowed = SearchActions,
        )
    }
    deleting?.let { list ->
        com.webtecit.filepilot.feature.browser.DeleteSheet(
            items = list,
            canUseRecycleBin = viewModel.canUseBin(list),
            onDelete = { permanently -> deleting = null; viewModel.delete(list, permanently) },
            onDismiss = { deleting = null },
        )
    }
}

private val SearchActions = setOf(
    com.webtecit.filepilot.feature.browser.ItemAction.OPEN, com.webtecit.filepilot.feature.browser.ItemAction.SHARE,
    com.webtecit.filepilot.feature.browser.ItemAction.OPEN_WITH, com.webtecit.filepilot.feature.browser.ItemAction.DELETE,
    com.webtecit.filepilot.feature.browser.ItemAction.SHOW_IN_FOLDER, com.webtecit.filepilot.feature.browser.ItemAction.COPY_PATH,
    com.webtecit.filepilot.feature.browser.ItemAction.EDIT, com.webtecit.filepilot.feature.browser.ItemAction.TOOL_APK,
    com.webtecit.filepilot.feature.browser.ItemAction.TOOL_ARCHIVE, com.webtecit.filepilot.feature.browser.ItemAction.TOOL_PDF,
    com.webtecit.filepilot.feature.browser.ItemAction.TOOL_HEX, com.webtecit.filepilot.feature.browser.ItemAction.TOOL_FONT,
    com.webtecit.filepilot.feature.browser.ItemAction.TOOL_SQLITE,
)

@Composable
private fun SelBarButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = tint)
        Text(label, color = tint, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun Suggestion(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(vertical = 12.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

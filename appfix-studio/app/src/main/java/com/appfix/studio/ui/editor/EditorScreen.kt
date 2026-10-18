@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.editor

import android.graphics.Typeface
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.NoteAdd
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.patch.Diff
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.appViewModel
import com.appfix.studio.ui.components.ConfirmDialog
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.components.FileTree
import com.appfix.studio.ui.components.WorkspaceTreeSource
import com.appfix.studio.ui.theme.LocalStatusColors
import io.github.rosemoe.sora.event.ContentChangeEvent
import io.github.rosemoe.sora.event.PublishSearchResultEvent
import io.github.rosemoe.sora.event.SelectionChangeEvent
import io.github.rosemoe.sora.widget.CodeEditor
import io.github.rosemoe.sora.widget.EditorSearcher
import kotlinx.coroutines.launch

@Composable
fun EditorScreen(
    onOpenProjects: () -> Unit,
    onOpenSearch: (String) -> Unit,
    onOpenResources: (String) -> Unit,
    onOpenVisual: (String) -> Unit = {},
    onOpenFeatures: (String) -> Unit = {},
    onOpenBranding: (String) -> Unit = {},
    onOpenBuild: (String) -> Unit = {},
) {
    val vm = appViewModel { EditorViewModel(it) }
    val container = appContainer()
    val project by vm.project.collectAsStateWithLifecycle()
    val tabs by vm.tabs.collectAsStateWithLifecycle()
    val activePath by vm.active.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val conflict by vm.conflict.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val treeRevision by vm.treeRevision.collectAsStateWithLifecycle()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    var showFind by rememberSaveable { mutableStateOf(false) }
    var showGoTo by remember { mutableStateOf(false) }
    var showReview by remember { mutableStateOf(false) }
    var showNewFile by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmClose by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var historyTick by remember { mutableIntStateOf(0) }
    var caret by remember { mutableStateOf(1 to 1) }
    var matchCount by remember { mutableIntStateOf(-1) }

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }

    val p = project
    if (p == null) {
        Scaffold(topBar = { TopAppBar(title = { Text("Editor") }) }) { padding ->
            EmptyState(
                Icons.Outlined.Code, "No source project open",
                "Open a source project (ZIP, GitHub, folder or the sample) from Projects. APK files are browsed from their project page.",
                modifier = Modifier.padding(padding), actionLabel = "Choose a project", onAction = onOpenProjects,
            )
        }
        return
    }

    val activeHolder = remember { arrayOfNulls<String>(1) }
    activeHolder[0] = activePath
    val editor = remember {
        CodeEditor(context).apply {
            setTypefaceText(Typeface.MONOSPACE)
            setTypefaceLineNumber(Typeface.MONOSPACE)
            setLineNumberEnabled(true)
            setPinLineNumber(true)
            setHighlightCurrentLine(true)
            setTabWidth(4)
            setInterceptParentHorizontalScrollIfNeeded(true)
            subscribeEvent(ContentChangeEvent::class.java) { event, _ ->
                if (event.action != ContentChangeEvent.ACTION_SET_NEW_TEXT) activeHolder[0]?.let(vm::markDirty)
                historyTick++
            }
            subscribeEvent(SelectionChangeEvent::class.java) { _, _ ->
                val c = getCursor()
                caret = (c.leftLine + 1) to (c.leftColumn + 1)
            }
            subscribeEvent(PublishSearchResultEvent::class.java) { _, _ ->
                matchCount = runCatching { searcher.matchedPositionCount }.getOrDefault(0)
            }
        }
    }
    DisposableEffect(editor) { onDispose { editor.release() } }

    val colors = MaterialTheme.colorScheme
    val dark = colors.surface.luminance() < 0.5f
    LaunchedEffect(colors, dark) { editor.setColorScheme(editorColorScheme(colors, dark)) }
    LaunchedEffect(settings.editorFontSize, settings.editorWordWrap) {
        editor.setTextSize(settings.editorFontSize.toFloat())
        editor.setWordwrap(settings.editorWordWrap)
    }
    val content = remember(tabs, activePath) { activePath?.let { vm.contentOf(it) } }
    LaunchedEffect(content) {
        val path = activePath
        if (content != null && path != null) {
            editor.setText(content, true, null)
            editor.setEditorLanguage(AppFixLanguage(vm.languageOf(path)))
            editor.searcher.stopSearch()
            matchCount = -1
            historyTick++
        }
    }
    val jump by vm.jump.collectAsStateWithLifecycle()
    LaunchedEffect(jump, content) {
        val j = jump ?: return@LaunchedEffect
        if (j.path == activePath && content != null) {
            editor.post {
                val line = (j.line - 1).coerceIn(0, maxOf(0, editor.text.lineCount - 1))
                editor.setSelection(line, 0)
                editor.ensureSelectionVisible()
            }
            vm.consumeJump()
        }
    }

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet {
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Files", style = MaterialTheme.typography.titleMedium)
                        Text(p.name, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton(onClick = { showNewFile = true }) { Icon(Icons.Outlined.NoteAdd, contentDescription = "New file") }
                }
                val source = remember(p.id) { WorkspaceTreeSource(container.storage.workspace(p.id)) }
                FileTree(source, onOpenFile = { e -> vm.open(e.path); scope.launch { drawer.close() } }, refreshKey = treeRevision)
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    navigationIcon = { IconButton(onClick = { scope.launch { drawer.open() } }) { Icon(Icons.Outlined.Menu, contentDescription = "Show files") } },
                    title = {
                        Column {
                            Text(activePath?.substringAfterLast('/') ?: "Editor", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(p.name, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    actions = {
                        val tick = historyTick
                        IconButton(onClick = { editor.undo() }, enabled = activePath != null && tick >= 0 && editor.canUndo()) { Icon(Icons.AutoMirrored.Outlined.Undo, contentDescription = "Undo") }
                        IconButton(onClick = { editor.redo() }, enabled = activePath != null && tick >= 0 && editor.canRedo()) { Icon(Icons.AutoMirrored.Outlined.Redo, contentDescription = "Redo") }
                        IconButton(onClick = { activePath?.let(vm::save) }, enabled = activePath?.let { a -> tabs.any { it.path == a && it.dirty } } == true && !busy) {
                            Icon(Icons.Outlined.Save, contentDescription = "Save")
                        }
                        Box {
                            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Outlined.MoreVert, contentDescription = "More actions") }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                @Composable
                                fun item(label: String, enabled: Boolean = true, action: () -> Unit) =
                                    DropdownMenuItem(text = { Text(label) }, enabled = enabled, onClick = { menuOpen = false; action() })
                                val hasFile = activePath != null
                                item("Find & replace", hasFile) { showFind = true }
                                item("Go to line", hasFile) { showGoTo = true }
                                item("Review changes", hasFile) { showReview = true }
                                item("Save all", tabs.any { it.dirty }) { vm.saveAll() }
                                item("Revert to saved", hasFile) { activePath?.let { vm.revert(it) } }
                                HorizontalDivider()
                                item("Search in project") { onOpenSearch(p.id) }
                                item("Edit strings & colours") { onOpenResources(p.id) }
                                item("Visual layout editor") { onOpenVisual(p.id) }
                                item("Add a feature") { onOpenFeatures(p.id) }
                                item("Branding studio") { onOpenBranding(p.id) }
                                item("Cloud build") { onOpenBuild(p.id) }
                                item("New file") { showNewFile = true }
                                item("Delete file", hasFile) { confirmDelete = true }
                                item("Close tab", hasFile) { activePath?.let { if (vm.isDirty(it)) confirmClose = it else vm.close(it) } }
                            }
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
                if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (tabs.isNotEmpty()) {
                    val index = tabs.indexOfFirst { it.path == activePath }.coerceAtLeast(0)
                    PrimaryScrollableTabRow(selectedTabIndex = index, edgePadding = 8.dp) {
                        tabs.forEach { t ->
                            Tab(selected = t.path == activePath, onClick = { vm.activate(t.path) }, text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(t.path.substringAfterLast('/'), maxLines = 1)
                                    if (t.dirty) Text("  ●", color = MaterialTheme.colorScheme.primary)
                                    IconButton(onClick = { if (t.dirty) confirmClose = t.path else vm.close(t.path) }, modifier = Modifier.size(28.dp)) {
                                        Icon(Icons.Outlined.Close, contentDescription = "Close ${t.path.substringAfterLast('/')}", modifier = Modifier.size(16.dp))
                                    }
                                }
                            })
                        }
                    }
                }
                AnimatedVisibility(visible = showFind && activePath != null) {
                    FindPanel(editor, matchCount, onClose = { showFind = false; editor.searcher.stopSearch(); matchCount = -1 })
                }
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    // The editor view stays attached; an overlay covers it when no file is open.
                    AndroidView(factory = { editor }, modifier = Modifier.fillMaxSize())
                    if (activePath == null) {
                        Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                            EmptyState(Icons.Outlined.Code, "No file open", "Open a file from the file list. Every save is recorded in History and can be undone.",
                                actionLabel = "Show files", onAction = { scope.launch { drawer.open() } })
                        }
                    }
                }
                if (activePath != null) StatusBar(activePath!!, vm.languageOf(activePath!!).name, caret, tabs.firstOrNull { it.path == activePath }?.dirty == true)
            }
        }
    }

    if (showGoTo) GoToLineDialog(onDismiss = { showGoTo = false }) { line ->
        showGoTo = false
        editor.setSelection((line - 1).coerceIn(0, maxOf(0, editor.text.lineCount - 1)), 0)
        editor.ensureSelectionVisible()
    }
    if (showNewFile) NewFileDialog(
        initialDir = activePath?.substringBeforeLast('/', "")?.let { if (it.isEmpty()) "" else "$it/" } ?: "",
        onDismiss = { showNewFile = false },
        onCreate = { path -> showNewFile = false; vm.createFile(path) },
    )
    if (confirmDelete) activePath?.let { path ->
        ConfirmDialog(
            title = "Delete ${path.substringAfterLast('/')}?",
            text = "$path will be deleted. You can undo this from the project's History tab.",
            confirmLabel = "Delete file", destructive = true,
            onConfirm = { confirmDelete = false; vm.deleteFile(path) }, onDismiss = { confirmDelete = false },
        )
    }
    confirmClose?.let { path ->
        AlertDialog(
            onDismissRequest = { confirmClose = null },
            title = { Text("Save changes to ${path.substringAfterLast('/')}?") },
            text = { Text("This file has unsaved changes.") },
            confirmButton = { Button(onClick = { confirmClose = null; vm.save(path) }) { Text("Save") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { confirmClose = null; vm.close(path) }) { Text("Discard changes") }
                    TextButton(onClick = { confirmClose = null }) { Text("Cancel") }
                }
            },
        )
    }
    conflict?.let { c ->
        AlertDialog(
            onDismissRequest = { vm.conflict.value = null },
            title = { Text("${c.path.substringAfterLast('/')} changed on disk") },
            text = { Text("The file was modified after you opened it (for example by a repair, an undo or a backup restore). Saving now would overwrite those changes.") },
            confirmButton = { Button(onClick = { vm.save(c.path, overwrite = true) }) { Text("Overwrite") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { vm.conflict.value = null; vm.revert(c.path, fromDisk = true) }) { Text("Reload from disk") }
                    TextButton(onClick = { vm.conflict.value = null }) { Text("Cancel") }
                }
            },
        )
    }
    if (showReview) activePath?.let { path ->
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { showReview = false }, sheetState = sheet) {
            val change = remember(path) { vm.pendingChange(path) }
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text("Unsaved changes", style = MaterialTheme.typography.titleLarge) }
                if (change == null) item { Text("The file matches the last saved version.") }
                else {
                    item { FileDiffView(Diff.structured(change)) }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { showReview = false; vm.save(path) }) { Text("Save") }
                            OutlinedButton(onClick = { showReview = false; vm.revert(path) }) { Text("Discard changes") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBar(path: String, language: String, cursor: Pair<Int, Int>, dirty: Boolean) {
    val status = LocalStatusColors.current
    Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(path, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            Text(if (dirty) "Unsaved" else "Saved", style = MaterialTheme.typography.labelSmall, color = if (dirty) status.warning else status.success)
            Spacer(Modifier.width(8.dp))
            Text("${language.lowercase().replaceFirstChar { it.uppercase() }} · Ln ${cursor.first}, Col ${cursor.second}", style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun FindPanel(editor: CodeEditor, matchCount: Int, onClose: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var replacement by rememberSaveable { mutableStateOf("") }
    var caseSensitive by rememberSaveable { mutableStateOf(false) }
    var regex by rememberSaveable { mutableStateOf(false) }
    var wholeWord by rememberSaveable { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(query, caseSensitive, regex, wholeWord) {
        error = null
        if (query.isEmpty()) {
            editor.searcher.stopSearch()
        } else {
            val type = when {
                regex -> EditorSearcher.SearchOptions.TYPE_REGULAR_EXPRESSION
                wholeWord -> EditorSearcher.SearchOptions.TYPE_WHOLE_WORD
                else -> EditorSearcher.SearchOptions.TYPE_NORMAL
            }
            try {
                if (regex) Regex(query)
                editor.searcher.search(query, EditorSearcher.SearchOptions(type, !caseSensitive))
            } catch (e: Exception) {
                error = "Invalid pattern"
            }
        }
    }
    fun safely(block: () -> Unit) = try { block() } catch (e: Exception) { error = e.message ?: "Nothing to do" }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, singleLine = true, label = { Text("Find") },
                    supportingText = { Text(error ?: if (query.isEmpty() || matchCount < 0) " " else "$matchCount match${if (matchCount == 1) "" else "es"}") },
                    isError = error != null, modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, contentDescription = "Close find") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = caseSensitive, onClick = { caseSensitive = !caseSensitive }, label = { Text("Aa") })
                FilterChip(selected = wholeWord, onClick = { wholeWord = !wholeWord }, label = { Text("Word") })
                FilterChip(selected = regex, onClick = { regex = !regex }, label = { Text(".*") })
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { safely { editor.searcher.gotoPrevious() } }, enabled = query.isNotEmpty()) { Text("Prev") }
                TextButton(onClick = { safely { editor.searcher.gotoNext() } }, enabled = query.isNotEmpty()) { Text("Next") }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = replacement, onValueChange = { replacement = it }, singleLine = true, label = { Text("Replace with") }, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(6.dp))
                TextButton(onClick = { safely { if (!editor.searcher.isMatchedPositionSelected) editor.searcher.gotoNext(); editor.searcher.replaceCurrentMatch(replacement) } }, enabled = query.isNotEmpty()) { Text("Replace") }
                TextButton(onClick = { safely { editor.searcher.replaceAll(replacement) } }, enabled = query.isNotEmpty()) { Text("All") }
            }
            Spacer(Modifier.height(2.dp))
        }
    }
}

@Composable
private fun GoToLineDialog(onDismiss: () -> Unit, onGo: (Int) -> Unit) {
    var text by remember { mutableStateOf("") }
    val line = text.toIntOrNull()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Go to line") },
        text = { OutlinedTextField(value = text, onValueChange = { text = it.filter(Char::isDigit).take(7) }, label = { Text("Line number") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)) },
        confirmButton = { Button(onClick = { line?.let(onGo) }, enabled = line != null && line > 0) { Text("Go to line") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun NewFileDialog(initialDir: String, onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var path by remember { mutableStateOf(initialDir) }
    val valid = com.appfix.core.util.PathSafety.normalizeRelative(path.trim()) != null && !path.endsWith("/")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New file") },
        text = {
            OutlinedTextField(
                value = path, onValueChange = { path = it }, singleLine = true, label = { Text("Path in project") },
                supportingText = { Text("Folders are created as needed, e.g. app/src/main/res/values/extra.xml") },
            )
        },
        confirmButton = { Button(onClick = { onCreate(path) }, enabled = valid) { Text("Create file") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

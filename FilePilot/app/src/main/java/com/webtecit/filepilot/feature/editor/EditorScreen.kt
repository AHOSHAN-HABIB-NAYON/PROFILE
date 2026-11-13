@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.editor

import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Redo
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.LocalDarkTheme
import com.webtecit.filepilot.core.designsystem.NameDialog
import com.webtecit.filepilot.core.preferences.EditorTheme
import com.webtecit.filepilot.core.text.TextCodec
import com.webtecit.filepilot.feature.web.CodeEditorController
import com.webtecit.filepilot.feature.web.SitePreview
import kotlinx.coroutines.delay

private enum class EditorMode(val label: String) { CODE("Code"), SPLIT("Split"), PREVIEW("Preview") }

@Composable
fun EditorScreen(
    fileId: String?,
    projectRoot: String?,
    onBack: () -> Unit,
    onBrowse: () -> Unit,
    onDevicePreview: (String, String) -> Unit,
    onFindInFiles: (String) -> Unit = {},
    viewModel: EditorViewModel = hiltViewModel(),
) {
    LaunchedEffect(fileId) { if (fileId != null) viewModel.open(fileId, projectRoot) }
    val tabs by viewModel.tabs.collectAsStateWithLifecycle()
    val activeId by viewModel.active.collectAsStateWithLifecycle()
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val active = tabs.firstOrNull { it.id == activeId }
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar)

    var ready by remember { mutableStateOf(false) }
    var cursor by remember { mutableStateOf(1 to 1) }
    var changeTick by remember { mutableIntStateOf(0) }
    val dirtyOnLoad = remember { HashSet<String>() }
    val controller = remember {
        CodeEditorController(
            context,
            onReady = { ready = true },
            onChanged = { id, dirty ->
                val effective = dirty || id in dirtyOnLoad
                viewModel.session.setDirty(id, effective)
                changeTick++
            },
            onCursor = { l, c -> cursor = l to c },
        )
    }
    DisposableEffect(controller) { onDispose { controller.webView.destroy() } }

    var mode by rememberSaveable { mutableStateOf(EditorMode.CODE) }
    var findOpen by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var gotoOpen by remember { mutableStateOf(false) }
    var saveAsOpen by remember { mutableStateOf(false) }
    var encodingOpen by remember { mutableStateOf(false) }
    var closeTab by remember { mutableStateOf<EditorTab?>(null) }
    var previewReload by remember { mutableIntStateOf(0) }
    val dark = when (prefs.editorTheme) {
        EditorTheme.LIGHT -> false
        EditorTheme.DARK -> true
        EditorTheme.APP -> LocalDarkTheme.current
    }

    // Keep the editor page in step with the open tabs and settings.
    LaunchedEffect(ready, tabs) {
        if (!ready) return@LaunchedEffect
        tabs.forEach { t ->
            if (t.id !in controller.loaded) {
                if (t.dirty) dirtyOnLoad += t.id
                controller.open(t.id, t.text, t.mode)
            }
        }
        val ids = tabs.map { it.id }.toSet()
        controller.loaded.filter { it !in ids }.forEach { id ->
            controller.js("closeDoc(${controller.q(id)})")
            controller.loaded.remove(id)
        }
        activeId?.let { controller.js("switchDoc(${controller.q(it)})") }
    }
    LaunchedEffect(ready, activeId) { if (ready) activeId?.let { controller.js("switchDoc(${controller.q(it)})") } }
    LaunchedEffect(ready, prefs, dark, active?.readOnly) {
        if (!ready) return@LaunchedEffect
        val o = org.json.JSONObject()
            .put("lineNumbers", prefs.editorLineNumbers).put("wrap", prefs.editorWrap).put("tabSize", prefs.editorTabSize)
            .put("autoIndent", prefs.editorAutoIndent).put("dark", dark).put("fontSize", prefs.editorFontSize)
            .put("font", prefs.editorFont.css).put("readOnly", active?.readOnly == true)
        controller.js("setOptions($o)")
    }
    // Snapshot text into the session (and a draft on disk) shortly after typing stops.
    LaunchedEffect(changeTick) {
        if (changeTick == 0) return@LaunchedEffect
        delay(700)
        val id = activeId ?: return@LaunchedEffect
        controller.getValue(id) { text ->
            if (text != null) viewModel.snapshot(id, text, viewModel.session.tabs.value.firstOrNull { it.id == id }?.dirty == true)
        }
        if (prefs.editorAutoSave) {
            delay(2300)
            if (viewModel.session.tabs.value.firstOrNull { it.id == id }?.dirty == true) save(controller, viewModel, id, dirtyOnLoad) { previewReload++ }
        }
    }

    fun leave() {
        val id = activeId
        if (id == null || !ready) { onBack(); return }
        controller.getValue(id) { text ->
            if (text != null) viewModel.snapshot(id, text, viewModel.session.tabs.value.firstOrNull { it.id == id }?.dirty == true)
            onBack()
        }
    }
    BackHandler { if (findOpen) findOpen = false else leave() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            (active?.name ?: "Code Studio") + if (active?.dirty == true) " •" else "",
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        if (active != null) {
                            Text(
                                "Ln ${cursor.first}, Col ${cursor.second} · ${active.charset}${if (active.crlf) " · CRLF" else ""}",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = ::leave) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = {
                    if (active != null) {
                        if (active.isHtml) {
                            IconButton(onClick = {
                                save(controller, viewModel, active.id, dirtyOnLoad) { previewReload++ }
                                if (mode == EditorMode.CODE) mode = EditorMode.SPLIT
                            }) { Icon(Icons.Rounded.PlayArrow, "Run") }
                        }
                        IconButton(onClick = { findOpen = !findOpen }) { Icon(Icons.Rounded.Search, "Find and replace") }
                        IconButton(onClick = { save(controller, viewModel, active.id, dirtyOnLoad) { previewReload++ } }, enabled = active.dirty) {
                            Icon(Icons.Rounded.Save, "Save")
                        }
                        Box {
                            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Rounded.MoreVert, "More") }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                MenuItem("Undo") { menuOpen = false; controller.js("command('undo')") }
                                MenuItem("Redo") { menuOpen = false; controller.js("command('redo')") }
                                MenuItem("Select all") { menuOpen = false; controller.js("command('selectAll')") }
                                MenuItem("Go to line") { menuOpen = false; gotoOpen = true }
                                MenuItem("Save as…") { menuOpen = false; saveAsOpen = true }
                                if (active.isJson || active.isXml) MenuItem("Format document") { menuOpen = false;
                                    controller.getValue(active.id) { text ->
                                        val formatted = text?.let { viewModel.format(active, it) }
                                        if (formatted != null) controller.js("setText(${controller.q(active.id)}, ${controller.q(formatted)})")
                                    }
                                }
                                MenuItem(if (prefs.editorWrap) "Turn off word wrap" else "Word wrap") { menuOpen = false; viewModel.setWrap(!prefs.editorWrap) }
                                MenuItem("Larger text") { menuOpen = false; viewModel.setFontSize(prefs.editorFontSize + 1) }
                                MenuItem("Smaller text") { menuOpen = false; viewModel.setFontSize(prefs.editorFontSize - 1) }
                                MenuItem("Encoding (${active.charset})…") { menuOpen = false; encodingOpen = true }
                                if (active.isHtml) MenuItem("Device preview") { menuOpen = false;
                                    viewModel.previewTarget(active)?.let { (root, entry) ->
                                        save(controller, viewModel, active.id, dirtyOnLoad) {}
                                        onDevicePreview(root, entry)
                                    } ?: viewModel.message("Preview works for files on device storage.")
                                }
                                MenuItem("Close tab") { menuOpen = false; if (active.dirty) closeTab = active else viewModel.session.close(active.id) }
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            if (tabs.size > 1) {
                PrimaryScrollableTabRow(selectedTabIndex = tabs.indexOfFirst { it.id == activeId }.coerceAtLeast(0), edgePadding = 8.dp) {
                    tabs.forEach { t ->
                        Tab(
                            selected = t.id == activeId,
                            onClick = { viewModel.session.activate(t.id) },
                            text = { Text(t.name + if (t.dirty) " •" else "", maxLines = 1) },
                        )
                    }
                }
            }
            if (active?.draft != null) {
                Surface(color = MaterialTheme.colorScheme.tertiaryContainer) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Unsaved changes from your last session", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            controller.js("setText(${controller.q(active.id)}, ${controller.q(active.draft)})")
                            viewModel.session.dismissDraft(active.id)
                        }) { Text("Restore") }
                        TextButton(onClick = { viewModel.session.dismissDraft(active.id) }) { Text("Discard") }
                    }
                }
            }
            if (active?.isHtml == true) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
                    EditorMode.entries.forEachIndexed { i, m ->
                        SegmentedButton(selected = mode == m, onClick = { mode = m }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(m.label) }
                    }
                }
            }
            if (findOpen && active != null) FindBar(controller, onFindInFiles = viewModel.previewTarget(active)?.let { (root, _) -> { onFindInFiles(root) } })
            if (tabs.isEmpty()) {
                EmptyState(
                    Icons.Rounded.Code, "Code Studio",
                    "Open a code or text file from Files, or create a website in HTML Projects. Files open here in tabs.",
                    actionLabel = "Browse files", onAction = onBrowse,
                )
            }
            val showPreview = active?.isHtml == true && mode != EditorMode.CODE
            // On wide screens (landscape, tablets) code and preview sit side by side, like a desktop IDE.
            androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                val wide = maxWidth >= 700.dp
                val hideEditor = tabs.isEmpty() || (showPreview && mode == EditorMode.PREVIEW)
                val editor = @Composable { m: Modifier ->
                    // The editor stays in the layout (only resized) so its text, cursor and undo history are kept.
                    AndroidView(
                        factory = { controller.webView.apply { (parent as? ViewGroup)?.removeView(this); layoutParams = ViewGroup.LayoutParams(-1, -1) } },
                        modifier = m,
                    )
                }
                val preview = @Composable { m: Modifier ->
                    val target = active?.let { viewModel.previewTarget(it) }
                    if (target != null) SitePreview(root = target.first, entry = target.second, reloadKey = previewReload, modifier = m)
                    else Text("Preview works for files on device storage.", Modifier.padding(16.dp))
                }
                if (wide && showPreview && mode == EditorMode.SPLIT) {
                    Row(Modifier.fillMaxSize()) {
                        editor(Modifier.weight(1f).fillMaxSize())
                        androidx.compose.material3.VerticalDivider()
                        preview(Modifier.weight(1f).fillMaxSize())
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        editor(if (hideEditor) Modifier.fillMaxWidth().height(0.dp) else Modifier.fillMaxWidth().weight(1f))
                        if (showPreview) {
                            HorizontalDivider()
                            preview(Modifier.fillMaxWidth().weight(1f))
                        }
                    }
                }
            }
            if (active != null && !showPreview || (active != null && mode == EditorMode.SPLIT)) SymbolBar(controller, prefs.editorTabSize)
        }
    }

    if (gotoOpen) {
        var value by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { gotoOpen = false },
            title = { Text("Go to line") },
            text = {
                OutlinedTextField(value, { value = it.filter(Char::isDigit).take(7) }, label = { Text("Line number") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            },
            confirmButton = { TextButton(onClick = { value.toIntOrNull()?.let { controller.js("goToLine($it)") }; gotoOpen = false }) { Text("Go") } },
            dismissButton = { TextButton(onClick = { gotoOpen = false }) { Text("Cancel") } },
        )
    }
    if (saveAsOpen && active != null) {
        NameDialog(
            title = "Save as", initial = active.name, confirmLabel = "Save", validate = viewModel::validateName,
            onConfirm = { name ->
                saveAsOpen = false
                controller.getValue(active.id) { text -> if (text != null) viewModel.saveAs(active.id, text, name) }
            },
            onDismiss = { saveAsOpen = false },
        )
    }
    if (encodingOpen && active != null) {
        AlertDialog(
            onDismissRequest = { encodingOpen = false },
            title = { Text("Reopen with encoding") },
            text = {
                Column {
                    if (active.dirty) Text("Unsaved changes in this tab will be lost.", color = MaterialTheme.colorScheme.error)
                    TextCodec.supported.forEach { cs ->
                        TextButton(onClick = {
                            encodingOpen = false
                            controller.js("closeDoc(${controller.q(active.id)})")
                            controller.loaded.remove(active.id)
                            dirtyOnLoad.remove(active.id)
                            viewModel.reopen(active.id, cs)
                        }) { Text(cs + if (cs == active.charset) "  (current)" else "") }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { encodingOpen = false }) { Text("Cancel") } },
        )
    }
    closeTab?.let { tab ->
        AlertDialog(
            onDismissRequest = { closeTab = null },
            title = { Text("Save changes to \"${tab.name}\"?") },
            text = { Text("Closing the tab without saving discards your changes.") },
            confirmButton = {
                TextButton(onClick = {
                    closeTab = null
                    save(controller, viewModel, tab.id, dirtyOnLoad) { viewModel.session.close(tab.id) }
                }) { Text("Save and close") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = { closeTab = null; viewModel.session.close(tab.id) }) { Text("Discard", color = MaterialTheme.colorScheme.error) }
                    TextButton(onClick = { closeTab = null }) { Text("Cancel") }
                }
            },
        )
    }
}

private fun save(controller: CodeEditorController, viewModel: EditorViewModel, id: String, dirtyOnLoad: MutableSet<String>, then: () -> Unit) {
    controller.getValue(id) { text ->
        if (text == null) return@getValue
        viewModel.save(id, text) {
            dirtyOnLoad.remove(id)
            controller.js("markClean(${controller.q(id)})")
            then()
        }
    }
}

@Composable
private fun FindBar(controller: CodeEditorController, onFindInFiles: (() -> Unit)?) {
    var query by remember { mutableStateOf("") }
    var replace by remember { mutableStateOf("") }
    var caseSensitive by remember { mutableStateOf(false) }
    var regex by remember { mutableStateOf(false) }
    var wholeWord by remember { mutableStateOf(false) }
    var count by remember { mutableStateOf<Int?>(null) }
    var replaced by remember { mutableStateOf<Int?>(null) }
    fun opts() = "{caseSensitive:$caseSensitive,regex:$regex,wholeWord:$wholeWord}"
    fun find(back: Boolean = false) = controller.js("find(${controller.q(query)}, ${opts()}, $back)") { count = it?.toIntOrNull() }
    Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(query, { query = it; find() }, label = { Text("Find") }, singleLine = true, modifier = Modifier.weight(1f),
                    isError = count == -1, supportingText = if (count == -1) ({ Text("Invalid regular expression") }) else null)
                IconButton(onClick = { find(back = true) }) { Icon(Icons.Rounded.KeyboardArrowUp, "Previous match") }
                IconButton(onClick = { find() }) { Icon(Icons.Rounded.KeyboardArrowDown, "Next match") }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(replace, { replace = it }, label = { Text(if (regex) "Replace with ($1 = group)" else "Replace with") }, singleLine = true, modifier = Modifier.weight(1f))
                TextButton(onClick = { controller.js("replaceOne(${controller.q(query)}, ${controller.q(replace)}, ${opts()})") { count = it?.toIntOrNull() } }) { Text("Replace") }
                TextButton(onClick = { controller.js("replaceAll(${controller.q(query)}, ${controller.q(replace)}, ${opts()})") { r -> count = 0; replaced = r?.toIntOrNull() } }) { Text("All") }
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(selected = caseSensitive, onClick = { caseSensitive = !caseSensitive; find() }, label = { Text("Aa Match case") })
                Spacer(Modifier.width(6.dp))
                FilterChip(selected = wholeWord, onClick = { wholeWord = !wholeWord; find() }, label = { Text("Whole word") })
                Spacer(Modifier.width(6.dp))
                FilterChip(selected = regex, onClick = { regex = !regex; find() }, label = { Text(".* Regex") })
                Spacer(Modifier.width(6.dp))
                if (onFindInFiles != null) TextButton(onClick = onFindInFiles) { Text("Find in all files") }
                count?.takeIf { it >= 0 && query.isNotEmpty() }?.let { Text("$it matches", style = MaterialTheme.typography.bodySmall) }
                replaced?.let { Text("  · replaced $it", style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun SymbolBar(controller: CodeEditorController, tabSize: Int) {
    val symbols = listOf("⇥", "<", ">", "/", "=", "\"", "'", "{", "}", "(", ")", "[", "]", ";", ":", ".", "#", "!", "&", "|", "-", "_")
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp)) {
            TextButton(onClick = { controller.js("command('undo')") }) { Icon(Icons.AutoMirrored.Rounded.Undo, "Undo", Modifier.size(18.dp)) }
            TextButton(onClick = { controller.js("command('redo')") }) { Icon(Icons.AutoMirrored.Rounded.Redo, "Redo", Modifier.size(18.dp)) }
            symbols.forEach { s ->
                TextButton(onClick = {
                    controller.js("insertText(${controller.q(if (s == "⇥") " ".repeat(tabSize) else s)})")
                }, modifier = Modifier.background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                    Text(s, style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

@Composable
private fun MenuItem(label: String, onClick: () -> Unit) {
    DropdownMenuItem(text = { Text(label) }, onClick = onClick)
}

@Suppress("unused")
private val unusedIcons = listOf(Icons.Rounded.Close, Icons.Rounded.FolderOpen, Icons.Rounded.Devices)

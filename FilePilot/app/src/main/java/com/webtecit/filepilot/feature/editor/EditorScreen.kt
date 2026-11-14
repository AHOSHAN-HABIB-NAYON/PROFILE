@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.editor

import androidx.compose.material.icons.rounded.SaveAs
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.material.icons.rounded.FindReplace
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.SelectAll
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import kotlinx.coroutines.launch
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

    var askLeave by remember { mutableStateOf(false) }
    fun leave() {
        val id = activeId
        if (id == null || !ready) { onBack(); return }
        controller.getValue(id) { text ->
            if (text != null) viewModel.snapshot(id, text, viewModel.session.tabs.value.firstOrNull { it.id == id }?.dirty == true)
            // Unsaved files: ask before leaving. Otherwise just go.
            if (viewModel.session.tabs.value.any { it.dirty }) askLeave = true else onBack()
        }
    }
    BackHandler { if (findOpen) findOpen = false else leave() }
    if (askLeave) {
        val dirty = tabs.filter { it.dirty }
        LeaveDialog(
            names = dirty.map { it.name },
            onSave = { chosen ->
                askLeave = false
                val ids = dirty.filterIndexed { i, _ -> i in chosen }.map { it.id }
                if (ids.isEmpty()) { onBack(); return@LeaveDialog }
                var left = ids.size
                ids.forEach { tabId -> save(controller, viewModel, tabId, dirtyOnLoad) { left--; if (left == 0) onBack() } }
            },
            onKeepDraft = { askLeave = false; onBack() },
            onDismiss = { askLeave = false },
        )
    }

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
                val recent by viewModel.recentCode.collectAsStateWithLifecycle()
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    CodeStart(
                        recent = recent,
                        onCreateFile = viewModel::createFile,
                        onCreateProject = viewModel::createProject,
                        onBrowse = onBrowse,
                        onOpenRecent = { viewModel.open(it, null) },
                    )
                }
            }
            val showPreview = active?.isHtml == true && mode != EditorMode.CODE
            // On wide screens (landscape, tablets) code and preview sit side by side, like a desktop IDE.
            androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().then(if (tabs.isEmpty()) Modifier.height(0.dp) else Modifier.weight(1f))) {
                val wide = maxWidth >= 700.dp
                val hideEditor = tabs.isEmpty() || (showPreview && mode == EditorMode.PREVIEW)
                val editor = @Composable { m: Modifier ->
                    // The editor stays in the layout (only resized) so its text, cursor and undo history are kept.
                    AndroidView(
                        factory = { controller.webView.apply { (parent as? ViewGroup)?.removeView(this); layoutParams = ViewGroup.LayoutParams(-1, -1) } },
                        // A WebView squeezed to zero height can still paint over the screen on some phones,
                        // which hid the start screen; so it is made invisible whenever it isn't in use.
                        update = { it.visibility = if (hideEditor) android.view.View.INVISIBLE else android.view.View.VISIBLE },
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

/** Asked when leaving the editor with unsaved files: save the chosen ones, keep them as drafts, or stay. */
@Composable
private fun LeaveDialog(names: List<String>, onSave: (Set<Int>) -> Unit, onKeepDraft: () -> Unit, onDismiss: () -> Unit) {
    var chosen by remember { mutableStateOf(names.indices.toSet()) }
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(26.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest, modifier = Modifier.testTag("leave_dialog")) {
            Column(Modifier.padding(20.dp)) {
                Box(
                    Modifier.size(54.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFE88A12).copy(alpha = 0.15f)).align(Alignment.CenterHorizontally),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Rounded.SaveAs, null, tint = Color(0xFFE88A12), modifier = Modifier.size(30.dp)) }
                Spacer(Modifier.height(12.dp))
                Text("Save changes before leaving?", style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
                Text(
                    if (names.size == 1) "1 file has unsaved changes" else "${names.size} files have unsaved changes",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterHorizontally),
                )
                Spacer(Modifier.height(12.dp))
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Column(Modifier.padding(vertical = 4.dp)) {
                        names.forEachIndexed { i, n ->
                            Row(
                                Modifier.fillMaxWidth().clickable { chosen = if (i in chosen) chosen - i else chosen + i }.padding(horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                androidx.compose.material3.Checkbox(checked = i in chosen, onCheckedChange = null)
                                Spacer(Modifier.width(6.dp))
                                Text(n, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.padding(vertical = 12.dp))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
                androidx.compose.material3.Button(
                    onClick = { onSave(chosen) },
                    shape = RoundedCornerShape(14.dp),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Color(0xFF1A9D6B)),
                    modifier = Modifier.fillMaxWidth().height(48.dp).testTag("save_and_exit"),
                ) {
                    Icon(Icons.Rounded.Save, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (chosen.size == names.size) "Save all & exit" else "Save ${chosen.size} & exit")
                }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onKeepDraft, modifier = Modifier.weight(1f)) { Text("Leave unsaved") }
                    TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Cancel") }
                }
                Text(
                    "Unsaved changes are kept as a draft, so you can restore them when you open the file again.",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
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
    var preserveCase by remember { mutableStateOf(false) }
    var showReplace by remember { mutableStateOf(true) }
    // count = matches in the file, index = which one is selected (1-based), -1 count = bad pattern
    var count by remember { mutableStateOf(0) }
    var index by remember { mutableStateOf(0) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    fun opts() = "{caseSensitive:$caseSensitive,regex:$regex,wholeWord:$wholeWord,preserveCase:$preserveCase}"
    fun apply(result: String?) {
        val v = result?.toIntOrNull() ?: 0
        if (v < 0) { count = -1; index = 0 } else { count = v / 10000; index = v % 10000 }
    }
    fun find(back: Boolean = false) {
        if (query.isEmpty()) { count = 0; index = 0; controller.js("clearSearch()"); return }
        controller.js("find(${controller.q(query)}, ${opts()}, $back)") { apply(it) }
    }
    val bad = count == -1
    val none = query.isNotEmpty() && count == 0
    val danger = Color(0xFFE0455A)
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        border = BorderStroke(1.dp, if (bad || none) danger.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
        shadowElevation = 6.dp,
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp).testTag("find_panel"),
    ) {
        Column(Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { showReplace = !showReplace }, modifier = Modifier.size(32.dp)) {
                    Icon(if (showReplace) Icons.Rounded.KeyboardArrowDown else Icons.AutoMirrored.Rounded.KeyboardArrowRight, if (showReplace) "Hide replace" else "Show replace")
                }
                FindField(
                    value = query, onChange = { query = it; find() }, icon = Icons.Rounded.Search, error = bad || none,
                    placeholder = "Find", modifier = Modifier.weight(1f).testTag("find_field"),
                ) {
                    ToggleChip("Aa", "Match case", caseSensitive) { caseSensitive = !caseSensitive; find() }
                    ToggleChip("ab", "Whole word", wholeWord, underline = true) { wholeWord = !wholeWord; find() }
                    ToggleChip(".*", "Regular expression", regex) { regex = !regex; find() }
                }
            }
            if (showReplace) {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.width(32.dp))
                    FindField(
                        value = replace, onChange = { replace = it }, icon = Icons.Rounded.FindReplace, error = false,
                        placeholder = if (regex) "Replace ($1 = group)" else "Replace with", modifier = Modifier.weight(1f).testTag("replace_field"),
                    ) {
                        ToggleChip("AB", "Preserve case", preserveCase) { preserveCase = !preserveCase }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.padding(start = 32.dp), verticalAlignment = Alignment.CenterVertically) {
                when {
                    bad -> {
                        Icon(Icons.Rounded.ErrorOutline, null, tint = danger, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Invalid regular expression", color = danger, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                    }
                    none -> {
                        CountBadge("0", danger)
                        Spacer(Modifier.width(8.dp))
                        Text("No results", color = danger, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                    }
                    query.isEmpty() -> Text("Type to search", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    else -> {
                        CountBadge(if (index > 0) "$index / $count" else "$count", MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text(if (count == 1) "match" else "matches", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    }
                }
                IconButton(onClick = { find(back = true) }, enabled = count > 0, modifier = Modifier.size(36.dp)) { Icon(Icons.Rounded.KeyboardArrowUp, "Previous match") }
                IconButton(onClick = { find() }, enabled = count > 0, modifier = Modifier.size(36.dp)) { Icon(Icons.Rounded.KeyboardArrowDown, "Next match") }
                IconButton(
                    onClick = { controller.js("selectAllMatches(${controller.q(query)}, ${opts()})") },
                    enabled = count > 0, modifier = Modifier.size(36.dp),
                ) { Icon(Icons.Rounded.SelectAll, "Select all matches") }
            }
            if (showReplace) {
                Spacer(Modifier.height(6.dp))
                Row(Modifier.padding(start = 32.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.FilledTonalButton(
                        onClick = { controller.js("replaceOne(${controller.q(query)}, ${controller.q(replace)}, ${opts()})") { apply(it) } },
                        enabled = count > 0, shape = RoundedCornerShape(11.dp), modifier = Modifier.weight(1f).height(40.dp),
                    ) { Icon(Icons.Rounded.FindReplace, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Replace", maxLines = 1) }
                    androidx.compose.material3.Button(
                        onClick = {
                            val from = query
                            val to = replace
                            controller.js("replaceAll(${controller.q(query)}, ${controller.q(replace)}, ${opts()})") { r ->
                                val n = r?.toIntOrNull() ?: 0
                                count = 0
                                index = 0
                                if (n > 0) {
                                    com.webtecit.filepilot.core.designsystem.Feedback.show(
                                        com.webtecit.filepilot.core.designsystem.FeedbackEvent(
                                            com.webtecit.filepilot.core.designsystem.FeedbackKind.SAVED,
                                            "$n replaced",
                                            "$from → $to",
                                            undo = { scope.launch { controller.js("command('undo')") { find() } } },
                                        ),
                                    )
                                }
                            }
                        },
                        enabled = count > 0, shape = RoundedCornerShape(11.dp), modifier = Modifier.weight(1.3f).height(40.dp).testTag("replace_all"),
                    ) { Icon(Icons.Rounded.DoneAll, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(if (count > 0) "Replace all · $count" else "Replace all", maxLines = 1) }
                }
            }
            if (onFindInFiles != null) {
                TextButton(onClick = onFindInFiles, modifier = Modifier.padding(start = 24.dp)) { Text("Search all files in the project →") }
            }
        }
    }
}

@Composable
private fun FindField(
    value: String,
    onChange: (String) -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    error: Boolean,
    placeholder: String,
    modifier: Modifier,
    toggles: @Composable () -> Unit,
) {
    val danger = Color(0xFFE0455A)
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
        modifier = modifier,
        decorationBox = { inner ->
            Row(
                Modifier.height(42.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceContainerLowest)
                    .border(1.5.dp, if (error) danger else MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), RoundedCornerShape(11.dp))
                    .padding(start = 10.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(icon, null, tint = if (error) danger else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(placeholder, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f), maxLines = 1)
                    inner()
                }
                toggles()
            }
        },
    )
}

@Composable
private fun ToggleChip(text: String, description: String, on: Boolean, underline: Boolean = false, onClick: () -> Unit) {
    val primary = MaterialTheme.colorScheme.primary
    Box(
        Modifier.padding(horizontal = 1.dp).size(width = 30.dp, height = 28.dp).clip(RoundedCornerShape(7.dp))
            .background(if (on) primary.copy(alpha = 0.18f) else Color.Transparent)
            .border(1.dp, if (on) primary.copy(alpha = 0.5f) else Color.Transparent, RoundedCornerShape(7.dp))
            .clickable(onClickLabel = description, role = androidx.compose.ui.semantics.Role.Switch, onClick = onClick)
            .semantics { contentDescription = "$description ${if (on) "on" else "off"}" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelMedium.copy(
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                textDecoration = if (underline) androidx.compose.ui.text.style.TextDecoration.Underline else null,
            ),
            color = if (on) primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CountBadge(text: String, color: Color) {
    Text(
        text, color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(color).padding(horizontal = 8.dp, vertical = 2.dp).testTag("match_count"),
    )
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

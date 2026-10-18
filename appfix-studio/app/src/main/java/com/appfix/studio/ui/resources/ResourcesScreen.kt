@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.resources

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.Diff
import com.appfix.core.patch.FileChange
import com.appfix.core.project.ModuleType
import com.appfix.core.resources.ResourceEditException
import com.appfix.core.resources.ValueEntry
import com.appfix.core.resources.ValuesEditor
import com.appfix.core.xml.XmlSyntaxException
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.theme.CodeTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private data class ResFile(val path: String, val qualifier: String)

private val kinds = listOf("Strings" to ("strings.xml" to "string"), "Colours" to ("colors.xml" to "color"), "Dimensions" to ("dimens.xml" to "dimen"))

/** Edits strings, colours and dimensions of the app module. Changes are batched and reviewed as a diff. */
@Composable
fun ResourcesScreen(projectId: String, onBack: () -> Unit) {
    val container = appContainer()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val ws = container.storage.workspace(projectId)
    var tab by rememberSaveable { mutableStateOf(0) }
    var files by remember { mutableStateOf<List<ResFile>>(emptyList()) }
    var selectedFile by remember { mutableStateOf<ResFile?>(null) }
    var resRoot by remember { mutableStateOf<String?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    /** path -> (text on disk when loaded, edited text) */
    val edits = remember { mutableStateMapOf<String, Pair<String?, String>>() }
    var editing by remember { mutableStateOf<ValueEntry?>(null) }
    var adding by remember { mutableStateOf(false) }
    var review by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    val (fileName, type) = kinds[tab].second

    LaunchedEffect(tab, reload) {
        loadError = null
        val result = withContext(Dispatchers.IO) {
            val info = container.projects.refreshProjectInfo(projectId)
            val module = info.modules.firstOrNull { it.type == ModuleType.APPLICATION && it.resDir != null } ?: info.modules.firstOrNull { it.resDir != null }
            val res = module?.resDir?.let { if (info.root.isEmpty()) it else "${info.root}/$it" }
            res to res?.let { r -> ValuesEditor.valuesFiles(File(ws, r), fileName).map { (f, q) -> ResFile(f.relativeTo(ws).invariantSeparatorsPath, q) } }.orEmpty()
        }
        resRoot = result.first
        files = result.second
        selectedFile = result.second.firstOrNull { it.qualifier.isEmpty() } ?: result.second.firstOrNull()
    }

    fun currentText(path: String): String? = edits[path]?.second ?: runCatching { File(ws, path).takeIf { it.isFile }?.readText() }.getOrNull()

    fun edit(path: String, transform: (String?) -> String) {
        val disk = edits[path]?.first ?: File(ws, path).takeIf { it.isFile }?.readText()
        try {
            edits[path] = disk to transform(currentText(path))
        } catch (e: ResourceEditException) {
            scope.launch { snackbar.showSnackbar(e.message ?: "Invalid value") }
        } catch (e: XmlSyntaxException) {
            scope.launch { snackbar.showSnackbar("This file has invalid XML: ${e.message}") }
        }
    }

    val pendingCount = edits.count { it.value.first != it.value.second }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Strings & colours") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
                actions = { if (pendingCount > 0) TextButton(onClick = { review = true }) { Text("Review ($pendingCount)") } },
            )
        },
        floatingActionButton = {
            if (resRoot != null) ExtendedFloatingActionButton(onClick = { adding = true }, icon = { Icon(Icons.Outlined.Add, contentDescription = null) }, text = { Text("Add") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryTabRow(selectedTabIndex = tab) { kinds.forEachIndexed { i, k -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(k.first) }) } }
            if (resRoot == null) {
                EmptyState(Icons.Outlined.Translate, "No Android resources found", "This project has no app module with a res folder.")
                return@Column
            }
            if (files.size > 1) {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(files) { f -> FilterChip(selected = selectedFile == f, onClick = { selectedFile = f }, label = { Text(if (f.qualifier.isEmpty()) "Default" else f.qualifier) }) }
                }
            }
            loadError?.let { ErrorCard(it, Modifier.padding(16.dp)) }
            val f = selectedFile
            if (f == null) {
                EmptyState(Icons.Outlined.Translate, "No $fileName yet", "Tap Add to create values/$fileName with your first entry.")
                return@Column
            }
            val text = currentText(f.path)
            val entries = remember(text) { runCatching { text?.let(ValuesEditor::read).orEmpty() } }
            entries.exceptionOrNull()?.let { ErrorCard("Cannot read ${f.path}: ${it.message}. Fix it in the code editor.", Modifier.padding(16.dp)) }
            val list = entries.getOrNull().orEmpty().filter { it.type == type }
            LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                item { Text(f.path, style = CodeTextStyle, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp)) }
                if (list.isEmpty()) item { Text("No ${kinds[tab].first.lowercase()} in this file.", style = MaterialTheme.typography.bodyMedium) }
                items(list, key = { it.name }) { e ->
                    Row(Modifier.fillMaxWidth().clickable(enabled = !e.isComplex) { editing = e }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (type == "color") {
                            Box(Modifier.size(28.dp).background(parseColor(e.value) ?: Color.Transparent, RoundedCornerShape(6.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)))
                            Spacer(Modifier.width(12.dp))
                        }
                        Column(Modifier.weight(1f)) {
                            Text(e.name, style = MaterialTheme.typography.titleSmall)
                            Text(
                                if (e.isComplex) "Contains markup — edit in the code editor" else e.value.ifEmpty { "(empty)" },
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (!e.translatable) Text("not translatable", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }

    editing?.let { e ->
        val path = selectedFile?.path
        ValueDialog(
            title = "Edit @$type/${e.name}", type = type, initialName = e.name, nameEditable = false, initialValue = e.value,
            onDismiss = { editing = null },
            onDelete = { if (path != null) edit(path) { ValuesEditor.remove(it!!, type, e.name) }; editing = null },
            onSave = { _, value -> if (path != null) edit(path) { ValuesEditor.setValue(it!!, type, e.name, value) }; editing = null },
        )
    }
    if (adding) {
        val root = resRoot
        ValueDialog(
            title = "Add ${kinds[tab].first.lowercase().removeSuffix("s")}", type = type, initialName = "", nameEditable = true, initialValue = if (type == "color") "#FF2753E0" else "",
            onDismiss = { adding = false },
            onDelete = null,
            onSave = { name, value ->
                adding = false
                val path = selectedFile?.path ?: root?.let { "$it/values/$fileName" }
                if (path != null) {
                    edit(path) { existing -> if (existing == null) ValuesEditor.newFile(type, name, value) else ValuesEditor.add(existing, type, name, value) }
                    if (selectedFile == null) {
                        val created = ResFile(path, "")
                        files = files + created
                        selectedFile = created
                    }
                }
            },
        )
    }
    if (review) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val changes = edits.filter { it.value.first != it.value.second }.map { (path, v) -> FileChange(path, v.first, v.second) }
        ModalBottomSheet(onDismissRequest = { review = false }, sheetState = sheet) {
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text("Review resource changes", style = MaterialTheme.typography.titleLarge) }
                items(changes, key = { it.path }) { FileDiffView(Diff.structured(it)) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            scope.launch {
                                try {
                                    container.projects.applyChange(projectId, ChangeSet(title = "Edit ${kinds[tab].first.lowercase()}", source = "resource-editor", changes = changes), settings.autoBackupBeforeChanges)
                                    edits.clear()
                                    review = false
                                    reload++
                                    snackbar.showSnackbar("Saved. Undo from the project's History tab.")
                                } catch (e: Exception) {
                                    snackbar.showSnackbar("Could not save: ${e.message}")
                                }
                            }
                        }) { Text("Save changes") }
                        OutlinedButton(onClick = { edits.clear(); review = false }) { Text("Discard all") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ValueDialog(
    title: String, type: String, initialName: String, nameEditable: Boolean, initialValue: String,
    onDismiss: () -> Unit, onDelete: (() -> Unit)?, onSave: (String, String) -> Unit,
) {
    var name by remember { mutableStateOf(initialName) }
    var value by remember { mutableStateOf(initialValue) }
    var touched by remember { mutableStateOf(false) }
    val problem = ValuesEditor.validate(type, name.ifEmpty { "x" }, value)
    val nameProblem = if (nameEditable && name.isNotEmpty()) ValuesEditor.validate("string", name, "") else null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (nameEditable) {
                    OutlinedTextField(value = name, onValueChange = { name = it.trim() }, label = { Text("Name") }, singleLine = true, isError = touched && (name.isEmpty() || nameProblem != null),
                        supportingText = { Text(nameProblem ?: "Used as @$type/name") })
                }
                OutlinedTextField(
                    value = value, onValueChange = { value = it; touched = true }, label = { Text("Value") },
                    singleLine = type != "string", minLines = if (type == "string") 2 else 1,
                    isError = touched && problem != null, supportingText = { Text(if (touched && problem != null) problem else if (type == "string") "Quotes, apostrophes and new lines are escaped for you" else " ") },
                )
                if (type == "color") {
                    Box(Modifier.fillMaxWidth().size(40.dp).background(parseColor(value) ?: Color.Transparent, RoundedCornerShape(8.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)))
                }
            }
        },
        confirmButton = {
            Button(onClick = { touched = true; if (problem == null && name.isNotEmpty() && nameProblem == null) onSave(name, value) }) { Text(if (nameEditable) "Add" else "Update") }
        },
        dismissButton = {
            Row {
                if (onDelete != null) TextButton(onClick = onDelete) { Text("Delete") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

/** Parses Android colour literals (#RGB, #ARGB, #RRGGBB, #AARRGGBB). */
fun parseColor(value: String): Color? {
    val hex = value.trim().removePrefix("#")
    if (!value.trim().startsWith("#")) return null
    val full = when (hex.length) {
        3 -> "FF" + hex.map { "$it$it" }.joinToString("")
        4 -> hex.map { "$it$it" }.joinToString("")
        6 -> "FF$hex"
        8 -> hex
        else -> return null
    }
    return full.toLongOrNull(16)?.let { Color(it.toInt()) }
}

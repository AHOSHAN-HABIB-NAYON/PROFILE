@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.devtools

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.FactCheck
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.archive.ArchiveEngine
import com.webtecit.filepilot.core.archive.ArchiveEntry
import com.webtecit.filepilot.core.archive.PasswordNeededException
import com.webtecit.filepilot.core.common.ApplicationScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.FolderPickerDialog
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.userMessage
import com.webtecit.filepilot.core.tasks.BackgroundTasks
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ArchiveUi(
    val entries: List<ArchiveEntry>? = null,
    val error: String? = null,
    val encrypted: Boolean = false,
    val extracting: Boolean = false,
    val message: String? = null,
    val askPassword: Boolean = false,
    val wrongPassword: Boolean = false,
    val extractedTo: String? = null,
)

@HiltViewModel
class ArchiveViewModel @Inject constructor(
    private val tasks: BackgroundTasks,
    @ApplicationScope private val appScope: CoroutineScope,
) : ViewModel() {
    val ui = MutableStateFlow(ArchiveUi())
    private var file: File? = null
    private var password: CharArray? = null
    private var pending: Pair<File, Set<String>?>? = null

    fun load(path: String) {
        if (file != null) return
        val f = File(path)
        file = f
        viewModelScope.launch {
            val encrypted = withContext(Dispatchers.IO) { ArchiveEngine.isEncrypted(f) }
            val result = withContext(Dispatchers.IO) { runCatching { ArchiveEngine.list(f, password) } }
            ui.value = ui.value.copy(
                entries = result.getOrNull(), encrypted = encrypted,
                error = result.exceptionOrNull()?.let { if (it is PasswordNeededException) null else it.userMessage() },
            )
        }
    }

    /** Extracts in the background; it continues if the user leaves the screen. */
    fun extract(target: File, only: Set<String>?) {
        val f = file ?: return
        if (ui.value.encrypted && password == null) {
            pending = target to only
            ui.value = ui.value.copy(askPassword = true)
            return
        }
        ui.value = ui.value.copy(extracting = true, message = null)
        appScope.launch {
            val id = tasks.start("Extracting ${f.name}", "Starting…", coroutineContext[kotlinx.coroutines.Job])
            val result = runCatching {
                withContext(Dispatchers.IO) { ArchiveEngine.extract(f, target, only, password) { n, name -> tasks.update("Extracting ${f.name}", "$n files · $name", null) } }
            }
            result.onSuccess { n ->
                tasks.finish(id, "Extracted $n files to ${target.name}")
                com.webtecit.filepilot.core.designsystem.Feedback.saved("Extracted", "$n files to ${target.name}")
            }.onFailure { tasks.dismiss(id) }
            if (result.exceptionOrNull() is kotlinx.coroutines.CancellationException) {
                ui.value = ui.value.copy(extracting = false, message = "Extraction stopped. Files already written were kept.")
                return@launch
            }
            ui.value = when (val e = result.exceptionOrNull()) {
                null -> ui.value.copy(extracting = false, message = "Extracted ${result.getOrNull()} files to ${target.name}", extractedTo = target.absolutePath)
                is PasswordNeededException -> { password = null; pending = target to only; ui.value.copy(extracting = false, askPassword = true, wrongPassword = e.wrong) }
                else -> ui.value.copy(extracting = false, message = "Extraction failed: ${e.userMessage()}")
            }
        }
    }

    private var pendingTest = false

    /** Reads every file in the archive to check it isn't damaged. */
    fun test() {
        val f = file ?: return
        if (ui.value.encrypted && password == null) {
            pendingTest = true
            ui.value = ui.value.copy(askPassword = true)
            return
        }
        ui.value = ui.value.copy(extracting = true, message = "Testing…")
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { ArchiveEngine.test(f, password) } }
            ui.value = when (val e = result.exceptionOrNull()) {
                null -> ui.value.copy(extracting = false, message = "No errors found · ${result.getOrNull()} files checked")
                is PasswordNeededException -> { password = null; pendingTest = true; ui.value.copy(extracting = false, message = null, askPassword = true, wrongPassword = e.wrong) }
                else -> ui.value.copy(extracting = false, message = "The archive is damaged: ${e.userMessage()}")
            }
        }
    }

    fun submitPassword(pw: String) {
        password = pw.toCharArray()
        ui.value = ui.value.copy(askPassword = false, wrongPassword = false)
        if (pendingTest) {
            pendingTest = false
            test()
            return
        }
        pending?.let { (t, o) -> extract(t, o) }
    }

    fun cancelPassword() { ui.value = ui.value.copy(askPassword = false) }
}

/** Opens any supported archive: browse its folders, select items, extract here or anywhere. */
@Composable
fun ArchiveBrowserScreen(path: String, onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ArchiveViewModel = hiltViewModel()) {
    LaunchedEffect(path) { viewModel.load(path) }
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val file = remember { File(path) }
    var dir by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf(setOf<String>()) }
    var pickFolder by remember { mutableStateOf(false) }
    BackHandler(enabled = dir.isNotEmpty()) { dir = dir.trimEnd('/').substringBeforeLast('/', "").let { if (it.isEmpty()) "" else "$it/" } }

    // Build the listing of the current folder inside the archive (folders are implied by paths).
    val listing = remember(ui.entries, dir) {
        val all = ui.entries.orEmpty()
        val folders = LinkedHashMap<String, Long>()
        val files = ArrayList<ArchiveEntry>()
        for (e in all) {
            val p = e.path.replace('\\', '/')
            if (!p.startsWith(dir) || p == dir) continue
            val rest = p.removePrefix(dir)
            val slash = rest.indexOf('/')
            if (slash >= 0 && slash < rest.length - 1 || (slash == rest.length - 1)) {
                val name = rest.substring(0, if (slash >= 0) slash else rest.length)
                folders[name] = (folders[name] ?: 0) + maxOf(e.size, 0)
            } else if (!e.isDirectory) files += e
        }
        folders.map { (n, s) -> ArchiveEntry(dir + n + "/", s, s, true, 0) } + files.sortedBy { it.path.lowercase() }
    }
    val defaultTarget = remember { File(file.parentFile, file.name.substringBefore('.').ifBlank { "extracted" }) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(file.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "/" + dir + (ui.entries?.let { " · ${it.count { e -> !e.isDirectory }} files" } ?: ""),
                            style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { if (dir.isEmpty()) onBack() else dir = dir.trimEnd('/').substringBeforeLast('/', "").let { if (it.isEmpty()) "" else "$it/" } }) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back")
                    }
                },
                actions = {
                    if (ui.encrypted) Icon(Icons.Rounded.Lock, "Password protected", Modifier.padding(end = 8.dp))
                    IconButton(onClick = viewModel::test, enabled = ui.entries != null && !ui.extracting) {
                        Icon(Icons.Rounded.FactCheck, "Test archive")
                    }
                },
            )
        },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp)) {
                    if (ui.extracting) LinearProgressIndicator(Modifier.fillMaxWidth().padding(bottom = 8.dp))
                    ui.message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 8.dp)) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = ui.entries != null && !ui.extracting, onClick = {
                            viewModel.extract(uniqueFolder(defaultTarget), selected.ifEmpty { null })
                        }) { Text(if (selected.isEmpty()) "Extract here" else "Extract ${selected.size} here") }
                        FilledTonalButton(enabled = ui.entries != null && !ui.extracting, onClick = { pickFolder = true }) { Text("Extract to…") }
                        if (ui.extractedTo != null) TextButton(onClick = { onOpenFolder(ui.extractedTo!!) }) { Text("Open") }
                    }
                }
            }
        },
    ) { padding ->
        when {
            ui.error != null -> Text(ui.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(padding).padding(16.dp))
            ui.entries == null -> LinearProgressIndicator(Modifier.padding(padding).fillMaxWidth())
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(vertical = 4.dp)) {
                items(listing, key = { it.path }) { e ->
                    val name = e.path.trimEnd('/').substringAfterLast('/')
                    val item = FileItem(e.path, name, e.isDirectory, e.size, e.time, if (e.isDirectory) FileTypes.DIRECTORY_MIME else FileTypes.mimeOf(name))
                    Row(
                        Modifier.fillMaxWidth().clickable { if (e.isDirectory) dir = e.path else selected = if (e.path in selected) selected - e.path else selected + e.path }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (e.isDirectory) Icon(Icons.Rounded.Folder, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(10.dp))
                        else FileThumbPlaceholder(item)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge)
                            if (e.size >= 0) Text(Formatters.size(e.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Checkbox(checked = e.path in selected, onCheckedChange = { selected = if (it) selected + e.path else selected - e.path })
                    }
                }
            }
        }
    }
    if (pickFolder) {
        FolderPickerDialog("Extract to", "Extract here", start = file.parent, onPick = { d ->
            pickFolder = false
            viewModel.extract(File(d), selected.ifEmpty { null })
        }, onDismiss = { pickFolder = false })
    }
    if (ui.askPassword) {
        var pw by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = viewModel::cancelPassword,
            title = { Text("Enter password") },
            text = {
                OutlinedTextField(pw, { pw = it }, label = { Text("Archive password") }, singleLine = true,
                    isError = ui.wrongPassword, supportingText = { if (ui.wrongPassword) Text("That password didn't work. Try again.") },
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            },
            confirmButton = { TextButton(onClick = { viewModel.submitPassword(pw) }, enabled = pw.isNotEmpty()) { Text("Extract") } },
            dismissButton = { TextButton(onClick = viewModel::cancelPassword) { Text("Cancel") } },
        )
    }
}

@Composable
private fun FileThumbPlaceholder(item: FileItem) {
    // Items inside an archive have no file on disk yet, so show the type icon only.
    val style = com.webtecit.filepilot.core.designsystem.kindStyle(item.kind)
    com.webtecit.filepilot.core.designsystem.IconTile(style.icon, style.tint)
}

private fun uniqueFolder(base: File): File {
    var t = base
    var n = 1
    while (t.exists()) t = File(base.parentFile, "${base.name} (${n++})")
    return t
}


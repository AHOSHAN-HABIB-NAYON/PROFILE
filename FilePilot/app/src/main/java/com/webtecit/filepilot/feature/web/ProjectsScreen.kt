@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.web

import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.archive.ZipTools
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.storage.NameRules
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class WebProject(val name: String, val path: String, val files: Int, val bytes: Long, val modified: Long, val entry: String?)

enum class ProjectTemplate(val label: String) { STARTER("Starter (HTML, CSS, JS)"), BLANK("Blank page") }

@HiltViewModel
class ProjectsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel() {
    val projects = MutableStateFlow<List<WebProject>>(emptyList())
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    val home: File get() = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "FilePilot Projects")

    fun refresh() {
        viewModelScope.launch {
            projects.value = withContext(io) {
                home.mkdirs()
                home.listFiles().orEmpty().filter { it.isDirectory }.map { dir ->
                    val all = dir.walkTopDown().filter { it.isFile }.toList()
                    WebProject(dir.name, dir.absolutePath, all.size, all.sumOf { it.length() }, dir.lastModified(), entryOf(dir))
                }.sortedByDescending { it.modified }
            }
        }
    }

    fun validate(name: String): String? =
        NameRules.validate(name) ?: if (File(home, name).exists()) "A project with this name already exists." else null

    fun create(name: String, template: ProjectTemplate, then: (WebProject) -> Unit) {
        viewModelScope.launch {
            try {
                val dir = File(home, name)
                withContext(io) {
                    dir.mkdirs()
                    when (template) {
                        ProjectTemplate.BLANK -> File(dir, "index.html").writeText(blankHtml(name))
                        ProjectTemplate.STARTER -> {
                            File(dir, "css").mkdirs(); File(dir, "js").mkdirs(); File(dir, "images").mkdirs()
                            File(dir, "index.html").writeText(starterHtml(name))
                            File(dir, "css/style.css").writeText(starterCss)
                            File(dir, "js/app.js").writeText(starterJs)
                        }
                    }
                }
                refresh()
                then(WebProject(name, dir.absolutePath, 0, 0, dir.lastModified(), "index.html"))
            } catch (e: Exception) {
                _events.send(UiEvent.Message(e.userMessage()))
            }
        }
    }

    fun import(uri: Uri) {
        viewModelScope.launch {
            try {
                val base = queryName(uri)?.substringBeforeLast('.')?.ifBlank { null } ?: "Imported site"
                var name = base
                var n = 1
                while (File(home, name).exists()) name = "$base (${n++})"
                val dir = File(home, name)
                val count = withContext(io) {
                    context.contentResolver.openInputStream(uri)?.use { ZipTools.extract(it, dir) } ?: 0
                }
                // A ZIP that wraps everything in one folder: use that folder's content.
                withContext(io) {
                    val children = dir.listFiles().orEmpty()
                    if (children.size == 1 && children[0].isDirectory && entryOf(dir) == null) {
                        val inner = children[0]
                        inner.listFiles().orEmpty().forEach { it.renameTo(File(dir, it.name)) }
                        inner.delete()
                    }
                }
                refresh()
                _events.send(UiEvent.Message("Imported \"$name\" ($count files)."))
            } catch (e: Exception) {
                _events.send(UiEvent.Message("Import failed: ${e.userMessage()}"))
            }
        }
    }

    fun export(project: WebProject) {
        viewModelScope.launch {
            try {
                val out = withContext(io) {
                    val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "FilePilot").apply { mkdirs() }
                    var file = File(dir, "${project.name}.zip")
                    var n = 1
                    while (file.exists()) file = File(dir, "${project.name} (${n++}).zip")
                    file.outputStream().use { stream -> ZipTools.zip(File(project.path).listFiles().orEmpty().toList(), stream) }
                    file
                }
                _events.send(UiEvent.Message("Exported to Download/FilePilot/${out.name}"))
            } catch (e: Exception) {
                _events.send(UiEvent.Message("Export failed: ${e.userMessage()}"))
            }
        }
    }

    private fun queryName(uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull()

    companion object {
        fun entryOf(dir: File): String? = when {
            File(dir, "index.html").isFile -> "index.html"
            File(dir, "index.htm").isFile -> "index.htm"
            else -> dir.listFiles().orEmpty().firstOrNull { it.isFile && it.extension.lowercase() in setOf("html", "htm") }?.name
        }

        fun blankHtml(title: String) = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$title</title>
</head>
<body>
  <h1>$title</h1>
</body>
</html>
"""

        fun starterHtml(title: String) = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$title</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main class="card">
    <h1>$title</h1>
    <p>Edit <code>index.html</code>, <code>css/style.css</code> and <code>js/app.js</code>, then tap Run.</p>
    <button id="hello">Say hello</button>
    <p id="output"></p>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
"""

        const val starterCss = """:root { --primary: #2952E3; --accent: #14B8A6; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #F5F7FB; color: #111827; }
.card { width: min(92vw, 560px); padding: 32px; border-radius: 20px; background: #fff; box-shadow: 0 10px 30px rgba(17, 24, 39, .08); }
h1 { margin-top: 0; color: var(--primary); }
button { padding: 12px 20px; border: 0; border-radius: 12px; background: var(--primary); color: #fff; font-size: 16px; }
@media (min-width: 1024px) { .card { padding: 48px; } }
"""

        val starterJs = """const output = document.querySelector('#output');
let count = Number(localStorage.getItem('count') || 0);
document.querySelector('#hello').addEventListener('click', () => {
  count += 1;
  localStorage.setItem('count', String(count));
  output.textContent = `Hello! You clicked ${'$'}{count} time${'$'}{count === 1 ? '' : 's'}.`;
  console.log('Clicked', count);
});
"""
    }
}

@Composable
fun ProjectsScreen(
    onBack: () -> Unit,
    onRun: (String, String) -> Unit,
    onEdit: (String, String) -> Unit,
    onBrowse: (String) -> Unit,
    viewModel: ProjectsViewModel = hiltViewModel(),
) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar)
    LaunchedEffect(Unit) { viewModel.refresh() }
    var createOpen by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) viewModel.import(uri) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("HTML Projects") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { IconButton(onClick = { picker.launch(arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream")) }) { Icon(Icons.Rounded.Unarchive, "Import ZIP") } },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { createOpen = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("New project") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    "Projects are stored in Documents/FilePilot Projects and run offline inside the app.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (projects.isEmpty()) item {
                EmptyState(Icons.Rounded.Language, "No projects yet", "Create a website from a template or import a ZIP of an existing site.",
                    actionLabel = "New project", onAction = { createOpen = true })
            }
            items(projects, key = { it.path }) { p ->
                AppCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconTile(Icons.Rounded.Language, MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = MaterialTheme.typography.titleMedium)
                            Text("${Formatters.count(p.files, "file")} · ${Formatters.size(p.bytes)} · ${Formatters.shortDate(p.modified)}",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Spacer(Modifier.padding(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { p.entry?.let { onRun(p.path, it) } }, enabled = p.entry != null) { Text("Run") }
                        FilledTonalButton(onClick = { p.entry?.let { onEdit(p.path + "/" + it, p.path) } }, enabled = p.entry != null) { Text("Edit") }
                        OutlinedButton(onClick = { onBrowse(p.path) }) { Text("Files") }
                        TextButton(onClick = { viewModel.export(p) }) { Text("ZIP") }
                    }
                }
            }
        }
    }

    if (createOpen) {
        var name by remember { mutableStateOf("") }
        var template by remember { mutableStateOf(ProjectTemplate.STARTER) }
        val error = if (name.isEmpty()) null else viewModel.validate(name.trim())
        AlertDialog(
            onDismissRequest = { createOpen = false },
            title = { Text("New website project") },
            text = {
                Column {
                    OutlinedTextField(name, { name = it }, label = { Text("Project name") }, singleLine = true, isError = error != null,
                        supportingText = { error?.let { Text(it) } })
                    ProjectTemplate.entries.forEach { t ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = template == t, onClick = { template = t })
                            Text(t.label)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = name.isNotBlank() && error == null, onClick = {
                    createOpen = false
                    viewModel.create(name.trim(), template) { p -> onEdit(p.path + "/index.html", p.path) }
                }) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { createOpen = false }) { Text("Cancel") } },
        )
    }
}

@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.Diff
import com.appfix.core.search.ProjectSearch
import com.appfix.core.search.SearchQuery
import com.appfix.core.search.SearchResult
import com.appfix.core.util.CancelToken
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.theme.CodeTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

private enum class FileFilter(val label: String, val extensions: Set<String>) {
    ALL("All files", emptySet()),
    CODE("Kotlin/Java", setOf("kt", "kts", "java")),
    XML("XML", setOf("xml")),
    GRADLE("Gradle", setOf("gradle", "kts", "toml", "properties")),
    WEB("Web", setOf("js", "ts", "tsx", "jsx", "html", "css", "json")),
}

@Composable
fun ProjectSearchScreen(projectId: String, onBack: () -> Unit, onOpenInEditor: (String, Int) -> Unit) {
    val container = appContainer()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var query by rememberSaveable { mutableStateOf("") }
    var replacement by rememberSaveable { mutableStateOf("") }
    var regex by rememberSaveable { mutableStateOf(false) }
    var caseSensitive by rememberSaveable { mutableStateOf(false) }
    var wholeWord by rememberSaveable { mutableStateOf(false) }
    var filter by rememberSaveable { mutableStateOf(FileFilter.ALL) }
    var result by remember { mutableStateOf<SearchResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<ChangeSet?>(null) }
    var job by remember { mutableStateOf<Job?>(null) }
    val cancel = remember { AtomicBoolean(false) }
    val ws = container.storage.workspace(projectId)

    fun q() = SearchQuery(query, regex = regex, caseSensitive = caseSensitive, wholeWord = wholeWord, extensions = filter.extensions)

    fun runSearch() {
        if (query.isEmpty()) return
        cancel.set(true)
        job?.cancel()
        cancel.set(false)
        error = null
        searching = true
        job = scope.launch {
            try {
                result = withContext(Dispatchers.IO) { ProjectSearch.search(ws, q(), CancelToken { cancel.get() }) }
            } catch (e: java.util.regex.PatternSyntaxException) {
                error = "Invalid regular expression: ${e.description}"
            } catch (e: com.appfix.core.util.OperationCancelledException) {
                // a newer search replaced this one
            } catch (e: Exception) {
                error = e.message
            } finally {
                searching = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Search in project") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding).imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, singleLine = true, label = { Text("Search for") },
                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { runSearch() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = caseSensitive, onClick = { caseSensitive = !caseSensitive }, label = { Text("Match case") })
                    FilterChip(selected = wholeWord, onClick = { wholeWord = !wholeWord }, label = { Text("Word") })
                    FilterChip(selected = regex, onClick = { regex = !regex }, label = { Text("Regex") })
                }
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(FileFilter.entries) { f -> FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) }) }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { runSearch() }, enabled = query.isNotEmpty() && !searching) { Text("Search") }
                }
            }
            item {
                OutlinedTextField(
                    value = replacement, onValueChange = { replacement = it }, singleLine = true, label = { Text("Replace with (optional)") },
                    supportingText = { Text(if (regex) "Use \$1, \$2 for captured groups" else "Every match in the filtered files is replaced") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            try {
                                val set = withContext(Dispatchers.IO) { ProjectSearch.replaceAll(ws, q(), replacement) }
                                if (set.changes.isEmpty()) snackbar.showSnackbar("Nothing to replace") else pending = set
                            } catch (e: Exception) {
                                error = e.message
                            }
                        }
                    },
                    enabled = query.isNotEmpty(),
                ) { Text("Preview replace all") }
            }
            if (searching) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            error?.let { item { ErrorCard(it) } }
            val r = result
            if (r != null) {
                item {
                    Text(
                        "${r.matches.size}${if (r.truncated) "+" else ""} matches in ${r.matches.map { it.path }.distinct().size} files (${r.filesSearched} searched)",
                        style = MaterialTheme.typography.titleSmall,
                    )
                }
                if (r.matches.isEmpty()) item { EmptyState(Icons.Outlined.Search, "No matches", "Try a different search or file filter.") }
                val grouped = r.matches.groupBy { it.path }
                grouped.forEach { (path, matches) ->
                    item(key = "h-$path") {
                        Text(path, style = CodeTextStyle, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp))
                    }
                    items(matches, key = { "${it.path}:${it.line}:${it.column}" }) { m ->
                        val highlight = MaterialTheme.colorScheme.tertiaryContainer
                        Row(Modifier.fillMaxWidth().clickable { onOpenInEditor(m.path, m.line) }.padding(vertical = 6.dp)) {
                            Text("${m.line}".padStart(5), style = CodeTextStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(8.dp))
                            Text(highlighted(m.preview, query, regex, caseSensitive, highlight), style = CodeTextStyle, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }

    pending?.let { set ->
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { pending = null }, sheetState = sheet) {
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Text(set.title, style = MaterialTheme.typography.titleLarge)
                    Text("${set.changes.size} file(s) will change. Review before applying; you can undo from History.", style = MaterialTheme.typography.bodySmall)
                }
                items(set.changes, key = { it.path }) { FileDiffView(Diff.structured(it)) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            scope.launch {
                                try {
                                    container.projects.applyChange(projectId, set, settings.autoBackupBeforeChanges)
                                    pending = null
                                    snackbar.showSnackbar("Replaced in ${set.changes.size} file(s)")
                                    runSearch()
                                } catch (e: Exception) {
                                    pending = null
                                    snackbar.showSnackbar("Could not apply: ${e.message}")
                                }
                            }
                        }) { Text("Apply replacements") }
                        OutlinedButton(onClick = { pending = null }) { Text("Discard") }
                    }
                }
            }
        }
    }
}

private fun highlighted(text: String, query: String, regex: Boolean, caseSensitive: Boolean, color: Color) = buildAnnotatedString {
    val pattern = runCatching { Regex(if (regex) query else Regex.escape(query), if (caseSensitive) emptySet() else setOf(RegexOption.IGNORE_CASE)) }.getOrNull()
    var last = 0
    pattern?.findAll(text)?.forEach { m ->
        if (m.range.first < last || m.value.isEmpty()) return@forEach
        append(text.substring(last, m.range.first))
        withStyle(SpanStyle(background = color)) { append(m.value) }
        last = m.range.last + 1
    }
    append(text.substring(last))
}


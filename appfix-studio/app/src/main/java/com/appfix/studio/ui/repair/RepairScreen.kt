@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.repair

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Healing
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.analysis.AnalysisReport
import com.appfix.core.analysis.BuildOutcome
import com.appfix.core.analysis.CrashReport
import com.appfix.core.analysis.Finding
import com.appfix.core.analysis.Severity
import com.appfix.core.patch.Diff
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.ui.appViewModel
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.CodeBlock
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.components.FindingCard
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.components.StatusPill
import com.appfix.studio.ui.theme.CodeTextStyle
import com.appfix.studio.ui.theme.LocalStatusColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class SeverityFilter(val label: String) { ALL("All"), ERRORS("Errors"), WARNINGS("Warnings"), INFO("Info"), FIXABLE("Auto-fixable") }

@Composable
fun RepairScreen(onOpenProjects: () -> Unit, onOpenFile: (String, String, Int?) -> Unit) {
    val vm = appViewModel { RepairViewModel(it) }
    val projects by vm.projects.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val working by vm.working.collectAsStateWithLifecycle()
    val preview by vm.preview.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var tab by rememberSaveable { mutableStateOf(0) }

    LaunchedEffect(selected?.id) { vm.onProjectShown(selected?.id) }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Repair center") }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (projects.isEmpty()) {
                EmptyState(Icons.Outlined.Inventory2, "Nothing to repair yet", "Import a source project to analyse it, or paste a crash log below after importing.", actionLabel = "Go to projects", onAction = onOpenProjects)
                return@Column
            }
            ProjectPicker(projects.map { it.id to it.name }, selected?.id, selected?.name, onSelect = vm::select)
            if (working) LinearProgressIndicator(Modifier.fillMaxWidth())
            PrimaryTabRow(selectedTabIndex = tab) {
                listOf("Analysis", "Crash log", "Build log").forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
            }
            val p = selected
            when (tab) {
                0 -> if (p == null) {
                    EmptyState(Icons.Outlined.Healing, "Choose a project", "Pick a project above to analyse it.")
                } else if (p.kind == ProjectKind.APK) {
                    EmptyState(Icons.Outlined.Healing, "Static analysis needs source code", "APK files are compiled, so build-configuration rules do not apply. Open the APK report for signing, SDK and editability details, or analyse a crash log from this app in the Crash log tab.")
                } else {
                    AnalysisTab(vm, onOpenFile = { path, line -> onOpenFile(p.id, path, line) })
                }
                1 -> CrashTab(vm, onOpenFile = { path, line -> p?.let { onOpenFile(it.id, path, line) } })
                2 -> BuildLogTab(vm, onOpenFile = { path, line -> p?.let { onOpenFile(it.id, path, line) } })
            }
        }
    }

    preview?.let { pv ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = vm::discardPreview, sheetState = sheetState) {
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Text(pv.change.title, style = MaterialTheme.typography.titleLarge)
                    Text(pv.finding.title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item {
                    Text("Review the changes below. Nothing is written until you apply them. Applied fixes can be undone from History.", style = MaterialTheme.typography.bodySmall)
                }
                if (pv.problems.isNotEmpty()) item { ErrorCard(pv.problems.joinToString("\n")) }
                items(pv.change.changes, key = { it.path }) { c -> FileDiffView(Diff.structured(c)) }
                if (pv.change.followUps.isNotEmpty()) item { BulletList(pv.change.followUps) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = vm::applyPreview, enabled = pv.problems.isEmpty() && !working) { Text("Apply changes") }
                        OutlinedButton(onClick = vm::discardPreview) { Text("Discard") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectPicker(options: List<Pair<String, String>>, selectedId: String?, selectedName: String?, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text(selectedName ?: "Choose a project", modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (id, name) ->
                DropdownMenuItem(text = { Text(name + if (id == selectedId) "  ✓" else "") }, onClick = { open = false; onSelect(id) })
            }
        }
    }
}

@Composable
private fun AnalysisTab(vm: RepairViewModel, onOpenFile: (String, Int?) -> Unit) {
    val report by vm.analysis.collectAsStateWithLifecycle()
    val analyzing by vm.analyzing.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf(SeverityFilter.ALL) }
    val r = report
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (r == null) "Not analysed yet" else summary(r), style = MaterialTheme.typography.titleMedium)
                    if (r != null) Text("${r.analyzedFiles} files checked in ${r.durationMs} ms", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (analyzing) OutlinedButton(onClick = vm::cancelAnalysis) { Text("Cancel") } else Button(onClick = vm::analyze) { Text(if (r == null) "Analyze" else "Re-run") }
            }
            if (analyzing) { Spacer(Modifier.height(8.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }
        }
        if (r != null) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(SeverityFilter.entries) { f -> FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) }) }
                }
            }
            val visible = r.findings.filter {
                when (filter) {
                    SeverityFilter.ALL -> true
                    SeverityFilter.ERRORS -> it.severity == Severity.ERROR
                    SeverityFilter.WARNINGS -> it.severity == Severity.WARNING
                    SeverityFilter.INFO -> it.severity == Severity.INFO
                    SeverityFilter.FIXABLE -> it.hasFix
                }
            }
            if (r.findings.isEmpty()) {
                item { NoProblems() }
            } else if (visible.isEmpty()) {
                item { Text("No findings match this filter.", style = MaterialTheme.typography.bodyMedium) }
            }
            items(visible, key = { it.key }) { f -> FindingCard(f, onPreviewFix = { vm.previewFix(f) }, onOpenFile = onOpenFile) }
            item {
                SectionCard("Limitations") { BulletList(r.limitations) }
            }
        }
    }
}

private fun summary(r: AnalysisReport): String = when {
    r.findings.isEmpty() -> "No problems found"
    else -> listOfNotNull(
        r.errorCount.takeIf { it > 0 }?.let { "$it error${if (it == 1) "" else "s"}" },
        r.warningCount.takeIf { it > 0 }?.let { "$it warning${if (it == 1) "" else "s"}" },
        (r.findings.size - r.errorCount - r.warningCount).takeIf { it > 0 }?.let { "$it note${if (it == 1) "" else "s"}" },
    ).joinToString(" · ")
}

@Composable
private fun NoProblems() {
    val s = LocalStatusColors.current
    SectionCard("No problems detected", icon = Icons.Outlined.CheckCircle) {
        Text("The static checks found nothing. This does not prove the app builds or runs correctly — build it and test it to be sure.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(8.dp))
        StatusPill("Static checks passed", s.successContainer, s.success)
    }
}

private suspend fun readText(context: Context, uri: Uri): String = withContext(Dispatchers.IO) {
    context.contentResolver.openInputStream(uri)?.use { input ->
        val bytes = input.readNBytesCompat(RepairViewModel.MAX_LOG)
        bytes.decodeToString()
    } ?: ""
}

private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buf = ByteArray(16 * 1024)
    while (out.size() < limit) {
        val n = read(buf, 0, minOf(buf.size, limit - out.size()))
        if (n < 0) break
        out.write(buf, 0, n)
    }
    return out.toByteArray()
}

@Composable
private fun LogInput(label: String, hint: String, onAnalyze: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by rememberSaveable { mutableStateOf("") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch { text = readText(context, uri).take(100_000) }
    }
    Column(Modifier.imePadding()) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            label = { Text(label) },
            placeholder = { Text(hint) },
            textStyle = CodeTextStyle,
            modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp, max = 260.dp),
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onAnalyze(text) }, enabled = text.isNotBlank()) { Text("Analyze") }
            OutlinedButton(onClick = { picker.launch(arrayOf("text/*", "application/octet-stream")) }) {
                Icon(Icons.Outlined.UploadFile, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Open file")
            }
            if (text.isNotEmpty()) TextButton(onClick = { text = "" }) { Text("Clear") }
        }
    }
}

@Composable
private fun CrashTab(vm: RepairViewModel, onOpenFile: (String, Int?) -> Unit) {
    val report by vm.crash.collectAsStateWithLifecycle()
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Paste logcat output (from \"FATAL EXCEPTION\") or a crash report. Stack frames are matched to files in the selected project.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            LogInput("Crash log", "FATAL EXCEPTION: main …", vm::analyzeCrash)
        }
        report?.let { r -> crashResult(r, vm, onOpenFile) }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.crashResult(r: CrashReport, vm: RepairViewModel, onOpenFile: (String, Int?) -> Unit) {
    item {
        SectionCard(r.summary, icon = Icons.Outlined.BugReport, subtitle = r.processName?.let { "Process $it" }) {
            Text("Likely explanation", style = MaterialTheme.typography.labelLarge)
            Text(r.explanation, style = MaterialTheme.typography.bodyMedium)
            if (r.suggestions.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("What to try", style = MaterialTheme.typography.labelLarge)
                BulletList(r.suggestions)
            }
            r.appFrameSource?.let { src ->
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { onOpenFile(src.path, src.line) }) { Text("Open ${src.path.substringAfterLast('/')}${src.line?.let { ":$it" } ?: ""}") }
            }
            Spacer(Modifier.height(6.dp))
            Text("The explanation is based on the exception type and message; confirm it by reproducing the crash after a fix.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    val fixable = r.findings.filter { it.hasFix }
    items(fixable, key = { "crash-" + it.key }) { f -> FindingCard(f, onPreviewFix = { vm.previewFix(f) }, onOpenFile = onOpenFile) }
    if (r.chain.isNotEmpty()) {
        item {
            SectionCard("Exception chain", subtitle = "${r.chain.size} exception(s)") {
                r.chain.forEachIndexed { i, e ->
                    if (i > 0) Text("Caused by", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                    Text(e.type, style = CodeTextStyle)
                    e.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    CodeBlock(e.frames.take(12).joinToString("\n") { "at " + it.display } + if (e.frames.size > 12) "\n… ${e.frames.size - 12} more" else "")
                }
            }
        }
    }
}

@Composable
private fun BuildLogTab(vm: RepairViewModel, onOpenFile: (String, Int?) -> Unit) {
    val report by vm.buildLog.collectAsStateWithLifecycle()
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Paste Gradle output from Android Studio, CI or a build server. Errors are mapped to files in the selected project.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            LogInput("Build log", "FAILURE: Build failed with an exception …", vm::analyzeBuildLog)
        }
        report?.let { r ->
            item {
                val s = LocalStatusColors.current
                Row(verticalAlignment = Alignment.CenterVertically) {
                    when (r.outcome) {
                        BuildOutcome.SUCCESS -> StatusPill("Build succeeded", s.successContainer, s.success)
                        BuildOutcome.FAILURE -> StatusPill("Build failed", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                        BuildOutcome.UNKNOWN -> StatusPill("Outcome unknown", MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    r.failedTask?.let { Spacer(Modifier.width(8.dp)); Text(it, style = CodeTextStyle) }
                }
            }
            if (r.findings.isEmpty()) item { Text("No errors recognised in this log.", style = MaterialTheme.typography.bodyMedium) }
            items(r.findings, key = { "build-" + it.key }) { f: Finding -> FindingCard(f, onPreviewFix = { vm.previewFix(f) }, onOpenFile = onOpenFile) }
        }
    }
}

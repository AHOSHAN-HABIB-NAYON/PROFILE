@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.appfix.studio.ui.assistant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.appfix.core.ai.AiConfig
import com.appfix.core.ai.AiPrompt
import com.appfix.core.ai.AiProviderKind
import com.appfix.core.patch.Diff
import com.appfix.studio.ui.appViewModel
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.CodeBlock
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.theme.CodeTextStyle

@Composable
fun AssistantScreen(projectId: String, onBack: () -> Unit, onOpenBuild: () -> Unit) {
    val vm = appViewModel(key = "assistant-$projectId") { AssistantViewModel(it, projectId) }
    val config by vm.config.collectAsState()
    val hasKey by vm.hasKey.collectAsState()
    val files by vm.files.collectAsState()
    val selected by vm.selected.collectAsState()
    val findings by vm.findings.collectAsState()
    val includeFindings by vm.includeFindings.collectAsState()
    val log by vm.log.collectAsState()
    val turns by vm.turns.collectAsState()
    val preview by vm.preview.collectAsState()
    val sending by vm.sending.collectAsState()
    val patch by vm.patch.collectAsState()
    val validation by vm.validation.collectAsState()
    val message by vm.message.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var question by remember { mutableStateOf("") }
    var showSettings by remember { mutableStateOf(false) }
    var pickFiles by remember { mutableStateOf(false) }
    val configProblem = config.problem(hasKey)

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI assistant") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
                actions = {
                    if (turns.isNotEmpty()) IconButton(onClick = vm::clearChat) { Icon(Icons.Outlined.Delete, contentDescription = "Clear conversation") }
                    IconButton(onClick = { showSettings = true }) { Icon(Icons.Outlined.Settings, contentDescription = "AI provider settings") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding).imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (configProblem != null) {
                item { ErrorCard("AI is not set up: $configProblem", actionLabel = "Set up", onAction = { showSettings = true }) }
            }
            item {
                SectionCard("Context to share", subtitle = "Only what you pick here is sent, and you review it first") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        selected.forEach { p -> InputChip(selected = true, onClick = { vm.toggleFile(p) }, label = { Text(p.substringAfterLast('/')) }, trailingIcon = { Text("×") }) }
                        TextButton(onClick = { pickFiles = true }) { Text(if (selected.isEmpty()) "Choose files" else "Add files") }
                    }
                    if (findings.isNotEmpty()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = includeFindings, onCheckedChange = { vm.includeFindings.value = it })
                            Text("Include ${findings.size} analysis findings", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    OutlinedTextField(
                        value = log, onValueChange = { vm.log.value = it.take(200_000) }, label = { Text("Crash or build log (optional)") },
                        modifier = Modifier.fillMaxWidth().heightIn(max = 160.dp), textStyle = CodeTextStyle,
                    )
                }
            }
            itemsIndexed(turns) { i, t -> TurnCard(t, isLatest = i == turns.lastIndex) }
            patch?.let { p ->
                item {
                    if (p.change == null) {
                        SectionCard("Patch cannot be applied") {
                            Text("The answer contains a patch, but it does not match your files or breaks a safety rule. Nothing was changed.", style = MaterialTheme.typography.bodyMedium)
                            BulletList(p.problems.take(10))
                            TextButton(onClick = vm::rejectPatch) { Text("Dismiss") }
                        }
                    } else {
                        SectionCard("Review the proposed patch", subtitle = "${p.change.changes.size} file(s) · not applied yet") {
                            Text("Check every line. The patch is not verified until the project builds.", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                p.change?.let { set ->
                    items(set.changes, key = { "patch-" + it.path }) { FileDiffView(Diff.structured(it)) }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = vm::applyPatch, enabled = !sending) { Text("Apply patch") }
                            OutlinedButton(onClick = vm::rejectPatch, enabled = !sending) { Text("Reject") }
                        }
                    }
                }
            }
            validation?.let { v ->
                item {
                    SectionCard("After applying", subtitle = "Static analysis only — not a build") {
                        Text("Errors found by analysis: ${v.errorsBefore} before → ${v.errorsAfter} after.", style = MaterialTheme.typography.bodyMedium)
                        if (v.resolved.isNotEmpty()) { Text("No longer reported:", style = MaterialTheme.typography.labelLarge); BulletList(v.resolved.take(8).map { it.title }) }
                        if (v.newFindings.isNotEmpty()) { Text("New problems:", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error); BulletList(v.newFindings.take(8).map { it.title }) }
                        Text("The problem is only confirmed fixed once a build succeeds (and, for crashes, the app runs).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedButton(onClick = onOpenBuild) { Text("Build to confirm") }
                    }
                }
            }
            if (sending) item {
                Column {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                    TextButton(onClick = vm::cancelSend) { Text("Cancel") }
                }
            }
            item {
                OutlinedTextField(
                    value = question, onValueChange = { question = it }, modifier = Modifier.fillMaxWidth(), minLines = 2,
                    label = { Text(if (turns.isEmpty()) "Describe the problem or what you want to change" else "Follow-up") },
                )
                Spacer(Modifier.width(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { vm.prepare(question) }, enabled = question.isNotBlank() && !sending && configProblem == null) { Text("Review & send") }
                }
            }
            item {
                Text(
                    "AI answers can be wrong. Patches are checked against your files and secret files are never sent or changed, " +
                        "but you decide what is applied. Use only for apps you own or may modify.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    preview?.let { p -> PreviewDialog(p, config, onSend = { vm.send(); question = "" }, onCancel = vm::cancelPreview) }
    if (showSettings) AiSettingsDialog(config, hasKey, onSave = { c, k -> vm.saveConfig(c, k); showSettings = false }, onDismiss = { showSettings = false })
    if (pickFiles) FilePickerDialog(files, selected, onToggle = vm::toggleFile, onDismiss = { pickFiles = false })
}

@Composable
private fun TurnCard(turn: ChatTurn, isLatest: Boolean) {
    val user = turn.role == "user"
    Card(
        colors = CardDefaults.cardColors(containerColor = if (user) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (user) "You" else "Assistant", style = MaterialTheme.typography.labelLarge)
            if (user && turn.sharedFiles.isNotEmpty()) Text("Shared: ${turn.sharedFiles.joinToString()}", style = MaterialTheme.typography.labelSmall)
            // Split fenced code blocks out of the answer so they stay readable.
            val parts = turn.text.split("```")
            parts.forEachIndexed { i, part ->
                if (i % 2 == 1) CodeBlock(part.substringAfter('\n', part).trimEnd())
                else if (part.isNotBlank()) SelectionContainer { Text(part.trim(), style = MaterialTheme.typography.bodyMedium) }
            }
            if (!user && isLatest) Text("Not verified — review and build before relying on this.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PreviewDialog(p: AiPrompt, config: AiConfig, onSend: () -> Unit, onCancel: () -> Unit) {
    var showText by remember { mutableStateOf(false) }
    val host = config.baseUrl.ifBlank { config.kind.defaultBaseUrl }.substringAfter("://").substringBefore('/')
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Send to $host?") },
        text = {
            LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item { Text("${p.user.length + p.system.length} characters will be sent to ${config.kind.label}.") }
                if (p.shared.isNotEmpty()) item { Text("Files", style = MaterialTheme.typography.labelLarge) }
                items(p.shared) { f ->
                    Text("• ${f.path} (${f.chars} chars${if (f.truncated) ", truncated" else ""}${if (f.redactions > 0) ", ${f.redactions} line(s) redacted" else ""})", style = MaterialTheme.typography.bodySmall)
                }
                if (p.skipped.isNotEmpty()) {
                    item { Text("Not sent", style = MaterialTheme.typography.labelLarge) }
                    items(p.skipped) { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                }
                item { TextButton(onClick = { showText = !showText }) { Text(if (showText) "Hide full text" else "Show full text") } }
                if (showText) item { CodeBlock(p.user.take(30_000)) }
            }
        },
        confirmButton = { Button(onClick = onSend) { Text("Send") } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } },
    )
}

@Composable
private fun AiSettingsDialog(config: AiConfig, hasKey: Boolean, onSave: (AiConfig, String?) -> Unit, onDismiss: () -> Unit) {
    var kind by remember { mutableStateOf(config.kind) }
    var url by remember { mutableStateOf(config.baseUrl) }
    var model by remember { mutableStateOf(config.model) }
    var maxTokens by remember { mutableStateOf(config.maxTokens.toString()) }
    var key by remember { mutableStateOf("") }
    var removeKey by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf(false) }
    val draft = AiConfig(kind, url.trim(), model.trim(), maxTokens.toIntOrNull() ?: 0)
    val problem = draft.problem(if (removeKey) key.isNotBlank() else hasKey || key.isNotBlank())
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("AI provider") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                        OutlinedTextField(
                            value = kind.label, onValueChange = {}, readOnly = true, label = { Text("Provider") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        )
                        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            AiProviderKind.entries.forEach { k -> DropdownMenuItem(text = { Text(k.label) }, onClick = { kind = k; expanded = false }) }
                        }
                    }
                }
                item {
                    Text(
                        when (kind) {
                            AiProviderKind.PROXY -> "Recommended for teams: your server keeps the provider key. The app POSTs {system, messages, model, max_tokens} and expects {\"text\": …}."
                            else -> "Your own key is stored encrypted on this device (Android Keystore) and sent only to this provider."
                        },
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                item { OutlinedTextField(url, { url = it }, label = { Text(if (kind == AiProviderKind.PROXY) "Proxy URL" else "Base URL (blank = ${kind.defaultBaseUrl})") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                item { OutlinedTextField(model, { model = it }, label = { Text(if (kind == AiProviderKind.PROXY) "Model (optional)" else "Model") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                item {
                    OutlinedTextField(maxTokens, { maxTokens = it.filter(Char::isDigit).take(5) }, label = { Text("Max answer tokens") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                }
                item {
                    OutlinedTextField(
                        key, { key = it }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                        label = { Text(if (kind == AiProviderKind.PROXY) "Proxy token (optional)" else "API key") },
                        supportingText = { Text(if (hasKey && !removeKey) "A key is saved. Leave blank to keep it." else "Not saved yet") },
                    )
                }
                if (hasKey) item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FilterChip(selected = removeKey, onClick = { removeKey = !removeKey }, label = { Text("Remove saved key") })
                    }
                }
                problem?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(draft, if (key.isNotBlank()) key else if (removeKey) "" else null) }, enabled = (maxTokens.toIntOrNull() ?: 0) in 256..64_000) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun FilePickerDialog(files: List<String>, selected: List<String>, onToggle: (String) -> Unit, onDismiss: () -> Unit) {
    var filter by remember { mutableStateOf("") }
    val shown = remember(files, filter) { files.filter { filter.isBlank() || it.contains(filter.trim(), ignoreCase = true) }.take(300) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Files to share (${selected.size}/20)") },
        text = {
            Column {
                OutlinedTextField(filter, { filter = it }, label = { Text("Filter") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                LazyColumn(Modifier.heightIn(max = 380.dp)) {
                    items(shown, key = { it }) { path ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = path in selected, onCheckedChange = { onToggle(path) })
                            Text(path, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Text("Keystores, local.properties and .env files are never listed or sent.", style = MaterialTheme.typography.labelSmall)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

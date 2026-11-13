@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.operations.BatchRenameRule
import com.webtecit.filepilot.core.operations.CaseMode
import com.webtecit.filepilot.core.operations.ConflictPolicy
import com.webtecit.filepilot.core.operations.RenamePreview
import com.webtecit.filepilot.core.storage.SortField
import com.webtecit.filepilot.core.storage.SortOrder

@Composable
fun SortDialog(current: SortOrder, onApply: (SortOrder) -> Unit, onDismiss: () -> Unit) {
    var field by remember { mutableStateOf(current.field) }
    var ascending by remember { mutableStateOf(current.ascending) }
    var foldersFirst by remember { mutableStateOf(current.foldersFirst) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sort by") },
        text = {
            Column {
                SortField.entries.forEach { f ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .selectable(selected = field == f, role = Role.RadioButton) { field = f }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = field == f, onClick = null)
                        Spacer(Modifier.width(12.dp))
                        Text(f.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
                Spacer(Modifier.height(12.dp))
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = ascending,
                        onClick = { ascending = true },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                    ) { Text(if (field == SortField.NAME || field == SortField.TYPE) "A → Z" else "Smallest / oldest") }
                    SegmentedButton(
                        selected = !ascending,
                        onClick = { ascending = false },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                    ) { Text(if (field == SortField.NAME || field == SortField.TYPE) "Z → A" else "Largest / newest") }
                }
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth().clickable(role = Role.Checkbox) { foldersFirst = !foldersFirst },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = foldersFirst, onCheckedChange = null)
                    Spacer(Modifier.width(12.dp))
                    Text("Show folders first", style = MaterialTheme.typography.bodyLarge)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onApply(SortOrder(field, ascending, foldersFirst)) }) { Text("Apply") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun ConflictDialog(pending: PendingPaste, onResolve: (ConflictPolicy?) -> Unit) {
    val names = pending.conflicts
    AlertDialog(
        onDismissRequest = { onResolve(null) },
        title = {
            Text(if (names.size == 1) "\"${names[0]}\" already exists" else "${names.size} items already exist")
        },
        text = {
            Column {
                Text("Choose what to do with items that have the same name in this folder.")
                if (names.size > 1) {
                    Spacer(Modifier.height(8.dp))
                    names.take(5).forEach {
                        Text("• $it", style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (names.size > 5) Text("and ${names.size - 5} more", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Replace keeps the existing item until the new copy is complete. Folders are merged.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            Column(horizontalAlignment = Alignment.End) {
                TextButton(onClick = { onResolve(ConflictPolicy.KEEP_BOTH) }) { Text("Keep both") }
                TextButton(onClick = { onResolve(ConflictPolicy.REPLACE) }) {
                    Text("Replace", color = MaterialTheme.colorScheme.error)
                }
                TextButton(onClick = { onResolve(ConflictPolicy.SKIP) }) { Text("Skip these") }
                TextButton(onClick = { onResolve(null) }) { Text("Cancel paste") }
            }
        },
    )
}

@Composable
fun BatchRenameDialog(
    count: Int,
    preview: (BatchRenameRule) -> List<RenamePreview>,
    onApply: (BatchRenameRule) -> Unit,
    onDismiss: () -> Unit,
) {
    var pattern by remember { mutableStateOf("{name}") }
    var find by remember { mutableStateOf("") }
    var replace by remember { mutableStateOf("") }
    var start by remember { mutableStateOf("1") }
    var padding by remember { mutableStateOf("2") }
    var caseMode by remember { mutableStateOf(CaseMode.KEEP) }
    val rule = BatchRenameRule(
        pattern = pattern.ifBlank { "{name}" },
        find = find,
        replace = replace,
        startNumber = start.toIntOrNull() ?: 1,
        padding = padding.toIntOrNull() ?: 0,
        caseMode = caseMode,
    )
    val results = remember(rule) { preview(rule) }
    val errors = results.count { it.error != null }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename $count items") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = pattern,
                    onValueChange = { pattern = it },
                    label = { Text("New name") },
                    supportingText = { Text("{name} original name · {n} number · {ext} extension") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = find, onValueChange = { find = it }, label = { Text("Find") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = replace, onValueChange = { replace = it }, label = { Text("Replace with") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = start, onValueChange = { start = it.filter(Char::isDigit).take(6) },
                        label = { Text("Start at") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedTextField(
                        value = padding, onValueChange = { padding = it.filter(Char::isDigit).take(1) },
                        label = { Text("Digits") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CaseMode.entries.forEach { mode ->
                        FilterChip(selected = caseMode == mode, onClick = { caseMode = mode }, label = { Text(mode.label) })
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Preview", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                LazyColumn(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(max = 220.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainer),
                ) {
                    items(results) { r ->
                        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                            Text(r.oldName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "→ ${r.newName}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (r.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (r.error != null) {
                                Text(r.error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
                if (errors > 0) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "$errors name${if (errors == 1) "" else "s"} need attention before renaming.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onApply(rule) }, enabled = errors == 0) { Text("Rename all") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun CreateArchiveDialog(
    defaultName: String,
    onCreate: (String, com.webtecit.filepilot.core.archive.ArchiveFormat, String?, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(defaultName) }
    var format by remember { mutableStateOf(com.webtecit.filepilot.core.archive.ArchiveFormat.ZIP) }
    var password by remember { mutableStateOf("") }
    var maximum by remember { mutableStateOf(false) }
    val formats = listOf(com.webtecit.filepilot.core.archive.ArchiveFormat.ZIP, com.webtecit.filepilot.core.archive.ArchiveFormat.SEVEN_Z, com.webtecit.filepilot.core.archive.ArchiveFormat.TAR_GZ)
    val error = com.webtecit.filepilot.core.storage.NameRules.validate(name)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create archive") },
        text = {
            Column {
                OutlinedTextField(name, { name = it }, label = { Text("Archive name") }, singleLine = true, isError = error != null,
                    supportingText = { error?.let { Text(it) } }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    formats.forEachIndexed { i, f ->
                        SegmentedButton(selected = format == f, onClick = { format = f }, shape = SegmentedButtonDefaults.itemShape(i, formats.size)) { Text(f.label) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                if (format == com.webtecit.filepilot.core.archive.ArchiveFormat.ZIP) {
                    OutlinedTextField(password, { password = it }, label = { Text("Password (optional, AES-256)") }, singleLine = true,
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                }
                Row(Modifier.fillMaxWidth().clickable(role = Role.Checkbox) { maximum = !maximum }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = maximum, onCheckedChange = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Maximum compression (slower)")
                }
            }
        },
        confirmButton = {
            TextButton(enabled = error == null, onClick = { onCreate(name.trim(), format, password.takeIf { format == com.webtecit.filepilot.core.archive.ArchiveFormat.ZIP }, maximum) }) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

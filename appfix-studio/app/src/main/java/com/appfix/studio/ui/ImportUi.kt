package com.appfix.studio.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.util.formatBytes
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.ProgressBlock

/** Actions any screen can trigger to start an import. */
class ImportActions(
    val pickApk: () -> Unit,
    val pickZip: () -> Unit,
    val pickFolder: () -> Unit,
    val openGitHub: () -> Unit,
    val importSample: () -> Unit,
)

val LocalImportActions = staticCompositionLocalOf<ImportActions> { error("ImportActions not provided") }

@Composable
fun ImportHost(vm: ImportViewModel, onImported: (String) -> Unit, content: @Composable () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    var showGitHub by rememberSaveable { mutableStateOf(false) }

    val apkLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::importApk) }
    val zipLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::importZip) }
    val folderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri -> uri?.let(vm::importFolder) }

    val actions = remember {
        ImportActions(
            pickApk = { apkLauncher.launch(arrayOf("application/vnd.android.package-archive", "application/octet-stream", "application/zip")) },
            pickZip = { zipLauncher.launch(arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream")) },
            pickFolder = { folderLauncher.launch(null) },
            openGitHub = { showGitHub = true },
            importSample = { vm.importSample() },
        )
    }

    CompositionLocalProvider(LocalImportActions provides actions) { content() }

    if (showGitHub) {
        GitHubImportDialog(
            onDismiss = { showGitHub = false },
            onImport = { repo, ref, token ->
                showGitHub = false
                vm.importGitHub(repo, ref, token)
            },
        )
    }

    when (val s = state) {
        is ImportState.Running -> AlertDialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
            title = { Text(s.title) },
            text = {
                val amount = if (s.done > 0) " · " + formatBytes(s.done) + (if (s.total > 0) " of " + formatBytes(s.total) else "") else ""
                ProgressBlock(s.label + amount, s.done, s.total)
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = vm::cancel) { Text("Cancel") } },
        )
        is ImportState.Failed -> AlertDialog(
            onDismissRequest = vm::dismiss,
            title = { Text("Import failed") },
            text = { Text(s.message) },
            confirmButton = { Button(onClick = vm::dismiss) { Text("Close") } },
        )
        is ImportState.Done -> {
            if (s.warnings.isEmpty()) {
                LaunchedEffect(s.projectId) {
                    vm.dismiss()
                    onImported(s.projectId)
                }
            } else {
                AlertDialog(
                    onDismissRequest = { vm.dismiss(); onImported(s.projectId) },
                    title = { Text("Imported with notes") },
                    text = {
                        Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                            BulletList(s.warnings.take(30))
                        }
                    },
                    confirmButton = { Button(onClick = { vm.dismiss(); onImported(s.projectId) }) { Text("Open project") } },
                )
            }
        }
        ImportState.Idle -> Unit
    }
}

@Composable
private fun GitHubImportDialog(onDismiss: () -> Unit, onImport: (String, String?, String?) -> Unit) {
    var repo by rememberSaveable { mutableStateOf("") }
    var ref by rememberSaveable { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var touched by rememberSaveable { mutableStateOf(false) }
    val valid = com.appfix.studio.data.repo.ProjectRepository.parseGitHub(repo) != null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Import from GitHub") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = repo,
                    onValueChange = { repo = it },
                    label = { Text("Repository") },
                    supportingText = { Text(if (touched && !valid) "Use owner/name or a github.com URL" else "Example: android/sunflower") },
                    isError = touched && !valid,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = ref,
                    onValueChange = { ref = it },
                    label = { Text("Branch, tag or commit (optional)") },
                    supportingText = { Text("Leave empty for the default branch") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text("Access token (private repos only)") },
                    supportingText = { Text("Used for this download only and never saved") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(4.dp))
                Text("Downloads the repository as a ZIP archive through the GitHub API.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Button(onClick = {
                touched = true
                if (valid) onImport(repo, ref.ifBlank { null }, token.ifBlank { null })
            }) { Text("Download") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

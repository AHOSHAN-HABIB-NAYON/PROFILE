@file:OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.appfix.studio.ui.build

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.build.BuildPlanner
import com.appfix.core.build.BuildRecord
import com.appfix.core.build.BuildState
import com.appfix.core.build.BuildVariant
import com.appfix.core.build.GitHubClient
import com.appfix.core.build.UploadPlan
import com.appfix.core.project.ProjectDetector
import com.appfix.core.util.formatBytes
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.security.SecretStore
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.CodeBlock
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.ProgressBlock
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.components.StatusPill
import com.appfix.studio.ui.theme.LocalStatusColors
import com.appfix.studio.util.FileActions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.DateFormat
import java.util.Date

@Composable
fun BuildScreen(projectId: String, onBack: () -> Unit, onAnalyzeLog: (String) -> Unit, onSign: (String) -> Unit) {
    val container = appContainer()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val live by container.builds.records.collectAsStateWithLifecycle()
    val upload by container.builds.upload.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var showSetup by rememberSaveable { mutableStateOf(false) }
    var variant by rememberSaveable { mutableStateOf(BuildVariant.DEBUG_APK) }
    var hasToken by remember { mutableStateOf(container.secrets.has(SecretStore.GITHUB_TOKEN)) }
    var error by remember { mutableStateOf<String?>(null) }
    var logFor by remember { mutableStateOf<BuildRecord?>(null) }
    var exportFile by remember { mutableStateOf<File?>(null) }
    val history by produceState(emptyList<BuildRecord>(), live) { value = withContext(Dispatchers.IO) { container.builds.history(projectId) } }
    val plan by produceState<Result<UploadPlan>?>(null, projectId) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val ws = container.storage.workspace(projectId)
                val info = ProjectDetector.detect(ws)
                BuildPlanner.workflow(info, BuildVariant.DEBUG_APK) // validates that the project type can be built
                BuildPlanner.uploadPlan(if (info.root.isEmpty()) ws else File(ws, info.root))
            }
        }
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val f = exportFile
        if (uri != null && f != null) scope.launch {
            val msg = withContext(Dispatchers.IO) { runCatching { FileActions.exportTo(context, f, uri); "Exported ${f.name}" }.getOrElse { "Export failed: ${it.message}" } }
            snackbar.showSnackbar(msg)
        }
        exportFile = null
    }
    LaunchedEffect(history) { history.filter { it.isActive }.forEach { container.builds.resume(it) } }

    val configured = hasToken && settings.buildRepo.contains('/')
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cloud build") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
                actions = { TextButton(onClick = { showSetup = true }) { Text("Settings") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                SectionCard("How cloud builds work", icon = Icons.Outlined.CloudUpload) {
                    BulletList(listOf(
                        "Your project is uploaded to a GitHub repository you own and built on GitHub-hosted runners with Gradle (or Flutter / Node for those projects).",
                        "Keystores and local configuration are never uploaded. Release outputs come back unsigned and are signed on this device.",
                        "Logs, steps and the resulting APK/AAB are real outputs of that build — nothing is simulated.",
                    ))
                    if (!configured) {
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { showSetup = true }) { Text("Connect GitHub") }
                    } else {
                        InfoRow("Build repository", settings.buildRepo)
                    }
                }
            }
            error?.let { item { ErrorCard(it) } }
            plan?.let { p ->
                item {
                    p.fold(
                        onSuccess = { pl ->
                            SectionCard("New build", subtitle = "${pl.files.size} files · ${formatBytes(pl.totalBytes)} will be uploaded") {
                                BuildVariant.entries.forEach { v ->
                                    Row(Modifier.fillMaxWidth().selectable(selected = variant == v, role = Role.RadioButton) { variant = v }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        RadioButton(selected = variant == v, onClick = null)
                                        Text(v.displayName, modifier = Modifier.padding(start = 8.dp))
                                    }
                                }
                                if (pl.excluded.isNotEmpty()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text("Not uploaded", style = MaterialTheme.typography.labelLarge)
                                    BulletList(pl.excluded.take(8))
                                }
                                Spacer(Modifier.height(8.dp))
                                val running = history.any { it.isActive }
                                Button(
                                    onClick = {
                                        error = null
                                        scope.launch {
                                            try {
                                                withContext(Dispatchers.IO) { container.builds.start(projectId, settings.buildRepo, variant) }
                                            } catch (e: Exception) {
                                                error = e.message
                                            }
                                        }
                                    },
                                    enabled = configured && !running,
                                ) { Text(if (running) "A build is running" else "Start cloud build") }
                            }
                        },
                        onFailure = { ErrorCard(it.message ?: "This project cannot be built in the cloud.") },
                    )
                }
            }
            upload?.let { u -> item { SectionCard("Uploading") { ProgressBlock(u.label, u.done, u.total) } } }
            if (history.isNotEmpty()) item { Text("Builds", style = MaterialTheme.typography.titleMedium) }
            items(history, key = { it.id }) { r ->
                BuildCard(
                    record = r,
                    output = container.builds.outputFile(r),
                    onCancel = { container.builds.cancel(r.id) },
                    onOpenRun = { r.runUrl?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } },
                    onShowLog = { logFor = r },
                    onInstall = { f ->
                        if (!FileActions.canInstall(context)) {
                            scope.launch { snackbar.showSnackbar("Allow AppFix Studio to install apps, then try again.") }
                            FileActions.openInstallPermissionSettings(context)
                        } else FileActions.install(context, f)?.let { m -> scope.launch { snackbar.showSnackbar(m) } }
                    },
                    onShare = { f -> FileActions.share(context, f) },
                    onExport = { f -> exportFile = f; exporter.launch(f.name) },
                    onSign = { f -> onSign(f.absolutePath) },
                    onDelete = { scope.launch { withContext(Dispatchers.IO) { container.builds.delete(projectId, r.id) } } },
                )
            }
        }
    }

    if (showSetup) SetupDialog(
        initialRepo = settings.buildRepo,
        hasToken = hasToken,
        onDismiss = { showSetup = false },
        onSaved = { repo, token ->
            scope.launch {
                if (token != null) container.secrets.put(SecretStore.GITHUB_TOKEN, token)
                container.settings.setBuildRepo(repo)
                hasToken = container.secrets.has(SecretStore.GITHUB_TOKEN)
                showSetup = false
                snackbar.showSnackbar("Build settings saved")
            }
        },
        onForget = {
            container.secrets.remove(SecretStore.GITHUB_TOKEN)
            hasToken = false
        },
    )

    logFor?.let { r ->
        val text by produceState<String?>(null, r.id, r.state) {
            value = withContext(Dispatchers.IO) { container.builds.logFile(projectId, r.id).takeIf { it.isFile }?.readText() }
        }
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { logFor = null }, sheetState = sheet) {
            Column(Modifier.navigationBarsPadding().padding(16.dp)) {
                Text("Build log", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                val t = text
                if (t == null) Text("The log becomes available when the build finishes.") else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { logFor = null; onAnalyzeLog(t) }) { Text("Analyze errors") }
                        OutlinedButton(onClick = { FileActions.share(context, container.builds.logFile(projectId, r.id)) }) { Text("Share log") }
                    }
                    Spacer(Modifier.height(8.dp))
                    Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                        CodeBlock(t.lines().takeLast(1500).joinToString("\n"))
                    }
                }
            }
        }
    }
}

@Composable
private fun BuildCard(
    record: BuildRecord, output: File?, onCancel: () -> Unit, onOpenRun: () -> Unit, onShowLog: () -> Unit,
    onInstall: (File) -> Unit, onShare: (File) -> Unit, onExport: (File) -> Unit, onSign: (File) -> Unit, onDelete: () -> Unit,
) {
    val s = LocalStatusColors.current
    val started = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(record.startedAt))
    SectionCard(record.variant.displayName.substringBefore(" ("), subtitle = "$started${record.durationMs?.let { " · ${it / 1000}s" } ?: ""}") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (record.state) {
                BuildState.SUCCEEDED -> StatusPill("Succeeded", s.successContainer, s.success)
                BuildState.FAILED -> StatusPill("Failed", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                BuildState.CANCELLED -> StatusPill("Cancelled", MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.onSurfaceVariant)
                else -> StatusPill(record.state.name.lowercase().replaceFirstChar { it.uppercase() }, s.infoContainer, s.info)
            }
            Spacer(Modifier.width(8.dp))
            if (record.isActive) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        }
        record.message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp)) }
        if (record.steps.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            record.steps.forEach { st ->
                Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    val (icon, tint) = when {
                        st.conclusion == "success" -> Icons.Outlined.CheckCircle to s.success
                        st.conclusion == "failure" -> Icons.Outlined.ErrorOutline to MaterialTheme.colorScheme.error
                        st.conclusion == "skipped" || st.conclusion == "cancelled" -> Icons.Outlined.Cancel to MaterialTheme.colorScheme.onSurfaceVariant
                        st.status == "in_progress" -> Icons.Outlined.Sync to s.info
                        st.status == "queued" || st.status == "pending" -> Icons.Outlined.HourglassEmpty to MaterialTheme.colorScheme.onSurfaceVariant
                        else -> Icons.Outlined.RadioButtonUnchecked to MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Icon(icon, contentDescription = st.conclusion ?: st.status, tint = tint, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(st.name, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (record.isActive && record.state == BuildState.UPLOADING) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
        Spacer(Modifier.height(8.dp))
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (record.isActive) OutlinedButton(onClick = onCancel) { Text("Cancel build") }
            if (record.runUrl != null) TextButton(onClick = onOpenRun) { Text("Open on GitHub") }
            if (!record.isActive && record.runId != null) TextButton(onClick = onShowLog) { Text("Log") }
            if (output != null) {
                InfoRow("Output", "${output.name} · ${formatBytes(output.length())}")
                if (output.extension == "apk") {
                    if (record.variant == BuildVariant.DEBUG_APK) FilledTonalButton(onClick = { onInstall(output) }) { Text("Install") }
                    FilledTonalButton(onClick = { onSign(output) }) { Text(if (record.variant == BuildVariant.DEBUG_APK) "Re-sign" else "Sign") }
                }
                OutlinedButton(onClick = { onShare(output) }) { Text("Share") }
                OutlinedButton(onClick = { onExport(output) }) { Text("Export") }
            }
            if (!record.isActive) TextButton(onClick = onDelete) { Text("Delete") }
        }
    }
}

@Composable
private fun SetupDialog(initialRepo: String, hasToken: Boolean, onDismiss: () -> Unit, onSaved: (String, String?) -> Unit, onForget: () -> Unit) {
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf("") }
    var repo by remember { mutableStateOf(initialRepo) }
    var status by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }
    val container = appContainer()
    fun client() = GitHubClient(token.ifBlank { container.secrets.get(SecretStore.GITHUB_TOKEN).orEmpty() })
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Connect GitHub") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Create a fine-grained personal access token on github.com (Settings → Developer settings) with access to one build repository and these permissions: Contents (read & write), Actions (read & write), Administration (only to create the repository here).", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = token, onValueChange = { token = it.trim() }, singleLine = true,
                    label = { Text(if (hasToken) "Token (saved — leave empty to keep)" else "Personal access token") },
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                )
                Text("The token is stored encrypted with a key in the Android Keystore and only sent to api.github.com.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(value = repo, onValueChange = { repo = it.trim() }, singleLine = true, label = { Text("Build repository (owner/name)") }, placeholder = { Text("you/appfix-builds") })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(enabled = !checking && (token.isNotBlank() || hasToken), onClick = {
                        checking = true
                        scope.launch {
                            status = withContext(Dispatchers.IO) {
                                runCatching {
                                    val c = client()
                                    val user = c.user().login
                                    if (repo.contains('/')) {
                                        val (o, n) = repo.split('/', limit = 2)
                                        val r = c.repo(o, n)
                                        "Signed in as $user. ${r.fullName} is ${if (r.private) "private" else "PUBLIC — anyone can see uploaded code"}${if (r.permissions?.push == false) ", but the token cannot push to it" else ""}."
                                    } else "Signed in as $user."
                                }.getOrElse { "Check failed: ${it.message}" }
                            }
                            checking = false
                        }
                    }) { Text("Check") }
                    OutlinedButton(enabled = !checking && (token.isNotBlank() || hasToken), onClick = {
                        checking = true
                        scope.launch {
                            status = withContext(Dispatchers.IO) {
                                runCatching { val r = client().createPrivateRepo("appfix-builds"); repo = r.fullName; "Created private repository ${r.fullName}." }
                                    .getOrElse { "Could not create the repository: ${it.message}" }
                            }
                            checking = false
                        }
                    }) { Text("Create private repo") }
                }
                if (checking) LinearProgressIndicator(Modifier.fillMaxWidth())
                status?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                if (hasToken) TextButton(onClick = onForget) { Text("Forget saved token") }
            }
        },
        confirmButton = { Button(onClick = { onSaved(repo, token.ifBlank { null }) }, enabled = repo.matches(Regex("[A-Za-z0-9-]+/[A-Za-z0-9._-]+")) && (hasToken || token.isNotBlank())) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

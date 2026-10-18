@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.appfix.studio.ui.project

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.ViewModule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.apk.ApkReport
import com.appfix.core.apk.Support
import com.appfix.core.backup.Snapshot
import com.appfix.core.patch.ChangeRecord
import com.appfix.core.patch.ChangeState
import com.appfix.core.patch.Diff
import com.appfix.core.project.ModuleType
import com.appfix.core.project.ProjectInfo
import com.appfix.core.util.formatBytes
import com.appfix.studio.data.db.ProjectEntity
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.appViewModel
import com.appfix.studio.ui.components.ArchiveTreeSource
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.CodeBlock
import com.appfix.studio.ui.components.ConfirmDialog
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.components.FileTree
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.ProjectIcon
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.components.StatusPill
import com.appfix.studio.ui.components.WorkspaceTreeSource
import com.appfix.studio.ui.theme.LocalStatusColors
import java.text.DateFormat
import java.util.Date
import java.util.zip.ZipFile

@Composable
fun ProjectScreen(
    projectId: String,
    onBack: () -> Unit,
    onOpenApkReport: () -> Unit,
    onOpenFile: (String) -> Unit,
    onOpenEditor: () -> Unit,
    onOpenRepair: () -> Unit,
    onDeleted: () -> Unit,
) {
    val vm = appViewModel(key = "project-$projectId") { ProjectViewModel(it, projectId) }
    val project by vm.project.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var showDelete by rememberSaveable { mutableStateOf(false) }
    var showRename by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            vm.consumeMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(project?.name ?: "Project", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
                actions = {
                    IconButton(onClick = { showRename = true }) { Icon(Icons.Outlined.Edit, contentDescription = "Rename project") }
                    IconButton(onClick = { showDelete = true }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete project") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val p = project
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (busy != null) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (p == null) return@Column
            val tabs = if (p.kind == ProjectKind.APK) listOf("Overview", "Contents") else listOf("Overview", "Files", "Backups", "History")
            var tab by rememberSaveable { mutableStateOf(0) }
            PrimaryScrollableTabRow(selectedTabIndex = tab, edgePadding = 16.dp) {
                tabs.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
            }
            when (tabs.getOrNull(tab)) {
                "Overview" -> if (p.kind == ProjectKind.APK) ApkOverview(vm, p, onOpenApkReport) else SourceOverview(vm, p, onOpenEditor, onOpenRepair)
                "Contents" -> ApkContents(vm, onOpenFile)
                "Files" -> {
                    val container = appContainer()
                    val revision by vm.revision.collectAsStateWithLifecycle()
                    val source = remember(projectId) { WorkspaceTreeSource(container.storage.workspace(projectId)) }
                    FileTree(source, onOpenFile = { onOpenFile(it.path) }, refreshKey = revision)
                }
                "Backups" -> BackupsTab(vm)
                "History" -> HistoryTab(vm)
            }
        }
    }

    val p = project
    if (showDelete && p != null) {
        ConfirmDialog(
            title = "Delete \"${p.name}\"?",
            text = "This permanently removes the imported files, backups and history for \"${p.name}\" from this device. Files you exported elsewhere are not affected.",
            confirmLabel = "Delete project",
            destructive = true,
            onConfirm = { showDelete = false; vm.delete(onDeleted) },
            onDismiss = { showDelete = false },
        )
    }
    if (showRename && p != null) {
        var name by remember { mutableStateOf(p.name) }
        AlertDialog(
            onDismissRequest = { showRename = false },
            title = { Text("Rename project") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true) },
            confirmButton = { Button(onClick = { vm.rename(name); showRename = false }, enabled = name.isNotBlank()) { Text("Save name") } },
            dismissButton = { TextButton(onClick = { showRename = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Header(p: ProjectEntity, extra: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        ProjectIcon(p, size = 56)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(p.name, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(p.packageName, p.versionName?.let { "v$it" }).joinToString(" · ").ifEmpty { p.origin }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (extra != null) Text(extra, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ----------------------------------------------------------------------------- APK

@Composable
private fun ApkOverview(vm: ProjectViewModel, p: ProjectEntity, onOpenApkReport: () -> Unit) {
    val report by vm.apkReport.collectAsStateWithLifecycle()
    val signature by vm.signature.collectAsStateWithLifecycle()
    val r = report
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Header(p, "${formatBytes(p.sizeBytes)} · imported from ${p.origin}") }
        if (r == null) {
            item { Text("Loading report…") }
            return@LazyColumn
        }
        item {
            SectionCard("Package", icon = Icons.Outlined.Info) {
                InfoRow("Label", r.label)
                InfoRow("Package", r.manifest?.packageName, mono = true)
                InfoRow("Version", r.manifest?.let { "${it.versionName ?: "—"} (code ${it.versionCode ?: "—"})" })
                InfoRow("SDK", r.manifest?.let { "min ${it.minSdk ?: "—"} · target ${it.targetSdk ?: "—"} · compiled ${it.compileSdk ?: "—"}" })
                InfoRow("Frameworks", r.frameworks.joinToString { it.displayName }.ifEmpty { "Not detected" })
                InfoRow("SHA-256", r.sha256, mono = true)
                Spacer(Modifier.height(8.dp))
                FilledTonalButton(onClick = onOpenApkReport) { Text("Open full report") }
            }
        }
        item { SigningCard(r, signature, onVerify = vm::verifySignature) }
        item { EditabilityCard(r) }
        if (r.warnings.isNotEmpty()) item { SectionCard("Notes") { BulletList(r.warnings) } }
    }
}

@Composable
fun SigningCard(r: ApkReport, signature: com.appfix.studio.signing.SignatureVerification?, onVerify: () -> Unit) {
    val status = LocalStatusColors.current
    SectionCard("Signature", icon = Icons.Outlined.Shield, subtitle = r.signing.schemes.joinToString().ifEmpty { "No signature blocks" }) {
        Text(r.signing.note, style = MaterialTheme.typography.bodyMedium)
        r.signing.certificates.forEach { c ->
            Spacer(Modifier.height(8.dp))
            InfoRow("Subject", c.subject)
            InfoRow("Cert SHA-256", c.sha256, mono = true)
            InfoRow("Valid until", DateFormat.getDateInstance().format(Date(c.notAfter)))
        }
        Spacer(Modifier.height(10.dp))
        if (signature == null) {
            OutlinedButton(onClick = onVerify) { Text("Verify signature (apksig)") }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (signature.verified) StatusPill("Verified", status.successContainer, status.success)
                else StatusPill("Not verified", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                Spacer(Modifier.width(8.dp))
                Text(listOfNotNull("v1".takeIf { signature.v1 }, "v2".takeIf { signature.v2 }, "v3".takeIf { signature.v3 }).joinToString().ifEmpty { "no valid scheme" }, style = MaterialTheme.typography.bodySmall)
            }
            if (signature.errors.isNotEmpty()) { Spacer(Modifier.height(6.dp)); BulletList(signature.errors.take(8)) }
            if (signature.warnings.isNotEmpty()) { Spacer(Modifier.height(6.dp)); BulletList(signature.warnings.take(5)) }
        }
    }
}

@Composable
fun EditabilityCard(r: ApkReport) {
    val status = LocalStatusColors.current
    SectionCard("What can be changed", icon = Icons.Outlined.Build, subtitle = "Honest assessment for this APK") {
        r.editability.forEach { c ->
            Column(Modifier.padding(vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(c.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    when (c.support) {
                        Support.SUPPORTED -> StatusPill("Supported", status.successContainer, status.success)
                        Support.LIMITED -> StatusPill("Limited", status.warningContainer, status.warning)
                        Support.UNSUPPORTED -> StatusPill("Not possible", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
                Text(c.explanation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ApkContents(vm: ProjectViewModel, onOpenFile: (String) -> Unit) {
    val container = appContainer()
    val source by androidx.compose.runtime.produceState<ArchiveTreeSource?>(null, vm.projectId) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            container.storage.originalApk(vm.projectId)?.let { f ->
                runCatching { ZipFile(f).use { z -> ArchiveTreeSource(z.entries().toList().map { it.name to it.size }) } }.getOrNull()
            }
        }
    }
    val s = source
    if (s == null) {
        Text("Reading APK…", modifier = Modifier.padding(16.dp))
    } else {
        FileTree(s, onOpenFile = { onOpenFile(it.path) }, header = {
            Text(
                "Read-only view of the original APK. Binary XML files are decoded when opened.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        })
    }
}

// ----------------------------------------------------------------------------- Source

@Composable
private fun SourceOverview(vm: ProjectViewModel, p: ProjectEntity, onOpenEditor: () -> Unit, onOpenRepair: () -> Unit) {
    val info by vm.info.collectAsStateWithLifecycle()
    val i = info
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Header(p, "${formatBytes(p.sizeBytes)} · ${p.origin}") }
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onOpenRepair) {
                    Icon(Icons.Outlined.Build, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Analyze & repair")
                }
                OutlinedButton(onClick = onOpenEditor) {
                    Icon(Icons.Outlined.Code, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Open editor")
                }
            }
        }
        if (i == null) {
            item { Text("Project details unavailable.") }
            return@LazyColumn
        }
        item { ProjectInfoCard(i) }
        if (i.modules.isNotEmpty()) item { ModulesCard(i) }
        i.buildCommand?.let { cmd ->
            item {
                SectionCard("How this project is built") {
                    CodeBlock(cmd)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Phones cannot run a full Android SDK + Gradle toolchain reliably, so builds run on a computer, CI or a cloud build worker.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (i.notes.isNotEmpty()) item { SectionCard("Notes") { BulletList(i.notes) } }
    }
}

@Composable
private fun ProjectInfoCard(i: ProjectInfo) {
    SectionCard("Project", icon = Icons.Outlined.Info) {
        InfoRow("Type", i.framework.displayName)
        InfoRow("Languages", i.languages.joinToString().ifEmpty { "—" })
        InfoRow("UI toolkit", i.uiToolkits.joinToString().ifEmpty { "—" })
        InfoRow("Root folder", i.root.ifEmpty { "(workspace root)" }, mono = true)
        if (i.androidDir != null) {
            InfoRow("Gradle", i.gradleVersion ?: "unknown")
            InfoRow("AGP", i.agpVersion ?: "unknown")
            InfoRow("Kotlin", i.kotlinVersion ?: "—")
            InfoRow("Wrapper", if (i.hasGradleWrapper && i.hasWrapperJar) "Present" else if (i.hasGradleWrapper) "JAR missing" else "Missing")
            InfoRow("Build scripts", if (i.usesKotlinDsl) "Kotlin DSL" else "Groovy")
        }
        InfoRow("Files", i.sourceFileCount.toString())
    }
}

@Composable
private fun ModulesCard(i: ProjectInfo) {
    SectionCard("Modules", icon = Icons.Outlined.ViewModule, subtitle = "${i.modules.size} Gradle module(s)") {
        i.modules.forEachIndexed { idx, m ->
            if (idx > 0) Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.gradlePath, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                StatusPill(
                    when (m.type) { ModuleType.APPLICATION -> "App"; ModuleType.LIBRARY -> "Library"; ModuleType.OTHER -> "Other" },
                    MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (m.type != ModuleType.OTHER) {
                InfoRow("Namespace", m.namespace, mono = true)
                if (m.applicationId != null) InfoRow("Application ID", m.applicationId, mono = true)
                InfoRow("SDK", "min ${m.minSdk ?: "?"} · target ${m.targetSdk ?: "?"} · compile ${m.compileSdk ?: "?"}")
                if (m.versionName != null || m.versionCode != null) InfoRow("Version", "${m.versionName ?: "—"} (${m.versionCode ?: "—"})")
            }
        }
    }
}

@Composable
private fun BackupsTab(vm: ProjectViewModel) {
    val backups by vm.backups.collectAsStateWithLifecycle()
    var showCreate by rememberSaveable { mutableStateOf(false) }
    var restore by remember { mutableStateOf<Snapshot?>(null) }
    var delete by remember { mutableStateOf<Snapshot?>(null) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            SectionCard("Backups", icon = Icons.Outlined.Backup, subtitle = "Full copies of the workspace, stored on this device") {
                Text("Build folders are not included. Larger automatic fixes create a backup first.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Button(onClick = { showCreate = true }) { Text("Create backup") }
            }
        }
        if (backups.isEmpty()) item { EmptyState(Icons.Outlined.Backup, "No backups yet", "Create a backup before making large changes.") }
        items(backups, key = { it.id }) { s ->
            SectionCard(s.label, subtitle = "${DateFormat.getDateTimeInstance().format(Date(s.createdAt))} · ${s.fileCount} files · ${formatBytes(s.sizeBytes)}") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(onClick = { restore = s }) { Icon(Icons.Outlined.Restore, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Restore") }
                    TextButton(onClick = { delete = s }) { Text("Delete") }
                }
            }
        }
    }
    if (showCreate) {
        var label by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreate = false },
            title = { Text("Create backup") },
            text = { OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text("Label") }, placeholder = { Text("Before my changes") }, singleLine = true) },
            confirmButton = { Button(onClick = { vm.createBackup(label); showCreate = false }) { Text("Create backup") } },
            dismissButton = { TextButton(onClick = { showCreate = false }) { Text("Cancel") } },
        )
    }
    restore?.let { s ->
        ConfirmDialog(
            title = "Restore \"${s.label}\"?",
            text = "All current files are replaced by this backup. The current state is saved as a new backup first, so you can switch back.",
            confirmLabel = "Restore backup",
            onConfirm = { restore = null; vm.restoreBackup(s) },
            onDismiss = { restore = null },
        )
    }
    delete?.let { s ->
        ConfirmDialog(
            title = "Delete backup \"${s.label}\"?",
            text = "This backup is removed permanently.",
            confirmLabel = "Delete backup",
            destructive = true,
            onConfirm = { delete = null; vm.deleteBackup(s) },
            onDismiss = { delete = null },
        )
    }
}

@Composable
private fun HistoryTab(vm: ProjectViewModel) {
    val history by vm.history.collectAsStateWithLifecycle()
    var expanded by remember { mutableStateOf<String?>(null) }
    val conflict by vm.undoConflict.collectAsStateWithLifecycle()
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (history.isEmpty()) item { EmptyState(Icons.Outlined.History, "No changes yet", "Fixes and edits you apply appear here and can be undone.") }
        items(history, key = { it.changeSet.id }) { rec ->
            val set = rec.changeSet
            SectionCard(
                set.title,
                subtitle = "${DateFormat.getDateTimeInstance().format(Date(rec.appliedAt))} · ${set.changes.size} file(s) · ${if (rec.state == ChangeState.APPLIED) "applied" else "undone"}",
            ) {
                if (set.description.isNotEmpty()) Text(set.description, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (rec.state == ChangeState.APPLIED) {
                        FilledTonalButton(onClick = { vm.undo(rec) }) { Icon(Icons.AutoMirrored.Outlined.Undo, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Undo") }
                    }
                    TextButton(onClick = { expanded = if (expanded == set.id) null else set.id }) { Text(if (expanded == set.id) "Hide diff" else "Show diff") }
                }
                if (expanded == set.id) {
                    set.changes.forEach { c ->
                        Spacer(Modifier.height(8.dp))
                        FileDiffView(Diff.structured(c))
                    }
                }
            }
        }
    }
    conflict?.let { rec ->
        ConfirmDialog(
            title = "Undo and discard later edits?",
            text = "Files touched by \"${rec.changeSet.title}\" were edited afterwards. Undoing now restores the original content and discards those later edits.",
            confirmLabel = "Undo anyway",
            destructive = true,
            onConfirm = { vm.undoConflict.value = null; vm.undo(rec, force = true) },
            onDismiss = { vm.undoConflict.value = null },
        )
    }
}

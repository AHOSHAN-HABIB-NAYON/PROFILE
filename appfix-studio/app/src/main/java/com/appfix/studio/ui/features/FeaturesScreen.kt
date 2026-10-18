@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.features

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Celebration
import androidx.compose.material.icons.outlined.ContactMail
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.analysis.Severity
import com.appfix.core.generator.FeatureGenerator
import com.appfix.core.generator.FeatureKind
import com.appfix.core.generator.FeatureOptions
import com.appfix.core.generator.GeneratedFeature
import com.appfix.core.patch.Diff
import com.appfix.core.util.CancelToken
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.components.IconBadge
import com.appfix.studio.ui.components.SectionCard
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class FeatureInfo(val kind: FeatureKind, val icon: ImageVector, val description: String)

private val features = listOf(
    FeatureInfo(FeatureKind.ABOUT, Icons.Outlined.Info, "App name, version from the build, and a short description."),
    FeatureInfo(FeatureKind.CONTACT, Icons.Outlined.ContactMail, "Email and website buttons that open the right apps."),
    FeatureInfo(FeatureKind.PRIVACY, Icons.Outlined.PrivacyTip, "Your privacy policy text, with an optional link to the full policy."),
    FeatureInfo(FeatureKind.HELP, Icons.AutoMirrored.Outlined.HelpOutline, "A simple FAQ with questions you can edit."),
    FeatureInfo(FeatureKind.SETTINGS, Icons.Outlined.Settings, "Dark theme and notification switches saved on the device."),
    FeatureInfo(FeatureKind.ONBOARDING, Icons.Outlined.Celebration, "Three intro pages shown once, the first time the app starts."),
)

@Composable
fun FeaturesScreen(projectId: String, onBack: () -> Unit) {
    val container = appContainer()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var form by remember { mutableStateOf<FeatureKind?>(null) }
    var result by remember { mutableStateOf<GeneratedFeature?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }
    var validation by remember { mutableStateOf<List<String>?>(null) }

    fun prepare(kind: FeatureKind, options: FeatureOptions) {
        working = true
        error = null
        scope.launch {
            try {
                result = withContext(Dispatchers.IO) {
                    val info = container.projects.refreshProjectInfo(projectId)
                    FeatureGenerator(container.storage.workspace(projectId), info).generate(kind, options)
                }
            } catch (e: Exception) {
                error = e.message
            } finally {
                working = false
            }
        }
    }

    fun apply(g: GeneratedFeature) {
        working = true
        scope.launch {
            try {
                container.projects.applyChange(projectId, g.change, settings.autoBackupBeforeChanges)
                result = null
                // Validate with the same static checks used by the Repair center.
                val report = container.projects.analyze(projectId, CancelToken.NONE)
                val touched = g.change.changes.map { it.path }.toSet()
                val problems = report.findings.filter { it.severity == Severity.ERROR }
                validation = if (problems.isEmpty()) {
                    listOf("Static checks found no errors.", "Static checks cannot prove the code compiles — build the project to confirm.")
                } else {
                    problems.map { (if (it.file in touched) "New file: " else "") + it.title + (it.file?.let { f -> " ($f)" } ?: "") }
                }
            } catch (e: Exception) {
                snackbar.showSnackbar("Could not apply: ${e.message}")
            } finally {
                working = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add a feature") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text(
                    "AppFix Studio inspects the project (language, XML or Compose, AppCompat), shows a plan and the exact changes, and writes nothing until you apply them.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (working) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            error?.let { item { ErrorCard(it) } }
            validation?.let { v -> item { SectionCard("Validation", subtitle = "After applying the feature") { BulletList(v) } } }
            items(features, key = { it.kind.name }) { f ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
                    border = CardDefaults.outlinedCardBorder(),
                ) {
                    Row(Modifier.fillMaxWidth().clickable(enabled = !working, role = Role.Button) { form = f.kind; validation = null }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(f.icon, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(f.kind.displayName, style = MaterialTheme.typography.titleMedium)
                            Text(f.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            item {
                Text(
                    "Supported: native Android projects with Kotlin or Java and XML layouts, and Kotlin Compose projects. New screens are separate activities, so existing navigation is never removed.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    form?.let { kind ->
        FeatureForm(kind, onDismiss = { form = null }) { options -> form = null; prepare(kind, options) }
    }
    result?.let { g ->
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { result = null }, sheetState = sheet) {
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text(g.change.title, style = MaterialTheme.typography.titleLarge) }
                item { SectionCard("Plan") { BulletList(g.plan) } }
                if (g.warnings.isNotEmpty()) item { SectionCard("Notes") { BulletList(g.warnings) } }
                items(g.change.changes, key = { it.path }) { FileDiffView(Diff.structured(it)) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { apply(g) }, enabled = !working) { Text("Apply ${g.change.changes.size} changes") }
                        OutlinedButton(onClick = { result = null }) { Text("Discard") }
                    }
                }
            }
        }
    }
}

@Composable
private fun FeatureForm(kind: FeatureKind, onDismiss: () -> Unit, onPrepare: (FeatureOptions) -> Unit) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var website by remember { mutableStateOf("") }
    var policy by remember { mutableStateOf("") }
    var entry by remember { mutableStateOf(true) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(kind.displayName) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Screen title (optional)") }, singleLine = true)
                if (kind == FeatureKind.ABOUT || kind == FeatureKind.CONTACT || kind == FeatureKind.ONBOARDING) {
                    OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description (optional)") }, minLines = 2)
                }
                if (kind == FeatureKind.CONTACT || kind == FeatureKind.HELP) {
                    OutlinedTextField(value = email, onValueChange = { email = it.trim() }, label = { Text("Email address") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                }
                if (kind == FeatureKind.CONTACT || kind == FeatureKind.PRIVACY) {
                    OutlinedTextField(value = website, onValueChange = { website = it.trim() }, label = { Text(if (kind == FeatureKind.PRIVACY) "Full policy URL (optional)" else "Website") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                }
                if (kind == FeatureKind.PRIVACY) {
                    OutlinedTextField(value = policy, onValueChange = { policy = it }, label = { Text("Policy text (optional)") }, minLines = 3)
                }
                if (kind != FeatureKind.ONBOARDING) Row(Modifier.toggleable(value = entry, role = Role.Checkbox, onValueChange = { entry = it }), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = entry, onCheckedChange = null)
                    Text("Add a button to the main screen that opens it (XML layouts only)", modifier = Modifier.padding(start = 8.dp))
                }
                Spacer(Modifier.height(4.dp))
            }
        },
        confirmButton = {
            Button(onClick = { onPrepare(FeatureOptions(title.trim(), description.trim(), email, website, policy.trim(), entry)) }) { Text("Prepare changes") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

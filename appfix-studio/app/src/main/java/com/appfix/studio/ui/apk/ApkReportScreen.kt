@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.apk

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.appfix.core.apk.ApkReport
import com.appfix.core.apk.Component
import com.appfix.core.util.formatBytes
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.CodeBlock
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.components.StatusPill
import com.appfix.studio.ui.theme.CodeTextStyle
import com.appfix.studio.ui.theme.LocalStatusColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun ApkReportScreen(projectId: String, onBack: () -> Unit) {
    val container = appContainer()
    val report by produceState<ApkReport?>(null, projectId) {
        value = withContext(Dispatchers.IO) { container.projects.apkReport(projectId) }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("APK report") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        val r = report
        if (r == null) {
            Text("Loading…", Modifier.padding(padding).padding(16.dp))
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            r.manifestError?.let { item { ErrorCard(it) } }
            r.resourceTableError?.let { item { ErrorCard(it) } }
            item {
                SectionCard("File", icon = Icons.Outlined.Storage) {
                    InfoRow("Name", r.fileName)
                    InfoRow("Size", formatBytes(r.sizeBytes))
                    InfoRow("Entries", r.entryCount.toString())
                    InfoRow("SHA-256", r.sha256, mono = true)
                    InfoRow("DEX files", r.dexFiles.joinToString().ifEmpty { "none" })
                    InfoRow("Icon", r.iconPaths.firstOrNull(), mono = true)
                }
            }
            r.manifest?.let { m ->
                item {
                    SectionCard("Manifest", icon = Icons.Outlined.Description) {
                        InfoRow("Package", m.packageName, mono = true)
                        InfoRow("Version", "${m.versionName ?: "—"} (code ${m.versionCode ?: "—"})")
                        InfoRow("Min SDK", m.minSdk?.toString())
                        InfoRow("Target SDK", m.targetSdk?.toString())
                        InfoRow("Compile SDK", m.compileSdk?.toString())
                        InfoRow("Launcher", m.launcherActivity, mono = true)
                        InfoRow("Application", m.applicationClass, mono = true)
                        InfoRow("Debuggable", if (m.debuggable) "Yes" else "No")
                        InfoRow("Allow backup", m.allowBackup?.let { if (it) "Yes" else "No" } ?: "default")
                        InfoRow("Cleartext HTTP", m.usesCleartextTraffic?.let { if (it) "Allowed" else "Blocked" } ?: "default")
                        if (m.testOnly) InfoRow("Test only", "Yes — cannot be installed normally")
                    }
                }
                item {
                    SectionCard("Permissions", icon = Icons.Outlined.Lock, subtitle = "${m.permissions.size} requested") {
                        if (m.permissions.isEmpty()) Text("No permissions requested.") else m.permissions.forEach { Text(it, style = CodeTextStyle, modifier = Modifier.padding(vertical = 2.dp)) }
                    }
                }
                item {
                    SectionCard("Components", icon = Icons.Outlined.Apps, subtitle = "${m.activities.size} activities · ${m.services.size} services · ${m.receivers.size} receivers · ${m.providers.size} providers") {
                        ComponentList("Activities", m.activities)
                        ComponentList("Services", m.services)
                        ComponentList("Receivers", m.receivers)
                        ComponentList("Providers", m.providers)
                    }
                }
                if (m.features.isNotEmpty()) item { SectionCard("Hardware & software features") { BulletList(m.features) } }
            }
            item {
                SectionCard("Native code", icon = Icons.Outlined.Memory) {
                    InfoRow("ABIs", r.nativeAbis.joinToString().ifEmpty { "None (runs on all CPUs)" })
                    if (r.nativeLibraries.isNotEmpty()) InfoRow("Libraries", r.nativeLibraries.joinToString(), mono = true)
                    InfoRow("Frameworks", r.frameworks.joinToString { "${it.displayName} (${it.evidence})" }.ifEmpty { "Not detected" })
                }
            }
            if (r.resourceCounts.isNotEmpty()) {
                item {
                    SectionCard("Resources", subtitle = "${r.resourceCounts.values.sum()} entries in resources.arsc") {
                        r.resourceCounts.entries.sortedByDescending { it.value }.take(14).forEach { (type, count) -> InfoRow(type, count.toString()) }
                    }
                }
            }
            item {
                SectionCard("Largest files") {
                    r.largestEntries.forEach { InfoRow(formatBytes(it.size), it.name, mono = true) }
                }
            }
            r.decodedManifestXml?.let { xml ->
                item {
                    var show by rememberSaveable { mutableStateOf(false) }
                    SectionCard("Decoded AndroidManifest.xml", subtitle = "Resource references are shown as IDs") {
                        TextButton(onClick = { show = !show }) { Text(if (show) "Hide XML" else "Show XML") }
                        if (show) {
                            val lines = xml.lines()
                            CodeBlock(lines.take(3000).joinToString("\n") + if (lines.size > 3000) "\n… ${lines.size - 3000} more lines" else "")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ComponentList(title: String, items: List<Component>) {
    if (items.isEmpty()) return
    val status = LocalStatusColors.current
    Spacer(Modifier.height(6.dp))
    Text(title, style = MaterialTheme.typography.labelLarge)
    Column {
        items.take(60).forEach { c ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(c.name, style = CodeTextStyle, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(6.dp))
                when (c.exported) {
                    true -> StatusPill("exported", status.warningContainer, status.warning)
                    false -> StatusPill("private", MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.onSurfaceVariant)
                    null -> if (c.hasIntentFilter) StatusPill("implicit", status.warningContainer, status.warning)
                }
            }
        }
        if (items.size > 60) Text("…and ${items.size - 60} more", style = MaterialTheme.typography.bodySmall)
    }
}

@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.util.formatBytes
import com.appfix.studio.BuildConfig
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.data.settings.ThemeMode
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.SectionCard
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SettingsScreen(onOpenLimitations: () -> Unit) {
    val container = appContainer()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()
    var storageRefresh by remember { mutableStateOf(0) }
    val usage by produceState(-1L to -1L, storageRefresh) {
        value = withContext(Dispatchers.IO) { container.storage.sizeOf(container.storage.root) to container.storage.sizeOf(container.storage.tempDir) }
    }
    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                SectionCard("Appearance", icon = Icons.Outlined.Palette) {
                    Text("Theme", style = MaterialTheme.typography.labelLarge)
                    ThemeMode.entries.forEach { mode ->
                        Row(
                            Modifier.fillMaxWidth().selectable(selected = settings.themeMode == mode, role = Role.RadioButton) { scope.launch { container.settings.setThemeMode(mode) } }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = settings.themeMode == mode, onClick = null)
                            Text(when (mode) { ThemeMode.LIGHT -> "Light"; ThemeMode.DARK -> "Dark"; ThemeMode.SYSTEM -> "Follow system" }, modifier = Modifier.padding(start = 12.dp))
                        }
                    }
                    SwitchRow("Dynamic colour (Android 12+)", "Use colours from your wallpaper", settings.dynamicColor) { v -> scope.launch { container.settings.setDynamicColor(v) } }
                }
            }
            item {
                SectionCard("Editing", icon = Icons.Outlined.Code) {
                    SwitchRow("Back up before larger fixes", "Creates a full backup when a fix changes 3 or more files", settings.autoBackupBeforeChanges) { v -> scope.launch { container.settings.setAutoBackup(v) } }
                    SwitchRow("Wrap long lines", "Used by the code editor", settings.editorWordWrap) { v -> scope.launch { container.settings.setEditorWordWrap(v) } }
                    Spacer(Modifier.height(6.dp))
                    Text("Editor font size: ${settings.editorFontSize} sp", style = MaterialTheme.typography.bodyMedium)
                    Slider(
                        value = settings.editorFontSize.toFloat(),
                        onValueChange = { v -> scope.launch { container.settings.setEditorFontSize(v.toInt()) } },
                        valueRange = 10f..24f,
                        steps = 13,
                    )
                }
            }
            item {
                SectionCard("Storage", icon = Icons.Outlined.Storage, subtitle = "All projects are stored privately inside the app") {
                    InfoRow("Projects", if (usage.first < 0) "…" else formatBytes(usage.first))
                    InfoRow("Temporary files", if (usage.second < 0) "…" else formatBytes(usage.second))
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = { scope.launch { withContext(Dispatchers.IO) { container.storage.clearTemp() }; storageRefresh++ } }) { Text("Clear temporary files") }
                }
            }
            item {
                SectionCard("Builds & AI", subtitle = "Planned for later phases") {
                    BulletList(
                        listOf(
                            "Cloud builds will run on a GitHub Actions or Linux build worker you control. They are not available yet, so no build button is shown.",
                            "The AI assistant will use a provider you configure, with keys kept on a backend — never inside the app.",
                        ),
                    )
                }
            }
            item {
                SectionCard("About", icon = Icons.Outlined.Info) {
                    InfoRow("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                    InfoRow("Package", BuildConfig.APPLICATION_ID, mono = true)
                    Text(
                        "Use AppFix Studio only with apps you own or are authorised to modify. It does not bypass signatures, licences or security controls.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = onOpenLimitations) { Text("Security & compatibility limitations") }
                }
            }
        }
    }
}

@Composable
private fun SwitchRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Switch, onValueChange = onChange).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
fun LimitationsScreen(onBack: () -> Unit) {
    val sections = listOf(
        "What static analysis can and cannot do" to listOf(
            "Findings are labelled Confirmed (provably wrong), Likely (depends on things we cannot see, such as library resources) or Suggestion.",
            "Static checks cannot detect every runtime problem. A clean report does not mean the app works — build and test it.",
            "Gradle scripts are read with pattern matching and are never executed on your device.",
        ),
        "APK files" to listOf(
            "APK inspection decodes the binary manifest, resource table and signing blocks. The original APK is never modified.",
            "Decompiled Java/Kotlin (for example from JADX) is not the original source and is usually not rebuildable.",
            "Flutter, React Native, Unity and Xamarin apps keep their logic in compiled Dart, JavaScript, IL2CPP or .NET code that cannot be meaningfully edited from an APK. Use the original source project.",
            "Rebuilding an APK invalidates its signature. A re-signed APK cannot update an installed copy signed with a different key, and apps with signature or integrity checks may stop working.",
            "AppFix Studio does not implement signature bypass, licence circumvention or security-control evasion.",
        ),
        "Building" to listOf(
            "A phone cannot reliably run the full Android SDK and Gradle toolchain, so builds are done by CI or a cloud build worker (planned).",
            "To publish an update to an existing Play Store app you must sign it with the same key (or use Play App Signing with the correct upload key).",
        ),
        "Import safety" to listOf(
            "ZIP imports reject absolute paths and '..' traversal, never create symbolic links, and enforce size, count and compression-ratio limits.",
            "Windows executables and scripts (.exe, .bat, .ps1, …) are skipped. Nothing imported is ever executed on the device.",
            "GitHub tokens are used for a single download and are never stored.",
        ),
    )
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Limitations") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            sections.forEach { (title, items) -> item { SectionCard(title) { BulletList(items) } } }
        }
    }
}

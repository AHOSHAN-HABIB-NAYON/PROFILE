@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.settings

import android.os.Build
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Animation
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Colorize
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Mail
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.BugReport
import androidx.compose.material.icons.rounded.PrivacyTip
import androidx.compose.material.icons.rounded.Gavel
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.brand.Brand
import com.webtecit.filepilot.core.designsystem.SettingsRow
import com.webtecit.filepilot.core.designsystem.SwitchRow
import com.webtecit.filepilot.core.designsystem.swatch
import com.webtecit.filepilot.core.preferences.AccentColor
import com.webtecit.filepilot.core.preferences.StartLocation
import com.webtecit.filepilot.core.preferences.ThemeMode
import com.webtecit.filepilot.core.preferences.ViewMode
import com.webtecit.filepilot.feature.browser.SortDialog
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    onOpenPermissions: () -> Unit,
    onOpenAbout: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val fullAccess by viewModel.fullAccess.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var sortOpen by remember { mutableStateOf(false) }
    var startOpen by remember { mutableStateOf(false) }
    var licensesOpen by remember { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        viewModel.refreshAccess()
        onPauseOrDispose { }
    }
    fun show(message: String?) {
        if (message != null) scope.launch { snackbar.showSnackbar(message) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).testTag("settings_list"),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Settings, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(34.dp))
                    Spacer(Modifier.size(12.dp))
                    Column {
                        Text("Settings", style = MaterialTheme.typography.headlineMedium)
                        Text("Customize your app experience", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            item {
                Section("Appearance", "Personalize the look", Icons.Rounded.Palette) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text("Theme", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ThemeMode.entries.forEach { mode ->
                                val selected = prefs.themeMode == mode
                                val icon = when (mode) {
                                    ThemeMode.LIGHT -> Icons.Rounded.LightMode
                                    ThemeMode.DARK -> Icons.Rounded.DarkMode
                                    ThemeMode.SYSTEM -> Icons.Rounded.Settings
                                }
                                androidx.compose.material3.Surface(
                                    onClick = { viewModel.setTheme(mode) },
                                    shape = CircleShape,
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerLowest,
                                    border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                    shadowElevation = if (selected) 3.dp else 0.dp,
                                    modifier = Modifier.weight(1f).height(44.dp),
                                ) {
                                    Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                                        val fg = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                        if (selected) Icon(Icons.Rounded.Check, null, tint = fg, modifier = Modifier.size(16.dp))
                                        Icon(icon, null, tint = if (selected) fg else MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp).size(18.dp))
                                        Text(mode.label, color = fg, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 6.dp))
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                        Spacer(Modifier.height(12.dp))
                        Text("Accent colour", style = MaterialTheme.typography.titleSmall)
                        Text("Choose your favourite colour", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            AccentColor.entries.forEach { accent ->
                                Swatch(
                                    color = accent.swatch(),
                                    label = accent.label,
                                    selected = prefs.accent == accent && !prefs.dynamicColor,
                                    onClick = {
                                        viewModel.setAccent(accent)
                                        if (prefs.dynamicColor) viewModel.setDynamic(false)
                                    },
                                )
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        SwitchRow(
                            "Dynamic colour",
                            prefs.dynamicColor,
                            viewModel::setDynamic,
                            subtitle = "Use colours from your wallpaper",
                            icon = Icons.Rounded.Colorize,
                        )
                    }
                    SwitchRow(
                        "Animations",
                        prefs.animations,
                        viewModel::setAnimations,
                        subtitle = "Screen transitions and motion",
                        icon = Icons.Rounded.Animation,
                    )
                    SwitchRow(
                        "Smooth scrolling",
                        prefs.highRefreshRate,
                        viewModel::setHighRefresh,
                        subtitle = "Use your display's highest refresh rate (90/120 Hz) when available",
                        icon = Icons.Rounded.Speed,
                    )
                }
            }
            item {
                Section("File manager", "File management options", Icons.Rounded.Folder) {
                    SwitchRow("Show hidden files", prefs.showHidden, viewModel::setShowHidden, subtitle = "Names starting with a dot", icon = Icons.Rounded.Visibility)
                    SwitchRow("Recycle Bin", prefs.recycleBin, viewModel::setRecycleBin,
                        subtitle = "Keep deleted files for 30 days so they can be restored", icon = Icons.Rounded.Restore)
                    SwitchRow("Show file extensions", prefs.showExtensions, viewModel::setShowExtensions, subtitle = "For example .jpg and .pdf", icon = Icons.Rounded.Extension)
                    SwitchRow(
                        "Grid view",
                        prefs.viewMode == ViewMode.GRID,
                        { viewModel.setViewMode(if (it) ViewMode.GRID else ViewMode.LIST) },
                        subtitle = "Show folders as tiles instead of a list",
                        icon = Icons.Rounded.GridView,
                    )
                    SettingsRow(
                        "Default sorting",
                        subtitle = "${prefs.sortOrder.field.label}, " +
                            (if (prefs.sortOrder.ascending) "ascending" else "descending") +
                            (if (prefs.sortOrder.foldersFirst) ", folders first" else ""),
                        icon = Icons.AutoMirrored.Rounded.Sort,
                        onClick = { sortOpen = true },
                    )
                    SettingsRow(
                        "Open Files tab in",
                        subtitle = prefs.startLocation.label,
                        icon = Icons.Rounded.Home,
                        onClick = { startOpen = true },
                    )
                }
            }
            item {
                Section("Code editor", "Code Studio preferences", Icons.Rounded.Code) {
                    ChoiceRow("Editor theme", com.webtecit.filepilot.core.preferences.EditorTheme.entries, prefs.editorTheme, { it.label }, viewModel::setEditorTheme)
                    ChoiceRow("Font", com.webtecit.filepilot.core.preferences.EditorFont.entries, prefs.editorFont, { it.label }, viewModel::setEditorFont)
                    ChoiceRow("Font size", listOf(12, 13, 14, 15, 16, 18, 20), prefs.editorFontSize, { "$it" }, viewModel::setEditorFontSize)
                    ChoiceRow("Tab size", listOf(2, 4, 8), prefs.editorTabSize, { "$it spaces" }, viewModel::setEditorTabSize)
                    SwitchRow("Line numbers", prefs.editorLineNumbers, viewModel::setEditorLineNumbers)
                    SwitchRow("Word wrap", prefs.editorWrap, viewModel::setEditorWrap)
                    SwitchRow("Auto indentation", prefs.editorAutoIndent, viewModel::setEditorAutoIndent)
                    SwitchRow("Auto save", prefs.editorAutoSave, viewModel::setEditorAutoSave, subtitle = "Save a few seconds after you stop typing. Drafts are always kept.")
                }
            }
            item {
                Section("HTML preview", "Website preview options", Icons.Rounded.Language) {
                    ChoiceRow("Default device", com.webtecit.filepilot.core.preferences.PreviewDevice.entries, prefs.previewDevice, { it.label }, viewModel::setPreviewDevice)
                    SwitchRow("Open console automatically", prefs.previewConsole, viewModel::setPreviewConsole,
                        subtitle = "Websites run offline inside the app; nothing is reachable from the network.")
                }
            }
            item {
                Section("Privacy & security", "Lock and permissions", Icons.Rounded.Security) {
                    SwitchRow(
                        "App lock",
                        prefs.appLock && com.webtecit.filepilot.core.security.VaultKeys.hasPin(context),
                        { on ->
                            if (on && !com.webtecit.filepilot.core.security.VaultKeys.hasPin(context)) show("Create a PIN in Tools → Secure Folder first.")
                            else viewModel.setAppLock(on)
                        },
                        subtitle = "Ask for your PIN or fingerprint when FilePilot opens",
                        icon = Icons.Rounded.Security,
                    )
                    SettingsRow(
                        "Permission manager",
                        subtitle = if (fullAccess) "Access to all files: allowed" else "Access to all files: not allowed",
                        icon = Icons.Rounded.Security,
                        onClick = onOpenPermissions,
                    )
                }
            }
            item {
                Section("Support", "Get help and share", Icons.Rounded.Mail) {
                    SettingsRow("Contact support", subtitle = Brand.SUPPORT_EMAIL, icon = Icons.Rounded.Mail, onClick = {
                        show(Brand.email(context, "${Brand.APP_NAME} support"))
                    })
                    SettingsRow("Report a problem", subtitle = "Describe what happened and we'll look into it", icon = Icons.Rounded.BugReport, onClick = {
                        show(
                            Brand.email(
                                context,
                                "${Brand.APP_NAME} problem report",
                                "What happened:\n\nSteps to reproduce:\n\n" +
                                    "Device: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n",
                            ),
                        )
                    })
                    SettingsRow("Share app", icon = Icons.Rounded.Share, onClick = { show(Brand.shareApp(context)) })
                }
            }
            item {
                Section("Legal", "Policies and licenses", Icons.Rounded.Gavel) {
                    SettingsRow("Privacy Policy", icon = Icons.Rounded.PrivacyTip, onClick = { show(Brand.openUrl(context, Brand.PRIVACY_URL)) })
                    SettingsRow("Terms & Conditions", icon = Icons.Rounded.Gavel, onClick = { show(Brand.openUrl(context, Brand.TERMS_URL)) })
                    SettingsRow("Disclaimer", icon = Icons.Rounded.Info, onClick = { show(Brand.openUrl(context, Brand.DISCLAIMER_URL)) })
                    SettingsRow("Open source licenses", icon = Icons.Rounded.Code, onClick = { licensesOpen = true })
                }
            }
            item {
                androidx.compose.material3.Surface(
                    onClick = onOpenAbout,
                    shape = RoundedCornerShape(26.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.Info, null, tint = MaterialTheme.colorScheme.onPrimary)
                        }
                        Spacer(Modifier.size(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text("About FilePilot", style = MaterialTheme.typography.titleMedium)
                            Text("Version, developer and contact", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }

    if (licensesOpen) {
        AlertDialog(
            onDismissRequest = { licensesOpen = false },
            title = { Text("Open source licenses") },
            text = {
                Column(Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState())) {
                    Brand.openSourceLicenses.forEach { (name, license) ->
                        Text(name, style = MaterialTheme.typography.titleSmall)
                        Text(license, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 10.dp))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { licensesOpen = false }) { Text("Close") } },
        )
    }
    if (sortOpen) {
        SortDialog(current = prefs.sortOrder, onApply = { viewModel.setSort(it); sortOpen = false }, onDismiss = { sortOpen = false })
    }
    if (startOpen) {
        AlertDialog(
            onDismissRequest = { startOpen = false },
            title = { Text("Open Files tab in") },
            text = {
                Column {
                    StartLocation.entries.forEach { loc ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .selectable(selected = prefs.startLocation == loc, role = Role.RadioButton) {
                                    viewModel.setStartLocation(loc)
                                    startOpen = false
                                }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = prefs.startLocation == loc, onClick = null)
                            Spacer(Modifier.size(12.dp))
                            Text(loc.label)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { startOpen = false }) { Text("Close") } },
        )
    }
}

@Composable
private fun <T> ChoiceRow(title: String, options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    SettingsRow(title, subtitle = label(selected), icon = Icons.Rounded.Tune, onClick = { open = true })
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(title) },
            text = {
                Column {
                    options.forEach { o ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .selectable(selected = o == selected, role = Role.RadioButton) { onSelect(o); open = false }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = o == selected, onClick = null)
                            Spacer(Modifier.size(12.dp))
                            Text(label(o))
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text("Close") } },
        )
    }
}

@Composable
private fun Section(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, content: @Composable () -> Unit) {
    androidx.compose.material3.Surface(
        shape = RoundedCornerShape(26.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 3.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(vertical = 6.dp)) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
                Spacer(Modifier.size(14.dp))
                Column {
                    Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            content()
        }
    }
}

@Composable
private fun Swatch(color: Color, label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .clip(CircleShape)
            .border(if (selected) 2.dp else 0.dp, if (selected) color else Color.Transparent, CircleShape)
            .padding(if (selected) 4.dp else 0.dp)
            .clip(CircleShape)
            .background(color)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = "$label accent" + if (selected) ", selected" else "" },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.White)
    }
}

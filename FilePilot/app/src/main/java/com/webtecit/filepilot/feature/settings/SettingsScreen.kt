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
    LifecycleResumeEffect(Unit) {
        viewModel.refreshAccess()
        onPauseOrDispose { }
    }
    fun show(message: String?) {
        if (message != null) scope.launch { snackbar.showSnackbar(message) }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).testTag("settings_list"),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Section("Appearance") {
                    Column(Modifier.padding(16.dp)) {
                        Text("Theme", style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(8.dp))
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                            ThemeMode.entries.forEachIndexed { i, mode ->
                                SegmentedButton(
                                    selected = prefs.themeMode == mode,
                                    onClick = { viewModel.setTheme(mode) },
                                    shape = SegmentedButtonDefaults.itemShape(i, ThemeMode.entries.size),
                                ) { Text(mode.label) }
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                        Text("Accent colour", style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
                Section("File manager") {
                    SwitchRow("Show hidden files", prefs.showHidden, viewModel::setShowHidden, subtitle = "Names starting with a dot", icon = Icons.Rounded.Visibility)
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
                Section("Privacy & security") {
                    SettingsRow(
                        "Permission manager",
                        subtitle = if (fullAccess) "Access to all files: allowed" else "Access to all files: not allowed",
                        icon = Icons.Rounded.Security,
                        onClick = onOpenPermissions,
                    )
                }
            }
            item {
                Section("Support") {
                    SettingsRow("Contact support", subtitle = Brand.SUPPORT_EMAIL, icon = Icons.Rounded.Mail, onClick = {
                        show(Brand.email(context, "${Brand.APP_NAME} support"))
                    })
                    SettingsRow("Report a problem", subtitle = "Describe what happened and we'll look into it", icon = Icons.Rounded.Mail, onClick = {
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
                Section("About") {
                    SettingsRow("About FilePilot", subtitle = "Version, developer and contact", icon = Icons.Rounded.Info, onClick = onOpenAbout)
                }
            }
        }
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
private fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        Text(
            title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 8.dp),
        )
        Card(
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) { Column { content() } }
    }
}

@Composable
private fun Swatch(color: Color, label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(color)
            .border(if (selected) 3.dp else 0.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), CircleShape)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = "$label accent" + if (selected) ", selected" else "" },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.White)
    }
}

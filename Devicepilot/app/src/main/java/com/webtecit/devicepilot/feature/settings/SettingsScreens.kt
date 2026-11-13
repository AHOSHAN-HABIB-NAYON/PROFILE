package com.webtecit.devicepilot.feature.settings

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Article
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PermMedia
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.core.common.AppInfo
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.AppLogo
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.NavRow
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.ThemeMode
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.navigation.Routes
import com.webtecit.devicepilot.core.permissions.Permissions
import com.webtecit.devicepilot.core.permissions.rememberOnResumeCheck
import com.webtecit.devicepilot.core.permissions.rememberPermissionGroup
import com.webtecit.devicepilot.data.local.AppSettings
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.AppsRepository
import com.webtecit.devicepilot.data.repository.ChargingHistoryRepository
import com.webtecit.devicepilot.data.repository.MediaAccess
import com.webtecit.devicepilot.data.repository.StorageScanRepository
import com.webtecit.devicepilot.data.system.MonitorWorker
import com.webtecit.devicepilot.domain.model.FileCategory
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repo: SettingsRepository,
    private val history: ChargingHistoryRepository,
    val storage: StorageScanRepository,
    val apps: AppsRepository,
) : ViewModel() {
    val settings: StateFlow<AppSettings?> = repo.settings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun setTheme(m: ThemeMode) = launch { repo.setThemeMode(m) }
    fun setRefresh(ms: Long) = launch { repo.setRefreshInterval(ms) }
    fun setBackground(on: Boolean) = launch {
        repo.setBackgroundMonitoring(on)
        if (on) MonitorWorker.schedule(context) else MonitorWorker.cancel(context)
    }
    fun setNotifications(on: Boolean) = launch { repo.setNotificationsEnabled(on) }
    fun setCharging(on: Boolean) = launch { repo.setChargingNotifications(on) }
    fun setOverheat(on: Boolean) = launch { repo.setOverheatAlerts(on) }
    fun setStorageWarnings(on: Boolean) = launch { repo.setStorageWarnings(on) }
    fun setThreshold(mb: Int) = launch { repo.setLargeFileThreshold(mb) }
    fun toggleCategory(c: FileCategory, current: Set<FileCategory>) = launch {
        repo.setScanCategories(if (c in current) current - c else current + c)
    }
    fun clearHistory() = launch { history.clear() }
    fun resetOnboarding() = launch { repo.setOnboardingDone(false) }
    fun resetAll() = launch { history.clear(); repo.resetAll() }

    private fun launch(block: suspend () -> Unit) { viewModelScope.launch { block() } }
}

@Composable
private fun SwitchRow(title: String, subtitle: String?, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium)
            .selectable(checked, enabled = enabled, role = Role.Switch) { onChange(!checked) }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            if (subtitle != null) NoteText(subtitle)
        }
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(navigate: (String) -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    val s by viewModel.settings.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmReset by remember { mutableStateOf(false) }
    var confirmHistory by remember { mutableStateOf(false) }
    var showLicenses by remember { mutableStateOf(false) }
    val notifPerm = Permissions.notificationPermission?.let { p ->
        rememberPermissionGroup(arrayOf(p)) { granted -> viewModel.setNotifications(granted) }
    }

    DpScaffold("Settings", null) { padding ->
        val st = s ?: return@DpScaffold
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DpCard {
                    SectionHeader("Appearance")
                    listOf(ThemeMode.LIGHT to "Light", ThemeMode.DARK to "Dark", ThemeMode.SYSTEM to "System default").forEach { (mode, label) ->
                        Row(
                            Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium)
                                .selectable(st.themeMode == mode, role = Role.RadioButton) { viewModel.setTheme(mode) }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = st.themeMode == mode, onClick = null)
                            Spacer(Modifier.width(Spacing.sm))
                            Text(label, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("Monitoring")
                    Text("Refresh interval", style = MaterialTheme.typography.bodyLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        listOf(1_000L to "1 s", 2_000L to "2 s", 5_000L to "5 s").forEach { (ms, l) ->
                            FilterChip(st.refreshIntervalMs == ms, { viewModel.setRefresh(ms) }, label = { Text(l) })
                        }
                    }
                    NoteText("How often live screens update. Longer intervals use less battery. Monitoring stops when you leave a screen.")
                    Spacer(Modifier.height(Spacing.sm))
                    SwitchRow("Battery monitoring", "Checks battery, temperature and storage every 15 minutes in the background for alerts and charging history.", st.backgroundMonitoring, onChange = viewModel::setBackground)
                }
            }
            item {
                DpCard {
                    SectionHeader("Storage")
                    Text("Large file size", style = MaterialTheme.typography.bodyLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        listOf(50, 100, 250, 500).forEach { mb ->
                            FilterChip(st.largeFileThresholdMb == mb, { viewModel.setThreshold(mb) }, label = { Text("$mb MB") })
                        }
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    Text("Categories to show", style = MaterialTheme.typography.bodyLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        FileCategory.entries.forEach { c ->
                            FilterChip(c in st.scanCategories, { viewModel.toggleCategory(c, st.scanCategories) }, label = { Text(c.label) })
                        }
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("Notifications")
                    val systemAllowed = notifPerm?.granted ?: true
                    SwitchRow("Enable notifications", if (!systemAllowed) "Android will ask for permission" else null, st.notificationsEnabled && systemAllowed) { on ->
                        if (on && notifPerm != null && !notifPerm.granted) notifPerm.request() else viewModel.setNotifications(on)
                    }
                    val enabled = st.notificationsEnabled && systemAllowed
                    SwitchRow("Charging notifications", "Charger connected / disconnected and fully charged", st.chargingNotifications, enabled, viewModel::setCharging)
                    SwitchRow("Overheating alerts", "When the battery reaches ${MonitorWorker.OVERHEAT_C.toInt()} °C (at most once an hour)", st.overheatAlerts, enabled, viewModel::setOverheat)
                    SwitchRow("Storage warnings", "When less than 10% storage is free (at most once a day)", st.storageWarnings, enabled, viewModel::setStorageWarnings)
                    TextButton(onClick = { SystemIntents.appNotifications(context) }) { Text("System notification settings") }
                }
            }
            item {
                DpCard {
                    SectionHeader("Privacy")
                    NavRow(Icons.Default.Policy, "Privacy Policy") { navigate(Routes.legal("privacy")) }
                    NavRow(Icons.Default.Gavel, "Terms & Conditions") { navigate(Routes.legal("terms")) }
                    NavRow(Icons.Default.Warning, "Disclaimer") { navigate(Routes.legal("disclaimer")) }
                    NavRow(Icons.Default.Shield, "Permissions", "What Devicepilot can access and why") { navigate(Routes.PERMISSIONS) }
                    HorizontalDivider(Modifier.padding(vertical = Spacing.sm))
                    Text("Your data", style = MaterialTheme.typography.titleSmall)
                    NoteText("All data stays on this phone: settings and charging history. Uninstalling removes everything.")
                    Spacer(Modifier.height(Spacing.xs))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        OutlinedButton(onClick = { confirmHistory = true }) { Text("Clear charging history") }
                        OutlinedButton(onClick = viewModel::resetOnboarding) { Text("Show intro again") }
                        OutlinedButton(onClick = { confirmReset = true }) { Text("Reset all settings") }
                    }
                }
            }
            item {
                DpCard {
                    SectionHeader("About")
                    InfoRow("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                    InfoRow("Developer", AppInfo.DEVELOPER)
                    NavRow(Icons.Default.Info, "About ${AppInfo.NAME}") { navigate(Routes.ABOUT) }
                    NavRow(Icons.Default.Language, "Website", AppInfo.WEBSITE.removePrefix("https://")) { SystemIntents.web(context, AppInfo.WEBSITE) }
                    NavRow(Icons.Default.Mail, "Contact developer", "Through ${AppInfo.WEBSITE.removePrefix("https://")}") { SystemIntents.web(context, AppInfo.WEBSITE) }
                    NavRow(Icons.Default.Star, "Rate the app") { SystemIntents.playStore(context) }
                    NavRow(Icons.Default.Share, "Share the app") {
                        SystemIntents.shareText(context, AppInfo.NAME, "${AppInfo.NAME} — ${AppInfo.SUBTITLE}\nhttps://play.google.com/store/apps/details?id=${context.packageName}")
                    }
                    NavRow(Icons.AutoMirrored.Filled.Article, "Open source licenses") { showLicenses = true }
                }
            }
        }
    }

    if (confirmHistory) ConfirmDialog("Clear charging history?", "All recorded charging sessions will be deleted.", "Clear", { viewModel.clearHistory(); confirmHistory = false }) { confirmHistory = false }
    if (confirmReset) ConfirmDialog("Reset all settings?", "Theme, notification and storage preferences and charging history will be reset. You will see the introduction again.", "Reset", { viewModel.resetAll(); confirmReset = false }) { confirmReset = false }
    if (showLicenses) {
        AlertDialog(
            onDismissRequest = { showLicenses = false },
            confirmButton = { TextButton(onClick = { showLicenses = false }) { Text("Close") } },
            title = { Text("Open source licenses") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    LegalTexts.licenses.forEach { (lib, lic) ->
                        Text(lib, style = MaterialTheme.typography.titleSmall)
                        NoteText(lic, Modifier.padding(bottom = Spacing.sm))
                    }
                    NoteText("Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0")
                }
            },
        )
    }
}

@Composable
private fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ------------------------------------------------------------------------------------ about

@Composable
fun AboutScreen(onBack: () -> Unit, navigate: (String) -> Unit) {
    val context = LocalContext.current
    DpScaffold("About", onBack) { padding ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = padding.calculateTopPadding()).padding(Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            AppLogo(88.dp)
            Text(AppInfo.NAME, style = MaterialTheme.typography.headlineMedium)
            Text(AppInfo.SUBTITLE, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            NoteText("Version ${BuildConfig.VERSION_NAME}")
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.developer_photo), contentDescription = "Photo of ${AppInfo.DEVELOPER}", modifier = Modifier.size(64.dp).clip(CircleShape))
                    Spacer(Modifier.width(Spacing.md))
                    Column {
                        NoteText("Developed by")
                        Text(AppInfo.DEVELOPER, style = MaterialTheme.typography.titleMedium)
                        Text(AppInfo.COMPANY, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.height(Spacing.sm))
                OutlinedButton(onClick = { SystemIntents.web(context, AppInfo.WEBSITE) }, modifier = Modifier.fillMaxWidth()) {
                    Text(AppInfo.WEBSITE.removePrefix("https://"))
                }
            }
            DpCard {
                Text("Built on honesty", style = MaterialTheme.typography.titleSmall)
                NoteText("${AppInfo.NAME} shows only what Android really reports. No fake boosts, no fake scans, no ads and no tracking. When your phone does not share a value, the app says so.")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = { navigate(Routes.legal("privacy")) }) { Text("Privacy") }
                TextButton(onClick = { navigate(Routes.legal("terms")) }) { Text("Terms") }
                TextButton(onClick = { navigate(Routes.legal("disclaimer")) }) { Text("Disclaimer") }
            }
            NoteText("© 2026 ${AppInfo.COMPANY}. All rights reserved.", Modifier.fillMaxWidth().padding(top = Spacing.sm))
        }
    }
}

// ------------------------------------------------------------------------------------ legal

@Composable
fun LegalScreen(doc: String, onBack: () -> Unit) {
    val (title, text) = when (doc) {
        "terms" -> "Terms & Conditions" to LegalTexts.terms
        "disclaimer" -> "Disclaimer" to LegalTexts.disclaimer
        else -> "Privacy Policy" to LegalTexts.privacy
    }
    DpScaffold(title, onBack) { padding ->
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = padding.calculateTopPadding()).padding(Spacing.lg)) {
            DpCard {
                Text(text, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

// ------------------------------------------------------------------------------------ permissions

@Composable
fun PermissionsScreen(onBack: () -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val media = rememberOnResumeCheck { viewModel.storage.mediaAccess() }
    val usage = rememberOnResumeCheck { viewModel.apps.hasUsageAccess() }
    val notif = rememberOnResumeCheck { Permissions.notificationPermission?.let { Permissions.isGranted(context, it) } ?: true }
    val folders = rememberOnResumeCheck { viewModel.storage.persistedFolders().size }

    DpScaffold("Permissions", onBack) { padding ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = padding.calculateTopPadding()).padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            NoteText("Every permission is optional. Features that need one explain why and ask only when you open them.")
            PermissionInfo(Icons.Default.Notifications, "Notifications", "Charging, overheating and storage alerts.", if (notif) "Allowed" else "Not allowed", notif) { SystemIntents.appNotifications(context) }
            PermissionInfo(Icons.Default.PermMedia, "Photos, videos & audio", "Storage Analyzer, large files and duplicates. Read on the device only.",
                when (media) { MediaAccess.FULL -> "Allowed"; MediaAccess.PARTIAL -> "Selected files only"; MediaAccess.NONE -> "Not allowed" }, media != MediaAccess.NONE) {
                SystemIntents.appDetails(context, context.packageName)
            }
            PermissionInfo(Icons.Default.BarChart, "Usage access", "App sizes and most-used apps. Special access granted in system settings.", if (usage) "Allowed" else "Off", usage) { SystemIntents.usageAccess(context) }
            PermissionInfo(Icons.Default.Lock, "Picked folders", "Folders you chose for the junk cleaner. Revoke by clearing app storage or picking again.", "$folders folder${if (folders == 1) "" else "s"}", folders > 0, null)
            DpCard {
                Text("Never requested", style = MaterialTheme.typography.titleSmall)
                NoteText("Location, contacts, camera, microphone, phone, SMS, accessibility service, all-files access and the list of every installed package. Devicepilot does not need them.")
            }
            NoteText("Internet and network-state access are normal permissions granted at install; the internet is only used for the speed test and public IP lookup you start.", Modifier.padding(bottom = Spacing.lg))
        }
    }
}

@Composable
private fun PermissionInfo(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, purpose: String, state: String, granted: Boolean, onManage: (() -> Unit)?) {
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            com.webtecit.devicepilot.core.designsystem.IconBadge(icon, MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                NoteText(purpose)
            }
        }
        Spacer(Modifier.height(Spacing.sm))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusChip(state, if (granted) Tone.GOOD else Tone.NEUTRAL)
            Spacer(Modifier.weight(1f))
            if (onManage != null) TextButton(onClick = onManage) { Text("Manage") }
        }
    }
}


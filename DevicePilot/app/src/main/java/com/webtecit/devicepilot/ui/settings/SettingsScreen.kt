package com.webtecit.devicepilot.ui.settings

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.BrightnessAuto
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.SdStorage
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.AppSettings
import com.webtecit.devicepilot.data.ThemeMode
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.TemperatureUnit
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.work.MonitorWorker
import com.webtecit.devicepilot.work.Notifier
import kotlinx.coroutines.launch

private val Blue = Color(0xFF1E6BFF)
private val Cyan = Color(0xFF12B5E5)
private val Green = Color(0xFF16A34A)
private val Amber = Color(0xFFD97706)
private val Red = Color(0xFFDC2626)
private val Violet = Color(0xFF7C3AED)
private val Slate = Color(0xFF64748B)

@Composable
fun SettingsScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val s by c.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    var showLicenses by remember { mutableStateOf(false) }
    var notifDenied by remember { mutableStateOf(false) }
    var pendingEnable by remember { mutableStateOf<(suspend () -> Unit)?>(null) }

    LaunchedEffect(s.anyNotification) { MonitorWorker.schedule(context, s.anyNotification) }

    val notifPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val action = pendingEnable
        pendingEnable = null
        notifDenied = !granted
        if (granted && action != null) scope.launch { action() }
    }

    /** Turns an alert on, asking for the notification permission first when Android requires it. */
    fun enableAlert(action: suspend () -> Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !Notifier.canPost(context)) {
            pendingEnable = action
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else scope.launch { action() }
    }

    ScreenList {
        item { AppHeader() }

        // ---------- Appearance ----------
        item {
            Group(stringResource(R.string.settings_appearance)) {
                Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ThemeTile(Icons.Outlined.BrightnessAuto, stringResource(R.string.theme_system), s.theme == ThemeMode.SYSTEM, Modifier.weight(1f)) {
                        scope.launch { c.settings.setTheme(ThemeMode.SYSTEM) }
                    }
                    ThemeTile(Icons.Outlined.LightMode, stringResource(R.string.theme_light), s.theme == ThemeMode.LIGHT, Modifier.weight(1f)) {
                        scope.launch { c.settings.setTheme(ThemeMode.LIGHT) }
                    }
                    ThemeTile(Icons.Outlined.DarkMode, stringResource(R.string.theme_dark), s.theme == ThemeMode.DARK, Modifier.weight(1f)) {
                        scope.launch { c.settings.setTheme(ThemeMode.DARK) }
                    }
                }
                Divider()
                RowHeader(Icons.Outlined.Thermostat, Amber, stringResource(R.string.settings_temp_unit), null)
                Spacer(Modifier.height(8.dp))
                Segments(listOf(TemperatureUnit.CELSIUS to R.string.unit_c, TemperatureUnit.FAHRENHEIT to R.string.unit_f),
                    s.temperatureUnit) { scope.launch { c.settings.setTemperatureUnit(it) } }
            }
        }

        // ---------- Security ----------
        item { Group(stringResource(R.string.settings_security)) { AppLockRow(s.appLockEnabled) { scope.launch { c.settings.setAppLock(it) } } } }

        // ---------- Alerts ----------
        item {
            Group(stringResource(R.string.settings_notifications), stringResource(R.string.settings_notifications_hint)) {
                if (notifDenied) {
                    Text(stringResource(R.string.notif_denied), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { SystemSettings.notificationsForThisApp(context) }) { Text(stringResource(R.string.perm_grant_in_settings)) }
                }
                SwitchRow(Icons.Outlined.Thermostat, Red, stringResource(R.string.notif_opt_temp),
                    if (s.notifyTemperature) stringResource(R.string.notif_temp_threshold, s.temperatureThresholdC) else null, s.notifyTemperature) { on ->
                    if (on) enableAlert { c.settings.setNotifyTemperature(true) } else scope.launch { c.settings.setNotifyTemperature(false) }
                }
                if (s.notifyTemperature) Slider(value = s.temperatureThresholdC.toFloat(),
                    onValueChange = { scope.launch { c.settings.setTemperatureThreshold(it.toInt()) } }, valueRange = 36f..50f, steps = 13)
                SwitchRow(Icons.Outlined.LocalFireDepartment, Amber, stringResource(R.string.notif_opt_thermal), null, s.notifyThermal) { on ->
                    if (on) enableAlert { c.settings.setNotifyThermal(true) } else scope.launch { c.settings.setNotifyThermal(false) }
                }
                SwitchRow(Icons.Outlined.SdStorage, Violet, stringResource(R.string.notif_opt_storage), null, s.notifyStorage) { on ->
                    if (on) enableAlert { c.settings.setNotifyStorage(true) } else scope.launch { c.settings.setNotifyStorage(false) }
                }
                SwitchRow(Icons.Outlined.DataUsage, Cyan, stringResource(R.string.notif_opt_data),
                    if (s.notifyData) stringResource(R.string.notif_data_threshold, Formatters.bytes(s.dataThresholdMb * 1024L * 1024L)) else null,
                    s.notifyData) { on ->
                    if (on) enableAlert { c.settings.setNotifyData(true) } else scope.launch { c.settings.setNotifyData(false) }
                }
                if (s.notifyData) {
                    Slider(value = s.dataThresholdMb.toFloat(), onValueChange = { scope.launch { c.settings.setDataThresholdMb((it / 256).toInt() * 256) } },
                        valueRange = 256f..30720f)
                    if (!c.usage.hasUsageAccess()) TextButton(onClick = { SystemSettings.usageAccess(context) }) {
                        Text(stringResource(R.string.notif_data_needs_access))
                    }
                }
                if (BuildConfig.FULL) SwitchRow(Icons.Outlined.Security, Blue, stringResource(R.string.notif_opt_firewall), null, s.notifyFirewall) { on ->
                    if (on) enableAlert { c.settings.setNotifyFirewall(true) } else scope.launch { c.settings.setNotifyFirewall(false) }
                }
            }
        }

        // ---------- Privacy & permissions ----------
        item {
            Group(stringResource(R.string.settings_privacy_group)) {
                if (BuildConfig.FULL) LinkRow(Icons.Outlined.Security, Blue, stringResource(R.string.settings_firewall_rules),
                    stringResource(R.string.firewall_rules_count, s.firewallRules.size)) { navigate(Routes.FIREWALL) }
                LinkRow(Icons.Outlined.VerifiedUser, Green, stringResource(R.string.title_permissions), stringResource(R.string.settings_permissions_sub)) {
                    navigate(Routes.PERMISSIONS)
                }
                LinkRow(Icons.Outlined.PrivacyTip, Cyan, stringResource(R.string.title_privacy), stringResource(R.string.settings_privacy_sub)) {
                    navigate(Routes.PRIVACY)
                }
                LinkRow(Icons.Outlined.Gavel, Amber, stringResource(R.string.title_disclaimer), stringResource(R.string.settings_disclaimer_sub)) {
                    navigate(Routes.DISCLAIMER)
                }
                LinkRow(Icons.Outlined.Description, Violet, stringResource(R.string.title_terms), stringResource(R.string.settings_terms_sub)) {
                    SystemSettings.url(context, com.webtecit.devicepilot.brand.Links.TERMS)
                }
            }
        }

        // ---------- About ----------
        item {
            Group(stringResource(R.string.title_about)) {
                LinkRow(Icons.Outlined.Email, Green, stringResource(R.string.contact_support), com.webtecit.devicepilot.brand.Links.SUPPORT_EMAIL) {
                    com.webtecit.devicepilot.brand.Links.emailSupport(context)
                }
                LinkRow(Icons.Outlined.Info, Blue, stringResource(R.string.title_about),
                    stringResource(R.string.settings_version, BuildConfig.VERSION_NAME)) { navigate(Routes.ABOUT) }
                LinkRow(Icons.Outlined.Description, Slate, stringResource(R.string.settings_licenses), null) { showLicenses = true }
            }
        }
        item { com.webtecit.devicepilot.brand.DeveloperCard() }
    }

    if (showLicenses) LicensesDialog { showLicenses = false }
}

/** App identity strip at the top of Settings. */
@Composable
private fun AppHeader() {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF1E6BFF), Color(0xFF0B1B3F))))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.14f))) {
            androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(52.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.app_tagline) + " · v" + BuildConfig.VERSION_NAME,
                style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
        }
        Text(stringResource(if (BuildConfig.FULL) R.string.edition_full else R.string.edition_play),
            style = MaterialTheme.typography.labelSmall, color = Color.White,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.18f)).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

@Composable
private fun Group(title: String, subtitle: String? = null, content: @Composable () -> Unit) {
    Column {
        Text(title.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp, bottom = 6.dp, top = 4.dp))
        Surface(
            shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                }
                content()
            }
        }
    }
}

@Composable
private fun Divider() {
    Spacer(Modifier.height(12.dp))
    Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun Badge(icon: ImageVector, tint: Color) {
    Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun RowHeader(icon: ImageVector, tint: Color, title: String, subtitle: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Badge(icon, tint)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SwitchRow(icon: ImageVector, tint: Color, title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Badge(icon, tint)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked, onChange)
    }
}

@Composable
private fun LinkRow(icon: ImageVector, tint: Color, title: String, subtitle: String?, onClick: () -> Unit) {
    Surface(onClick = onClick, color = Color.Transparent, shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Badge(icon, tint)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ThemeTile(icon: ImageVector, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val primary = MaterialTheme.colorScheme.primary
    Surface(
        onClick = onClick, modifier = modifier, shape = RoundedCornerShape(14.dp),
        color = if (selected) primary.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) primary else MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, tint = if (selected) primary else MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, color = if (selected) primary else MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun <T> Segments(options: List<Pair<T, Int>>, selected: T, onSelect: (T) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        options.forEachIndexed { i, (value, label) ->
            SegmentedButton(
                selected = value == selected,
                onClick = { onSelect(value) },
                shape = SegmentedButtonDefaults.itemShape(i, options.size),
                label = { Text(stringResource(label), maxLines = 1, style = MaterialTheme.typography.labelMedium) },
            )
        }
    }
}

@Composable
private fun AppLockRow(enabled: Boolean, onChange: (Boolean) -> Unit) {
    val context = LocalContext.current
    val activity = context as? androidx.fragment.app.FragmentActivity
    val availability = remember { com.webtecit.devicepilot.security.AppLock.availability(context) }
    val ready = availability == com.webtecit.devicepilot.security.LockAvailability.READY
    val title = stringResource(R.string.lock_prompt_title)
    val subtitle = stringResource(R.string.lock_confirm_subtitle)
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Badge(Icons.Outlined.Fingerprint, Green)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.lock_setting_title), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.lock_setting_sub), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = enabled && ready, enabled = ready, onCheckedChange = { on ->
            // Turning the lock on or off always requires a successful unlock first.
            if (activity != null) com.webtecit.devicepilot.security.AppLock.authenticate(activity, title, subtitle, onSuccess = { onChange(on) })
        })
    }
    if (!ready) {
        Text(stringResource(R.string.lock_unavailable), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        TextButton(onClick = {
            SystemSettings.open(context, com.webtecit.devicepilot.security.AppLock.enrollIntent(),
                android.content.Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS))
        }) { Text(stringResource(R.string.lock_set_up_screen_lock)) }
    }
}

@Composable
fun LicensesDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_licenses)) },
        text = {
            Column {
                listOf(
                    "AndroidX (Core, AppCompat, Activity, Lifecycle, Navigation, DataStore, WorkManager, SplashScreen, Biometric)",
                    "Jetpack Compose & Material 3, Material Icons",
                    "Kotlin standard library & kotlinx.coroutines",
                ).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.licenses_apache), style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_close)) } },
    )
}

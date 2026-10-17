package com.webtecit.devicepilot.ui.settings

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.NavRow
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.work.MonitorWorker
import com.webtecit.devicepilot.work.Notifier
import kotlinx.coroutines.launch

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
        item { com.webtecit.devicepilot.brand.DeveloperCard() }
        item { SectionTitle(stringResource(R.string.settings_security)) }
        item { AppLockCard(s.appLockEnabled, onChange = { scope.launch { c.settings.setAppLock(it) } }) }
        item { SectionTitle(stringResource(R.string.settings_appearance)) }
        item {
            DpCard {
                Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                Segments(listOf(ThemeMode.SYSTEM to R.string.theme_system, ThemeMode.LIGHT to R.string.theme_light,
                    ThemeMode.DARK to R.string.theme_dark), s.theme) { scope.launch { c.settings.setTheme(it) } }
                Spacer(Modifier.height(14.dp))
                Text(stringResource(R.string.settings_temp_unit), style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                Segments(listOf(TemperatureUnit.CELSIUS to R.string.unit_c, TemperatureUnit.FAHRENHEIT to R.string.unit_f),
                    s.temperatureUnit) { scope.launch { c.settings.setTemperatureUnit(it) } }
                Spacer(Modifier.height(14.dp))
                Text(stringResource(R.string.settings_refresh), style = MaterialTheme.typography.bodyMedium)
                Text(stringResource(R.string.settings_refresh_hint), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Segments(listOf(2 to R.string.refresh_2, 3 to R.string.refresh_3, 5 to R.string.refresh_5, 10 to R.string.refresh_10),
                    s.refreshSeconds) { scope.launch { c.settings.setRefreshSeconds(it) } }
            }
        }
        item { SectionTitle(stringResource(R.string.settings_notifications)) }
        item {
            DpCard {
                Text(stringResource(R.string.settings_notifications_hint), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (notifDenied) {
                    Text(stringResource(R.string.notif_denied), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { SystemSettings.notificationsForThisApp(context) }) {
                        Text(stringResource(R.string.perm_grant_in_settings))
                    }
                }
                ToggleRow(stringResource(R.string.notif_opt_temp), s.notifyTemperature) { on ->
                    if (on) enableAlert { c.settings.setNotifyTemperature(true) } else scope.launch { c.settings.setNotifyTemperature(false) }
                }
                if (s.notifyTemperature) {
                    Text(stringResource(R.string.notif_temp_threshold, s.temperatureThresholdC), style = MaterialTheme.typography.bodySmall)
                    Slider(value = s.temperatureThresholdC.toFloat(), onValueChange = { scope.launch { c.settings.setTemperatureThreshold(it.toInt()) } },
                        valueRange = 36f..50f, steps = 13)
                }
                ToggleRow(stringResource(R.string.notif_opt_thermal), s.notifyThermal) { on ->
                    if (on) enableAlert { c.settings.setNotifyThermal(true) } else scope.launch { c.settings.setNotifyThermal(false) }
                }
                ToggleRow(stringResource(R.string.notif_opt_storage), s.notifyStorage) { on ->
                    if (on) enableAlert { c.settings.setNotifyStorage(true) } else scope.launch { c.settings.setNotifyStorage(false) }
                }
                ToggleRow(stringResource(R.string.notif_opt_data), s.notifyData) { on ->
                    if (on) enableAlert { c.settings.setNotifyData(true) } else scope.launch { c.settings.setNotifyData(false) }
                }
                if (s.notifyData) {
                    val mb = s.dataThresholdMb
                    Text(stringResource(R.string.notif_data_threshold, Formatters.bytes(mb * 1024L * 1024L)), style = MaterialTheme.typography.bodySmall)
                    Slider(value = mb.toFloat(), onValueChange = { scope.launch { c.settings.setDataThresholdMb((it / 256).toInt() * 256) } },
                        valueRange = 256f..30720f)
                    if (!c.usage.hasUsageAccess()) TextButton(onClick = { SystemSettings.usageAccess(context) }) {
                        Text(stringResource(R.string.notif_data_needs_access))
                    }
                }
                ToggleRow(stringResource(R.string.notif_opt_firewall), s.notifyFirewall) { on ->
                    if (on) enableAlert { c.settings.setNotifyFirewall(true) } else scope.launch { c.settings.setNotifyFirewall(false) }
                }
            }
        }
        item { SectionTitle(stringResource(R.string.settings_more)) }
        item {
            DpCard(contentPadding = 8.dp) {
                NavRow(Icons.Outlined.Security, stringResource(R.string.settings_firewall_rules),
                    stringResource(R.string.firewall_rules_count, s.firewallRules.size)) { navigate(Routes.FIREWALL) }
                NavRow(Icons.Outlined.VerifiedUser, stringResource(R.string.title_permissions),
                    stringResource(R.string.settings_permissions_sub)) { navigate(Routes.PERMISSIONS) }
                NavRow(Icons.Outlined.PrivacyTip, stringResource(R.string.title_privacy), stringResource(R.string.settings_privacy_sub)) { navigate(Routes.PRIVACY) }
                NavRow(Icons.Outlined.Gavel, stringResource(R.string.title_disclaimer), stringResource(R.string.settings_disclaimer_sub)) { navigate(Routes.DISCLAIMER) }
                NavRow(Icons.Outlined.Description, stringResource(R.string.settings_licenses), null) { showLicenses = true }
                NavRow(Icons.Outlined.Info, stringResource(R.string.title_about),
                    stringResource(R.string.settings_version, BuildConfig.VERSION_NAME)) { navigate(Routes.ABOUT) }
            }
        }
    }

    if (showLicenses) LicensesDialog { showLicenses = false }
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
private fun ToggleRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked, onChange)
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
                    "AndroidX (Core, AppCompat, Activity, Lifecycle, Navigation, DataStore, WorkManager, SplashScreen)",
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


@Composable
private fun AppLockCard(enabled: Boolean, onChange: (Boolean) -> Unit) {
    val context = LocalContext.current
    val activity = context as? androidx.fragment.app.FragmentActivity
    val availability = remember { com.webtecit.devicepilot.security.AppLock.availability(context) }
    val ready = availability == com.webtecit.devicepilot.security.LockAvailability.READY
    val title = stringResource(R.string.lock_prompt_title)
    val subtitle = stringResource(R.string.lock_confirm_subtitle)
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.lock_setting_title), style = MaterialTheme.typography.bodyLarge)
                Text(stringResource(R.string.lock_setting_sub), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = enabled && ready, enabled = ready, onCheckedChange = { on ->
                // Turning the lock on or off always requires a successful unlock first.
                if (activity != null) com.webtecit.devicepilot.security.AppLock.authenticate(activity, title, subtitle,
                    onSuccess = { onChange(on) })
            })
        }
        if (!ready) {
            Text(stringResource(R.string.lock_unavailable), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error)
            TextButton(onClick = {
                SystemSettings.open(context, com.webtecit.devicepilot.security.AppLock.enrollIntent(),
                    android.content.Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS))
            }) { Text(stringResource(R.string.lock_set_up_screen_lock)) }
        }
    }
}

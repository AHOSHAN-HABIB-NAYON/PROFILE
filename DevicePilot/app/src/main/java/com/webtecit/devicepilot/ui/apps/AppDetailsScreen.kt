package com.webtecit.devicepilot.ui.apps

import android.text.format.DateFormat
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.BatterySaver
import androidx.compose.material.icons.outlined.DataSaverOn
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.AppEntry
import com.webtecit.devicepilot.data.AppSize
import com.webtecit.devicepilot.data.AppUsageInfo
import com.webtecit.devicepilot.domain.AppDataUsage
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.ConfirmDialog
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.EmptyState
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import java.util.Date

private data class Extras(val size: AppSize?, val usage: AppUsageInfo?, val data: AppDataUsage?, val access: Boolean, val permissions: List<String>)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppDetailsScreen(packageName: String, navigate: (String) -> Unit, onRemoved: () -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    var refreshKey by remember { mutableStateOf(0) }
    val app by produceState<AppEntry?>(null, packageName, refreshKey) { value = c.apps.getApp(packageName) }
    val extras by produceState<Extras?>(null, packageName) {
        val access = c.usage.hasUsageAccess()
        val range = UsagePeriods.range(UsagePeriod.LAST_30_DAYS, System.currentTimeMillis(), 1)
        val a = c.apps.getApp(packageName)
        value = Extras(
            size = if (access) c.apps.appSize(packageName) else null,
            usage = if (access) c.usage.appUsage(range)[packageName] else null,
            data = if (access && a != null) c.usage.perAppUsage(range)?.firstOrNull { it.uid == a.uid } else null,
            access = access,
            permissions = c.apps.requestedPermissions(packageName),
        )
    }
    var confirm by remember { mutableStateOf(false) }
    var showPerms by remember { mutableStateOf(false) }
    val removedMsg = stringResource(R.string.uninstall_verified)
    val keptMsg = stringResource(R.string.uninstall_not_removed)
    val unavailableMsg = stringResource(R.string.uninstall_unavailable)
    val uninstall = rememberUninstaller { _, outcome ->
        when (outcome) {
            UninstallOutcome.REMOVED -> { Toast.makeText(context, removedMsg, Toast.LENGTH_SHORT).show(); onRemoved() }
            UninstallOutcome.NOT_REMOVED -> { Toast.makeText(context, keptMsg, Toast.LENGTH_SHORT).show(); refreshKey++ }
            UninstallOutcome.UNAVAILABLE -> Toast.makeText(context, unavailableMsg, Toast.LENGTH_LONG).show()
        }
    }

    val a = app
    if (a == null) {
        ScreenList { item { EmptyState(R.drawable.ill_empty, stringResource(R.string.app_not_found), packageName) } }
        return
    }
    val dateFmt = remember { DateFormat.getMediumDateFormat(context) }
    val shareTitle = stringResource(R.string.share_app_title)

    ScreenList {
        item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(a.packageName, 60.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(a.label, style = MaterialTheme.typography.titleLarge)
                        Text(a.packageName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StatusPill(stringResource(if (a.isSystem) R.string.app_system else R.string.app_user), if (a.isSystem) Level.NEUTRAL else Level.INFO)
                            if (!a.enabled) StatusPill(stringResource(R.string.app_disabled), Level.WARN)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (a.launchable) ShortcutButton(stringResource(R.string.action_open), Icons.AutoMirrored.Outlined.OpenInNew) { SystemSettings.launchApp(context, a.packageName) }
                    ShortcutButton(stringResource(R.string.action_app_info), Icons.Outlined.Info) { SystemSettings.appDetails(context, a.packageName) }
                    ShortcutButton(stringResource(R.string.action_notifications), Icons.Outlined.Notifications) { SystemSettings.appNotifications(context, a.packageName) }
                    ShortcutButton(stringResource(R.string.action_share), Icons.Outlined.Share) {
                        SystemSettings.shareText(context, context.getString(R.string.share_app_text, a.label,
                            "https://play.google.com/store/apps/details?id=${a.packageName}"), shareTitle)
                    }
                    ShortcutButton(stringResource(R.string.action_firewall_rule), Icons.Outlined.Shield) { navigate(Routes.FIREWALL) }
                }
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.details_info), style = MaterialTheme.typography.titleSmall)
                InfoRow(stringResource(R.string.details_version), a.versionName ?: "—")
                InfoRow(stringResource(R.string.details_version_code), a.versionCode.toString())
                InfoRow(stringResource(R.string.details_installed), if (a.firstInstall > 0) dateFmt.format(Date(a.firstInstall)) else "—")
                InfoRow(stringResource(R.string.details_updated), if (a.lastUpdate > 0) dateFmt.format(Date(a.lastUpdate)) else "—")
                InfoRow(stringResource(R.string.details_target_sdk), a.targetSdk.toString())
                a.minSdk?.let { InfoRow(stringResource(R.string.details_min_sdk), it.toString()) }
                InfoRow(stringResource(R.string.details_installer), a.installer ?: stringResource(R.string.unknown))
                InfoRow(stringResource(R.string.details_uid), a.uid.toString())
            }
        }
        item {
            val e = extras
            DpCard {
                Text(stringResource(R.string.details_usage_30d), style = MaterialTheme.typography.titleSmall)
                if (e == null) Text(stringResource(R.string.loading), style = MaterialTheme.typography.bodySmall)
                else if (!e.access) {
                    Text(stringResource(R.string.perm_usage_apps_text), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { SystemSettings.usageAccess(context) }) { Text(stringResource(R.string.perm_grant_in_settings)) }
                } else {
                    InfoRow(stringResource(R.string.details_storage), e.size?.let {
                        stringResource(R.string.details_storage_value, Formatters.bytes(it.appBytes), Formatters.bytes(it.dataBytes), Formatters.bytes(it.cacheBytes))
                    } ?: stringResource(R.string.unavailable))
                    InfoRow(stringResource(R.string.details_screen_time), e.usage?.foregroundMs?.let { Formatters.duration(it) } ?: "0s")
                    InfoRow(stringResource(R.string.details_last_used), e.usage?.lastUsed?.takeIf { it > 0 }?.let { dateFmt.format(Date(it)) } ?: "—")
                    InfoRow(stringResource(R.string.details_wifi_data), e.data?.let { Formatters.bytes(it.wifiTotal) } ?: "0 B")
                    InfoRow(stringResource(R.string.details_mobile_data), e.data?.let { Formatters.bytes(it.mobileTotal) } ?: "0 B")
                    SourceNote(stringResource(R.string.details_usage_source))
                }
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.background_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.background_explain), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.action_battery_usage), Icons.Outlined.BatterySaver) { SystemSettings.appDetails(context, a.packageName) }
                    ShortcutButton(stringResource(R.string.action_battery_optimization), Icons.Outlined.BatterySaver) { SystemSettings.batteryOptimization(context) }
                    ShortcutButton(stringResource(R.string.action_background_data), Icons.Outlined.DataSaverOn) { SystemSettings.appBackgroundData(context, a.packageName) }
                    ShortcutButton(stringResource(R.string.action_permissions), Icons.Outlined.Shield) { SystemSettings.appDetails(context, a.packageName) }
                }
            }
        }
        item {
            val perms = extras?.permissions.orEmpty()
            DpCard(onClick = { showPerms = !showPerms }) {
                Text(stringResource(R.string.details_permissions, perms.size), style = MaterialTheme.typography.titleSmall)
                AnimatedVisibility(showPerms) {
                    Column {
                        Spacer(Modifier.height(6.dp))
                        perms.forEach { p ->
                            Text(p.removePrefix("android.permission."), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        item {
            DpCard {
                if (a.isSystem && !a.isUpdatedSystem) {
                    Text(stringResource(R.string.system_app_protected), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    ShortcutButton(stringResource(R.string.action_app_info), Icons.Outlined.Info) { SystemSettings.appDetails(context, a.packageName) }
                } else {
                    if (a.isUpdatedSystem) Text(stringResource(R.string.system_app_updates_only), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (a.packageName == context.packageName) Text(stringResource(R.string.uninstall_self_note), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { confirm = true }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) {
                        Icon(Icons.Outlined.Delete, null)
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(if (a.isUpdatedSystem) R.string.action_uninstall_updates else R.string.action_uninstall))
                    }
                }
            }
        }
    }

    if (confirm) {
        ConfirmDialog(
            title = stringResource(R.string.uninstall_confirm_title, a.label),
            text = stringResource(R.string.uninstall_confirm_text),
            confirm = stringResource(R.string.action_continue),
            destructive = true,
            onConfirm = { confirm = false; uninstall(a.packageName) },
            onDismiss = { confirm = false },
        )
    }
}

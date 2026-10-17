package com.webtecit.devicepilot.ui.permissions

import android.Manifest
import android.app.Activity
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material.icons.outlined.InstallMobile
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.firewall.FirewallController
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.IconBadge
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.work.Notifier

private enum class Perm { NOTIFICATIONS, USAGE, INSTALL, VPN }

private data class PermItem(val perm: Perm, val icon: ImageVector, val title: Int, val why: Int, val granted: Boolean)

/**
 * Asks for every permission DevicePilot uses, right after onboarding.
 * Runtime permissions use the system pop-up; special permissions open the matching
 * Android settings screen where the user turns the switch on (apps cannot do this themselves).
 */
@Composable
fun PermissionsScreen(onDone: () -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    var tick by remember { mutableIntStateOf(0) }
    // Starts walking through the permissions as soon as the screen is shown.
    var walking by rememberSaveable { mutableStateOf(true) }
    var attempted by rememberSaveable { mutableStateOf(setOf<String>()) }

    fun computeItems(): List<PermItem> =
        buildList {
            if (Build.VERSION.SDK_INT >= 33) add(PermItem(Perm.NOTIFICATIONS, Icons.Outlined.Notifications,
                R.string.perm_notif_title, R.string.perm_notif_why, Notifier.canPost(context)))
            add(PermItem(Perm.USAGE, Icons.Outlined.DataUsage, R.string.perm_usage_title, R.string.perm_usage_why,
                c.usage.hasUsageAccess()))
            if (Build.VERSION.SDK_INT >= 26) add(PermItem(Perm.INSTALL, Icons.Outlined.InstallMobile,
                R.string.perm_install_title, R.string.perm_install_why, c.installer.canRequestInstalls()))
            add(PermItem(Perm.VPN, Icons.Outlined.VpnKey, R.string.perm_vpn_title, R.string.perm_vpn_why,
                FirewallController.consentIntent(context) == null))
        }
    val items = remember(tick) { computeItems() }
    val grantedCount = items.count { it.granted }

    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { tick++ }
    val vpnLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == Activity.RESULT_OK) tick++ else tick++
    }

    fun request(p: Perm) {
        attempted = attempted + p.name
        when (p) {
            Perm.NOTIFICATIONS -> if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            Perm.USAGE -> SystemSettings.usageAccess(context)
            Perm.INSTALL -> SystemSettings.unknownSources(context)
            Perm.VPN -> FirewallController.consentIntent(context)?.let { vpnLauncher.launch(it) } ?: run { tick++ }
        }
    }

    fun continueWalk() {
        val next = computeItems().firstOrNull { !it.granted && it.perm.name !in attempted }
        if (next == null) walking = false else request(next.perm)
    }

    // Every time the screen is shown again (first open, back from a system dialog or a settings
    // screen) refresh the statuses and, while walking, ask for the next missing permission.
    LifecycleResumeEffect(Unit) {
        tick++
        if (walking) continueWalk()
        onPauseOrDispose { }
    }

    ScreenList {
        item { HeroCard(R.drawable.ill_permission, stringResource(R.string.perm_setup_title), stringResource(R.string.perm_setup_text)) }
        item {
            Column {
                Text(stringResource(R.string.perm_setup_progress, grantedCount, items.size), style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(progress = { if (items.isEmpty()) 1f else grantedCount / items.size.toFloat() },
                    modifier = Modifier.fillMaxWidth())
            }
        }
        items(items, key = { it.perm.name }) { item ->
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBadge(item.icon)
                    Spacer(Modifier.width(12.dp))
                    Text(stringResource(item.title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    StatusPill(stringResource(if (item.granted) R.string.perm_granted else R.string.perm_not_granted),
                        if (item.granted) Level.GOOD else Level.WARN)
                }
                Spacer(Modifier.height(6.dp))
                Text(stringResource(item.why), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (!item.granted) {
                    Spacer(Modifier.height(8.dp))
                    FilledTonalButton(onClick = { walking = false; request(item.perm) }) { Text(stringResource(R.string.perm_allow)) }
                }
            }
        }
        if (items.any { it.perm == Perm.USAGE && !it.granted }) item {
            com.webtecit.devicepilot.ui.common.RestrictedSettingsHelp(startExpanded = attempted.contains(Perm.USAGE.name))
        }
        item {
            if (grantedCount < items.size) {
                Button(onClick = { attempted = emptySet(); walking = true; continueWalk() }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.perm_grant_all))
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.perm_skip)) }
            } else {
                Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.action_continue)) }
            }
        }
        item { SourceNote(stringResource(R.string.perm_setup_note)) }
    }
}

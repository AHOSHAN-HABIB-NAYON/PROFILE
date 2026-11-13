package com.webtecit.devicepilot.ui.firewall

import android.app.Activity
import android.text.format.DateUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NetworkCell
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.AppEntry
import com.webtecit.devicepilot.data.AppSettings
import com.webtecit.devicepilot.domain.AppRule
import com.webtecit.devicepilot.firewall.FirewallController
import com.webtecit.devicepilot.firewall.FirewallPhase
import com.webtecit.devicepilot.firewall.FirewallState
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.transportRes
import kotlinx.coroutines.launch

@Composable
fun FirewallScreen() {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val status by FirewallState.status.collectAsStateWithLifecycle()
    val settings by c.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val apps by produceState<List<AppEntry>?>(null) { value = c.apps.loadApps() }
    var query by remember { mutableStateOf("") }
    var showSystem by remember { mutableStateOf(false) }
    var consentDenied by remember { mutableStateOf(false) }

    val consent = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            consentDenied = false
            scope.launch { c.settings.setFirewallWanted(true) }
            FirewallController.start(context)
        } else {
            consentDenied = true
        }
    }

    fun turnOn() {
        val intent = FirewallController.consentIntent(context)
        if (intent != null) consent.launch(intent) else {
            scope.launch { c.settings.setFirewallWanted(true) }
            FirewallController.start(context)
        }
    }

    fun turnOff() {
        scope.launch { c.settings.setFirewallWanted(false) }
        FirewallController.stop(context)
    }

    val running = status.phase == FirewallPhase.ACTIVE || status.phase == FirewallPhase.STARTING
    val rules = settings.firewallRules

    ScreenList {
        item { HeroCard(R.drawable.ill_firewall, stringResource(R.string.firewall_hero_title), stringResource(R.string.firewall_hero_text)) }
        item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.firewall_status), style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(4.dp))
                        val (label, level) = phaseLabel(status.phase, consentDenied)
                        StatusPill(stringResource(label), level)
                    }
                    Switch(
                        checked = running,
                        onCheckedChange = { on -> if (on) turnOn() else turnOff() },
                        enabled = rules.isNotEmpty() || running,
                    )
                }
                if (rules.isEmpty() && !running) {
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.firewall_need_rules), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (status.phase == FirewallPhase.ACTIVE) {
                    Spacer(Modifier.height(8.dp))
                    InfoRow(stringResource(R.string.firewall_network), stringResource(transportRes(status.transport)))
                    InfoRow(stringResource(R.string.firewall_blocked_now), status.blockedNow.size.toString())
                    InfoRow(stringResource(R.string.firewall_dropped), status.droppedPackets.toString())
                    if (status.since > 0) InfoRow(stringResource(R.string.firewall_since),
                        DateUtils.getRelativeTimeSpanString(status.since).toString())
                }
                if (status.phase == FirewallPhase.PAUSED) {
                    Text(stringResource(R.string.firewall_paused_text), style = MaterialTheme.typography.bodySmall,
                        color = levelColor(Level.WARN))
                    TextButton(onClick = { turnOn() }) { Text(stringResource(R.string.action_resume)) }
                }
                if (status.phase == FirewallPhase.ERROR) {
                    Text(status.error ?: stringResource(R.string.firewall_error_generic), style = MaterialTheme.typography.bodySmall,
                        color = levelColor(Level.BAD))
                }
                if (consentDenied) Text(stringResource(R.string.firewall_consent_denied), style = MaterialTheme.typography.bodySmall,
                    color = levelColor(Level.WARN))
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.firewall_how_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.firewall_how_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { SystemSettings.vpn(context) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Icon(Icons.Outlined.VpnKey, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.firewall_open_vpn_settings))
                }
            }
        }
        item {
            SectionTitle(stringResource(R.string.firewall_rules_count, rules.size)) {
                if (rules.isNotEmpty()) TextButton(onClick = { scope.launch { c.settings.clearRules() } }) {
                    Text(stringResource(R.string.action_clear_all))
                }
            }
        }
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
                label = { Text(stringResource(R.string.apps_search)) }, shape = MaterialTheme.shapes.small)
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.firewall_show_system), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Switch(showSystem, { showSystem = it })
            }
        }
        val list = apps
        if (list == null) item { Text(stringResource(R.string.loading)) }
        else {
            val visible = list.asSequence()
                .filter { it.packageName != context.packageName }
                .filter { showSystem || it.isUserApp || rules.containsKey(it.packageName) }
                .filter { query.isBlank() || it.label.contains(query, true) || it.packageName.contains(query, true) }
                .sortedWith(compareByDescending<AppEntry> { rules.containsKey(it.packageName) }.thenBy { it.label.lowercase() })
                .toList()
            items(visible, key = { it.packageName }) { app ->
                val rule = rules[app.packageName] ?: AppRule(app.packageName, false, false)
                RuleRow(app, rule) { updated -> scope.launch { c.settings.setRule(updated) } }
            }
        }
        item { SourceNote(stringResource(R.string.firewall_privacy_note)) }
    }
}

@Composable
private fun RuleRow(app: AppEntry, rule: AppRule, onChange: (AppRule) -> Unit) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp,
            if (rule.isActive) levelColor(Level.BAD).copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            AppIcon(app.packageName, 36.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(app.label, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                Text(
                    stringResource(when {
                        rule.blockWifi && rule.blockMobile -> R.string.rule_blocked_all
                        rule.blockWifi -> R.string.rule_blocked_wifi
                        rule.blockMobile -> R.string.rule_blocked_mobile
                        else -> R.string.rule_allowed
                    }),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (rule.isActive) levelColor(Level.BAD) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                BlockChip(Icons.Outlined.Wifi, stringResource(R.string.net_wifi), rule.blockWifi) { onChange(rule.copy(blockWifi = it)) }
                BlockChip(Icons.Outlined.NetworkCell, stringResource(R.string.net_mobile), rule.blockMobile) { onChange(rule.copy(blockMobile = it)) }
            }
        }
    }
}

@Composable
private fun BlockChip(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, blocked: Boolean, onToggle: (Boolean) -> Unit) {
    val bad = levelColor(Level.BAD)
    FilterChip(
        selected = blocked,
        onClick = { onToggle(!blocked) },
        label = { Icon(icon, description, Modifier.size(18.dp)) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = bad.copy(alpha = 0.15f),
            selectedLabelColor = bad,
            iconColor = MaterialTheme.colorScheme.primary,
            labelColor = MaterialTheme.colorScheme.primary,
        ),
    )
}

private fun phaseLabel(p: FirewallPhase, denied: Boolean): Pair<Int, Level> = when (p) {
    FirewallPhase.ACTIVE -> R.string.fw_active to Level.GOOD
    FirewallPhase.STARTING -> R.string.fw_starting to Level.INFO
    FirewallPhase.PAUSED -> R.string.fw_paused to Level.WARN
    FirewallPhase.PERMISSION_REQUIRED -> R.string.fw_permission_required to Level.WARN
    FirewallPhase.ERROR -> R.string.fw_error to Level.BAD
    FirewallPhase.OFF -> (if (denied) R.string.fw_permission_required else R.string.fw_off) to Level.NEUTRAL
}

package com.webtecit.devicepilot.ui.network

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.NetworkCell
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.DeviceDataTotals
import com.webtecit.devicepilot.domain.AppDataUsage
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.UsageMath
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.IconBadge
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.NavRow
import com.webtecit.devicepilot.ui.common.PermissionCard
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.polling
import com.webtecit.devicepilot.ui.common.transportRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Date

data class NetworkUi(
    val loading: Boolean = true,
    val access: Boolean = false,
    val period: UsagePeriod = UsagePeriod.LAST_30_DAYS,
    val totals: DeviceDataTotals? = null,
    val apps: List<AppDataUsage>? = null,
    val refreshedAt: Long = 0,
    val billingDay: Int = 1,
)

class NetworkViewModel(private val c: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow(NetworkUi())
    val ui = _ui.asStateFlow()
    val status = polling(5_000) { c.monitor.network() }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init { refresh() }

    fun setPeriod(p: UsagePeriod) { _ui.value = _ui.value.copy(period = p); refresh() }

    fun setBillingDay(d: Int) = viewModelScope.launch { c.settings.setBillingDay(d); refresh() }

    fun refresh() = viewModelScope.launch {
        _ui.value = _ui.value.copy(loading = true)
        val access = c.usage.hasUsageAccess()
        val billing = c.settings.settings.first().billingDay
        val range = UsagePeriods.range(_ui.value.period, System.currentTimeMillis(), billing)
        val totals = if (access) c.usage.deviceTotals(range) else null
        val apps = if (access) c.usage.perAppUsage(range) else null
        _ui.value = _ui.value.copy(loading = false, access = access, totals = totals, apps = apps,
            refreshedAt = System.currentTimeMillis(), billingDay = billing)
    }
}

@Composable
fun NetworkScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val vm: NetworkViewModel = viewModel { NetworkViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()

    LifecycleResumeEffect(Unit) {
        if (!ui.access && c.usage.hasUsageAccess()) vm.refresh()
        onPauseOrDispose { }
    }

    ScreenList {
        item {
            DpCard {
                val st = status
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBadge(if (st?.transport == com.webtecit.devicepilot.domain.Transport.MOBILE) Icons.Outlined.NetworkCell else Icons.Outlined.Wifi)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.net_current), style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(st?.let { stringResource(transportRes(it.transport)) } ?: "—", style = MaterialTheme.typography.titleMedium)
                    }
                    if (st != null) Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        StatusPill(stringResource(if (st.validated) R.string.net_internet_ok else R.string.net_no_internet),
                            if (st.validated) Level.GOOD else Level.WARN)
                        if (st.metered) StatusPill(stringResource(R.string.net_metered), Level.NEUTRAL)
                        if (st.vpnActive) StatusPill(stringResource(R.string.net_vpn_on), Level.INFO)
                    }
                }
            }
        }
        item {
            DpCard(contentPadding = 6.dp) {
                NavRow(Icons.Outlined.Security, stringResource(R.string.title_firewall), stringResource(R.string.firewall_row_sub)) {
                    navigate(Routes.FIREWALL)
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(UsagePeriod.entries) { p ->
                    FilterChip(ui.period == p, onClick = { vm.setPeriod(p) }, label = { Text(stringResource(periodLabel(p))) })
                }
            }
        }
        if (ui.period == UsagePeriod.BILLING_CYCLE) item { BillingDayPicker(ui.billingDay, vm::setBillingDay) }
        if (!ui.loading && !ui.access) item {
            PermissionCard(stringResource(R.string.perm_usage_title), stringResource(R.string.perm_usage_network_text),
                stringResource(R.string.perm_grant_in_settings), onClick = { SystemSettings.usageAccess(context) })
        }
        if (ui.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        ui.totals?.let { t ->
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.net_totals), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        IconButton(onClick = { vm.refresh() }) { Icon(Icons.Outlined.Refresh, stringResource(R.string.action_refresh)) }
                    }
                    TotalRow(Icons.Outlined.Wifi, stringResource(R.string.net_wifi), t.wifiRx, t.wifiTx)
                    TotalRow(Icons.Outlined.NetworkCell, stringResource(R.string.net_mobile), t.mobileRx, t.mobileTx)
                    if (ui.refreshedAt > 0) SourceNote(stringResource(R.string.net_refreshed,
                        DateFormat.getTimeFormat(context).format(Date(ui.refreshedAt))))
                }
            }
        }
        val apps = ui.apps
        if (ui.access) {
            item { SectionTitle(stringResource(R.string.net_top_apps)) }
            if (apps == null) item { Text(stringResource(R.string.net_per_app_unavailable), style = MaterialTheme.typography.bodySmall) }
            else {
                val top = UsageMath.topConsumers(apps, 20)
                val max = top.firstOrNull()?.total ?: 0L
                if (top.isEmpty()) item { Text(stringResource(R.string.net_no_usage), style = MaterialTheme.typography.bodySmall) }
                items(top, key = { it.uid }) { a -> AppUsageRow(a, max) { a.packageName?.let { navigate(Routes.appDetails(it)) } } }
            }
        }
        item { SourceNote(stringResource(R.string.net_source_note)) }
    }
}

@Composable
private fun TotalRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, rx: Long?, tx: Long?) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconBadge(icon, size = 32.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(
                if (rx == null || tx == null) stringResource(R.string.unavailable)
                else stringResource(R.string.net_down_up, Formatters.bytes(rx), Formatters.bytes(tx)),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(if (rx == null || tx == null) "—" else Formatters.bytes(rx + tx), style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun AppUsageRow(a: AppDataUsage, max: Long, onClick: () -> Unit) {
    DpCard(onClick = onClick, contentPadding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (a.packageName != null) AppIcon(a.packageName, 36.dp) else IconBadge(Icons.Outlined.Security, size = 36.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(a.label, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(stringResource(R.string.net_app_split, Formatters.bytes(a.wifiTotal), Formatters.bytes(a.mobileTotal)),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(Formatters.bytes(a.total), style = MaterialTheme.typography.titleSmall)
        }
        Spacer(Modifier.height(8.dp))
        // Stacked bar: Wi-Fi share then mobile share, relative to the top consumer.
        val share = UsageMath.shareOf(a.total, max)
        val wifiPart = UsageMath.shareOf(a.wifiTotal, a.total)
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            Row(Modifier.fillMaxWidth(share.coerceAtLeast(0.02f)).fillMaxHeight()) {
                if (wifiPart > 0f) Box(Modifier.weight(wifiPart.coerceAtLeast(0.001f)).fillMaxHeight().background(MaterialTheme.colorScheme.primary))
                if (wifiPart < 1f) Box(Modifier.weight((1f - wifiPart).coerceAtLeast(0.001f)).fillMaxHeight().background(MaterialTheme.colorScheme.secondary))
            }
        }
    }
}

@Composable
private fun BillingDayPicker(day: Int, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    DpCard(onClick = { open = true }, contentPadding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CalendarMonth, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.net_billing_day, day), Modifier.weight(1f))
            Box {
                Text(stringResource(R.string.action_change), color = MaterialTheme.colorScheme.primary)
                DropdownMenu(open, { open = false }) {
                    (1..28).forEach { d -> DropdownMenuItem(text = { Text("$d") }, onClick = { onPick(d); open = false }) }
                }
            }
        }
    }
}

fun periodLabel(p: UsagePeriod) = when (p) {
    UsagePeriod.TODAY -> R.string.period_today
    UsagePeriod.LAST_7_DAYS -> R.string.period_7d
    UsagePeriod.LAST_30_DAYS -> R.string.period_30d
    UsagePeriod.BILLING_CYCLE -> R.string.period_billing
}

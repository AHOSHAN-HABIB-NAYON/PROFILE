@file:OptIn(ExperimentalMaterial3Api::class)

package com.ahoshan.joma.ui

import android.app.Activity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahoshan.joma.data.Passkey
import com.ahoshan.joma.ui.theme.Brand
import com.ahoshan.joma.ui.theme.BrandBright
import com.ahoshan.joma.ui.theme.Gold
import com.ahoshan.joma.ui.theme.MoneyIn
import com.ahoshan.joma.ui.theme.MoneyInSoft
import com.ahoshan.joma.ui.theme.MoneyOut
import com.ahoshan.joma.ui.theme.MoneyOutSoft
import com.ahoshan.joma.ui.theme.Send
import com.ahoshan.joma.ui.theme.SendSoft

private enum class Tab(val label: String, val icon: ImageVector) {
    Home("হোম", Icons.Filled.Home),
    History("লেনদেন", Icons.AutoMirrored.Filled.List),
    Settings("সেটিংস", Icons.Filled.Settings),
}

@Composable
fun MainScreen(vm: WalletViewModel, snackbarHost: @Composable () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var sheet by remember { mutableStateOf<MoneyAction?>(null) }
    val state = vm.state

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        WalletMark(size = 32.dp)
                        Spacer(Modifier.size(10.dp))
                        Text(tab.label.takeIf { tab != Tab.Home } ?: "জমা ওয়ালেট", fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    state.user?.let { Box(Modifier.padding(end = 12.dp)) { Avatar(it.name, 36.dp) } }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(t.label) },
                    )
                }
            }
        },
        snackbarHost = snackbarHost,
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = vm::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when (tab) {
                Tab.Home -> HomeTab(vm, onAction = { sheet = it }, onSeeAll = { tab = Tab.History })
                Tab.History -> HistoryTab(vm)
                Tab.Settings -> SettingsTab(vm)
            }
        }
    }

    sheet?.let { action ->
        MoneySheet(vm = vm, action = action, onDismiss = { sheet = null })
    }
}

// ---------------------------------------------------------------------- home

@Composable
private fun HomeTab(vm: WalletViewModel, onAction: (MoneyAction) -> Unit, onSeeAll: () -> Unit) {
    val state = vm.state
    var hidden by rememberSaveable { mutableStateOf(false) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Text(
                "শুভেচ্ছা, ${state.user?.name.orEmpty()}",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item { BalanceCard(state.summary?.balance, state.summary?.monthIn, state.summary?.monthOut, hidden) { hidden = !hidden } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ActionTile("টাকা যোগ", Icons.Filled.Add, MoneyIn, MoneyInSoft, Modifier.weight(1f)) { onAction(MoneyAction.Deposit) }
                ActionTile("টাকা পাঠান", Icons.AutoMirrored.Filled.ArrowForward, Send, SendSoft, Modifier.weight(1f)) { onAction(MoneyAction.Send) }
                ActionTile("টাকা তুলুন", Icons.Filled.KeyboardArrowDown, MoneyOut, MoneyOutSoft, Modifier.weight(1f)) { onAction(MoneyAction.Withdraw) }
            }
        }
        item {
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("সাম্প্রতিক লেনদেন", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    if (state.transactions.isNotEmpty()) TextButton(onClick = onSeeAll) { Text("সব দেখুন") }
                }
                if (state.summary == null) {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else if (state.transactions.isEmpty()) {
                    EmptyHistory { onAction(MoneyAction.Deposit) }
                } else {
                    state.transactions.take(5).forEachIndexed { i, tx ->
                        if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        TransactionRow(tx)
                    }
                }
            }
        }
    }
}

@Composable
private fun BalanceCard(balance: String?, monthIn: String?, monthOut: String?, hidden: Boolean, onToggle: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(Brand, BrandBright))),
    ) {
        // Soft decorative circles, echoing the website's card.
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .offset(x = 50.dp, y = (-60).dp)
                .size(180.dp)
                .clip(RoundedCornerShape(90.dp))
                .background(Color.White.copy(alpha = 0.10f)),
        )
        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("বর্তমান ব্যালেন্স", color = Color.White.copy(alpha = 0.9f), modifier = Modifier.weight(1f))
                Surface(
                    onClick = onToggle,
                    shape = RoundedCornerShape(50),
                    color = Color.White.copy(alpha = 0.14f),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.4f)),
                ) {
                    Text(
                        if (hidden) "দেখুন" else "লুকান",
                        color = Color.White,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    )
                }
            }
            Text(
                when {
                    balance == null -> "৳ …"
                    hidden -> "৳ ••••••"
                    else -> "৳ " + taka(balance)
                },
                color = Color.White,
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
            )
            HorizontalDivider(color = Color.White.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                MiniStat("এই মাসে এসেছে", monthIn)
                MiniStat("এই মাসে গেছে", monthOut)
            }
        }
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .size(110.dp)
                .clip(RoundedCornerShape(topStart = 110.dp))
                .background(Gold.copy(alpha = 0.25f)),
        )
    }
}

@Composable
private fun MiniStat(label: String, value: String?) {
    Column {
        Text(label, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall)
        Text(value?.let { "৳ " + taka(it) } ?: "—", color = Color.White, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ActionTile(label: String, icon: ImageVector, tint: Color, background: Color, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
        modifier = modifier,
    ) {
        Column(
            Modifier.padding(vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(background),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = tint) }
            Text(label, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun SectionCard(content: @Composable () -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 14.dp)) { content() }
    }
}

@Composable
private fun EmptyHistory(onDeposit: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("এখনো কোনো লেনদেন নেই", fontWeight = FontWeight.SemiBold)
        Text("টাকা যোগ করে শুরু করুন।", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        OutlinedButton(onClick = onDeposit) { Text("টাকা যোগ করুন") }
    }
}

// ------------------------------------------------------------------- history

@Composable
private fun HistoryTab(vm: WalletViewModel) {
    val state = vm.state
    LazyColumn(contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp), modifier = Modifier.fillMaxSize()) {
        if (state.transactions.isEmpty() && state.summary != null) {
            item { EmptyHistory {} }
        }
        items(state.transactions, key = { it.id }) { tx ->
            TransactionRow(tx)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        if (state.nextBefore != null) {
            item {
                Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    if (state.loadingMore) CircularProgressIndicator() else OutlinedButton(onClick = vm::loadMore) { Text("আরও দেখুন") }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ settings

@Composable
private fun SettingsTab(vm: WalletViewModel) {
    val state = vm.state
    val activity = LocalContext.current as Activity
    var confirmDelete by remember { mutableStateOf<Passkey?>(null) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        state.user?.let { user ->
            item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Avatar(user.name, 52.dp)
                        Column(Modifier.weight(1f)) {
                            Text(user.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(user.email, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    HorizontalDivider(Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    InfoRow("Google", if (user.googleLinked) "যুক্ত আছে" else "যুক্ত নেই")
                    InfoRow("পাসওয়ার্ড", if (user.hasPassword) "সেট করা আছে" else "নেই")
                }
            }
        }
        item {
            SectionCard {
                Text("পাসকি", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "পাসকি থাকলে আঙুলের ছাপ বা ফেস দিয়েই লগইন করা যায়, পাসওয়ার্ড লাগে না।",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
                )
                if (state.passkeys.isEmpty()) {
                    Text(
                        "এখনো কোনো পাসকি যোগ করা হয়নি",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                            .padding(14.dp),
                    )
                }
                state.passkeys.forEach { pk ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(start = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp)) {
                            Text(pk.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                pk.lastUsedAt?.let { "শেষ ব্যবহার " + shortDate(it) } ?: ("যোগ করা হয়েছে " + shortDate(pk.createdAt)),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { confirmDelete = pk }) {
                            Icon(Icons.Filled.Delete, contentDescription = "${pk.name} মুছুন")
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { vm.addPasskey(activity) },
                    enabled = !state.busy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                ) {
                    if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("নতুন পাসকি যোগ করুন")
                }
            }
        }
        item {
            Surface(
                onClick = vm::logout,
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, tint = MoneyOut)
                    Spacer(Modifier.size(12.dp))
                    Text("লগআউট", color = MoneyOut, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    confirmDelete?.let { pk ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("পাসকি মুছবেন?") },
            text = { Text("\"${pk.name}\" মুছে ফেললে এই পাসকি দিয়ে আর লগইন করা যাবে না।") },
            confirmButton = {
                TextButton(onClick = { vm.deletePasskey(pk); confirmDelete = null }) { Text("মুছে ফেলুন", color = MoneyOut) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("বাতিল") } },
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, fontWeight = FontWeight.Medium)
    }
}

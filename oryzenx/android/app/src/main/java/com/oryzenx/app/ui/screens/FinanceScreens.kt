@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.oryzenx.app.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CandlestickChart
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.oryzenx.app.data.Fmt
import com.oryzenx.app.data.arr
import com.oryzenx.app.data.bool
import com.oryzenx.app.data.data
import com.oryzenx.app.data.dataList
import com.oryzenx.app.data.int
import com.oryzenx.app.data.meta
import com.oryzenx.app.data.obj
import com.oryzenx.app.data.str
import com.oryzenx.app.data.t
import com.oryzenx.app.ui.AppState
import com.oryzenx.app.ui.components.AreaChart
import com.oryzenx.app.ui.components.Banner
import com.oryzenx.app.ui.components.Candle
import com.oryzenx.app.ui.components.CandlestickChart
import com.oryzenx.app.ui.components.Chip
import com.oryzenx.app.ui.components.CoinBadge
import com.oryzenx.app.ui.components.EmptyState
import com.oryzenx.app.ui.components.Formula
import com.oryzenx.app.ui.components.IconBadge
import com.oryzenx.app.ui.components.KeyValue
import com.oryzenx.app.ui.components.ListRow
import com.oryzenx.app.ui.components.MetricTile
import com.oryzenx.app.ui.components.OxCard
import com.oryzenx.app.ui.components.OxTopBar
import com.oryzenx.app.ui.components.SignedAmount
import com.oryzenx.app.ui.components.Skeleton
import com.oryzenx.app.ui.components.StatusChip
import com.oryzenx.app.ui.components.signColor
import com.oryzenx.app.ui.go
import com.oryzenx.app.ui.theme.Ox
import kotlinx.serialization.json.JsonObject

@Composable
fun Screen(title: String, nav: NavHostController? = null, back: Boolean = false, actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {}, content: @Composable () -> Unit) {
    Scaffold(containerColor = Ox.colors.bg, topBar = { OxTopBar(title, if (back && nav != null) ({ nav.popBackStack(); Unit }) else null, actions) }) { inner ->
        Box(Modifier.padding(inner)) { content() }
    }
}

// ------------------------------------------------------------------ transaction helpers
fun txIcon(type: String?) = when (type) {
    "deposit", "salary_payment" -> Icons.Default.AccountBalanceWallet
    "withdrawal" -> Icons.Default.Payments
    "trade_close" -> Icons.Default.CandlestickChart
    "loan_disbursement", "loan_repayment", "loan_charge" -> Icons.Default.AccountBalance
    "reversal" -> Icons.AutoMirrored.Filled.Undo
    else -> Icons.Default.Receipt
}

@Composable
fun TxRow(tx: JsonObject, onClick: () -> Unit) {
    val type = tx.str("type")
    val pnlTx = type == "trade_close" || type == "investment_sale"
    val sub = listOfNotNull(tx.str("asset_symbol"), Fmt.dateTime(tx.str("effective_at"))).joinToString(" · ")
    ListRow(
        title = t("tx_$type"), subtitle = sub,
        trailing = if (pnlTx) Fmt.signedUsd(tx.str("realized_pnl_usd")) else Fmt.usd(tx.str("amount_usd")),
        trailingColor = if (pnlTx) signColor(tx.str("realized_pnl_usd")) else Ox.colors.text,
        trailingSub = if (tx.str("status") != "completed") t("status_${tx.str("status")}") else tx.str("quantity")?.let { Fmt.qty(it) + " " + (tx.str("asset_symbol") ?: "") },
        leading = { IconBadge(txIcon(type), tint = if (type == "reversal") Ox.colors.warn else Ox.colors.text2) },
        onClick = onClick, chevron = false,
    )
}

@Composable
fun TxDetailSheet(id: Int, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Ox.colors.surface) {
        val l = rememberLoad(id) { api.get("/api/transactions/$id").data()!! }
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
            when (val s = l.state) {
                is Load.Loading -> Skeleton(height = 200.dp)
                is Load.Err -> Text(s.error.message ?: t("err_generic"), color = Ox.colors.loss)
                is Load.Ok -> {
                    val tx = s.value
                    Text(t("tx_${tx.str("type")}"), style = MaterialTheme.typography.titleLarge)
                    Text(Fmt.dateTime(tx.str("effective_at")) + " · " + Fmt.tzLabel(), color = Ox.colors.text3, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    StatusChip(tx.str("status"))
                    Spacer(Modifier.height(8.dp))
                    KeyValue(t("transaction_id"), tx.str("uuid") ?: "", divider = false)
                    tx.str("asset_symbol")?.let { KeyValue(t("asset"), it + " · " + (tx.str("asset_name") ?: "")) }
                    tx.str("quantity")?.let { KeyValue(t("quantity"), Fmt.qty(it)) }
                    tx.str("unit_price")?.let { KeyValue(t("unit_price"), Fmt.price(it)) }
                    KeyValue(t("amount_usd"), Fmt.usd(tx.str("amount_usd")))
                    if (Fmt.sign(tx.str("fee_usd")) != 0) KeyValue(t("fees"), Fmt.usd(tx.str("fee_usd")))
                    tx.str("realized_pnl_usd")?.let { KeyValue(t("realized_pnl"), Fmt.signedUsd(it), signColor(it)) }
                    tx.str("reference")?.let { KeyValue(t("reference"), it) }
                    tx.str("notes")?.let { KeyValue(t("notes"), it) }
                    tx.str("reversal_of_id")?.let { KeyValue(t("reverses_transaction"), "#$it") }
                    tx.str("reversed_by_id")?.let { KeyValue(t("reversed_by_transaction"), "#$it") }
                }
            }
        }
    }
}

@Composable
fun HoldingRow(h: JsonObject, onClick: () -> Unit) {
    ListRow(
        title = h.str("symbol") ?: "",
        subtitle = Fmt.qty(h.str("quantity")) + " · " + Fmt.price(h.str("current_price"), h.int("price_decimals")),
        trailing = Fmt.usd(h.str("market_value_usd")),
        trailingSub = Fmt.signedUsd(h.str("unrealized_pnl_usd")) + " · " + Fmt.pct(h.str("return_pct"), true),
        leading = { CoinBadge(h.str("symbol") ?: "?", h.str("color")) }, onClick = onClick,
    )
}

// ------------------------------------------------------------------ Home
@Composable
fun HomeScreen(nav: NavHostController) {
    var txSheet by remember { mutableStateOf<Int?>(null) }
    var info by remember { mutableStateOf(false) }
    val l = rememberLoad(Unit, pollMs = 60_000) { api.get("/api/dashboard").data()!! }
    Screen(t("home_title"), actions = {
        IconButton(onClick = { nav.go("notifications") }) { Icon(Icons.Default.Notifications, t("notifications")) }
    }) {
        LoadedColumn(l) { d ->
            if (AppState.config.bool("demo_mode") && AppState.user.bool("is_demo")) Banner(t("demo_banner"), "warn")
            VerificationBanner(nav)
            // Animated balance (frame-rate independent animation, disabled automatically by system animator settings)
            val target = Fmt.dec(d.str("all_balance_usd"))?.toFloat() ?: 0f
            val shown by animateFloatAsState(target, tween(600), label = "balance")
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Ox.colors.navy).padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("all_balance"), color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodyMedium)
                    IconButton(onClick = { info = true }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Info, t("what_is_this"), tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(16.dp)) }
                }
                Text(if (shown == target) Fmt.usd(d.str("all_balance_usd")) else Fmt.usd(shown.toBigDecimal().toPlainString()), color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                Text(t("net_value") + ": " + Fmt.usd(d.str("net_value_usd")), color = Color.White.copy(alpha = 0.92f))
                val u = d.str("unrealized_pnl_usd")
                Text(t("unrealized") + " " + Fmt.signedUsd(u) + (d.str("unrealized_return_pct")?.let { " (" + Fmt.pct(it, true) + ")" } ?: ""),
                    color = when (Fmt.sign(u)) { 1 -> Color(0xFF6EE7B7); -1 -> Color(0xFFFCA5A5); else -> Color.White })
                HorizontalDivider(Modifier.padding(vertical = 12.dp), color = Color.White.copy(alpha = 0.15f))
                Text(d.str("last_market_update")?.let { t("market_updated", "time" to Fmt.ago(it)) } ?: t("no_market_data"), color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
            }
            if (d.bool("prices_simulated")) Banner(t("simulated_prices_banner"), "warn", Icons.Default.Warning)
            val staleList = (d["stale_assets"] as? kotlinx.serialization.json.JsonArray)?.joinToString(", ") { it.toString().trim('"') }.orEmpty()
            if (staleList.isNotEmpty()) Banner(t("stale_prices_banner", "assets" to staleList), "warn", Icons.Default.Schedule)
            val tiles = listOf(
                Triple("investment_balance", Fmt.usd(d.str("investment_balance_usd")), "portfolio"),
                Triple("trading_balance", Fmt.usd(d.str("trading_balance_usd")), "trading"),
                Triple("todays_profit", Fmt.signedUsd(d.str("todays_profit_usd")), "pnl"),
                Triple("loan_balance", Fmt.usd(d.str("loan_balance_usd")), "loans"),
                Triple("loss_balance", Fmt.usd(d.str("loss_balance_usd")), "pnl"),
                Triple("main_balance", Fmt.usd(d.str("cash_balance_usd")), "activity"),
            )
            val subs = mapOf("investment_balance" to "at_market_value", "trading_balance" to "cash_for_trading", "todays_profit" to "realized_today", "loan_balance" to "current_liability", "loss_balance" to "realized_losses_all_time", "main_balance" to "cash_balance")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 2) {
                tiles.forEach { (k, v, dest) ->
                    val color = when (k) { "todays_profit" -> signColor(d.str("todays_profit_usd")); "loss_balance" -> if (Fmt.sign(d.str("loss_balance_usd")) != 0) Ox.colors.loss else Ox.colors.text; else -> Ox.colors.text }
                    MetricTile(t(k), v, t(subs[k]!!), color, modifier = Modifier.weight(1f), onClick = { nav.go(dest) })
                }
                d.str("admin_total_users")?.let { MetricTile(t("total_users"), Fmt.int(it), t("admin_only"), modifier = Modifier.weight(1f)) }
            }
            val alloc = d.arr("allocation")
            if (alloc.isNotEmpty()) OxCard(title = t("portfolio_allocation")) {
                val palette = listOf(Color(0xFF1A56DB), Color(0xFF0B8A5F), Color(0xFF9945FF), Color(0xFFF59E0B), Color(0xFFE11D48), Color(0xFF0891B2))
                Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp))) {
                    alloc.forEachIndexed { i, a ->
                        val w = (Fmt.dec(a.str("pct"))?.toFloat() ?: 0f).coerceAtLeast(0.5f)
                        Box(Modifier.weight(w).fillMaxWidth().height(10.dp).background(a.str("color")?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() } ?: palette[i % palette.size]))
                    }
                }
                Spacer(Modifier.height(10.dp))
                alloc.forEach { a -> KeyValue(when (a.str("label")) { "Cash" -> t("cash"); "Trading" -> t("trading"); else -> a.str("label") ?: "" }, Fmt.pct(a.str("pct")), divider = false) }
            }
            val holdings = d.arr("holdings").filter { Fmt.sign(it.str("quantity")) > 0 }
            if (holdings.isNotEmpty()) OxCard(title = t("asset_price_movement"), padding = 0.dp, action = { TextButton(onClick = { nav.go("markets") }) { Text(t("markets")) } }) {
                holdings.forEach { HoldingRow(it) { nav.go("asset/${it.int("asset_id")}") } }
            }
            OxCard(title = t("recent_activity"), padding = 0.dp, action = { TextButton(onClick = { nav.go("activity") }) { Text(t("view_all")) } }) {
                val txs = d.arr("recent_transactions")
                if (txs.isEmpty()) EmptyState(t("empty_tx_title"), t("empty_tx_body"))
                txs.forEach { TxRow(it) { txSheet = it.int("id") } }
            }
            Text(t("figures_note", "tz" to Fmt.tzLabel()), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
        }
    }
    txSheet?.let { TxDetailSheet(it) { txSheet = null } }
    if (info) AlertDialog(onDismissRequest = { info = false }, confirmButton = { TextButton(onClick = { info = false }) { Text(t("close")) } },
        title = { Text(t("all_balance")) }, text = { Text(t("def_all_balance") + "\n\n" + t("def_net_value")) })
}

@Composable
fun VerificationBanner(nav: NavHostController) {
    val v = AppState.user.obj("verification") ?: return
    if (!v.bool("identity_required") || v.str("identity_status") == "approved") return
    val key = when (v.str("identity_status")) { "pending" -> "verify_banner_pending"; "rejected" -> "verify_banner_rejected"; else -> "verify_banner_not_submitted" }
    Column {
        Banner(t(key), if (v.str("identity_status") == "rejected") "err" else "info")
        if (v.str("identity_status") != "pending") TextButton(onClick = { nav.go("verification") }) { Text(t("complete_verification")) }
    }
}

// ------------------------------------------------------------------ Portfolio & markets
@Composable
fun PortfolioScreen(nav: NavHostController) {
    val l = rememberLoad(Unit) { api.get("/api/portfolio").data()!! }
    Screen(t("portfolio_title")) {
        LoadedColumn(l) { d ->
            val s = d.obj("summary")!!
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 2) {
                MetricTile(t("investment_balance"), Fmt.usd(s.str("investment_balance_usd")), t("at_market_value"), modifier = Modifier.weight(1f))
                MetricTile(t("cost_basis"), Fmt.usd(s.str("investment_cost_basis_usd")), t("incl_fees"), modifier = Modifier.weight(1f))
                MetricTile(t("unrealized_pnl"), Fmt.signedUsd(s.str("unrealized_pnl_usd")), Fmt.pct(s.str("unrealized_return_pct"), true), signColor(s.str("unrealized_pnl_usd")), modifier = Modifier.weight(1f))
                MetricTile(t("net_value"), Fmt.usd(s.str("net_value_usd")), t("after_liabilities"), modifier = Modifier.weight(1f))
            }
            val perf = d.arr("performance").mapNotNull { Fmt.dec(it.str("net_value_usd"))?.toDouble() }
            OxCard(title = t("performance")) {
                if (perf.size >= 2) AreaChart(perf, description = t("performance")) else EmptyState(t("perf_empty_title"), t("perf_empty_body"))
            }
            val holdings = s.arr("holdings").filter { Fmt.sign(it.str("quantity")) > 0 }
            OxCard(title = t("holdings"), padding = 0.dp) {
                if (holdings.isEmpty()) EmptyState(t("empty_holdings_title"), t("empty_holdings_body"))
                holdings.forEach { HoldingRow(it) { nav.go("asset/${it.int("asset_id")}") } }
            }
            OxCard(title = t("calculation_method")) {
                Formula(t("formula_portfolio"))
                Spacer(Modifier.height(8.dp))
                Text(t("avg_cost_note"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
            }
        }
    }
}

@Composable
fun MarketsScreen(nav: NavHostController) {
    val l = rememberLoad(Unit, pollMs = 30_000) { api.get("/api/assets") }
    Screen(t("markets_title"), nav, back = true) {
        LoadedColumn(l) { r ->
            OxCard(padding = 0.dp) {
                r.dataList().forEach { a ->
                    ListRow(
                        title = a.str("symbol") ?: "", subtitle = a.str("name"),
                        trailing = Fmt.price(a.str("price"), a.int("price_decimals")),
                        trailingSub = (a.str("change_24h_pct")?.let { Fmt.pct(it, true) + " " + t("24h") } ?: "—") + if (a.bool("stale")) " · " + t("stale") else "",
                        leading = { CoinBadge(a.str("symbol") ?: "?", a.str("color")) },
                        onClick = { nav.go("asset/${a.int("asset_id")}") },
                    )
                }
            }
            Text(t("prices_source", "provider" to (r.meta().str("provider") ?: "")) + " " + (r.meta().str("quote_note") ?: ""), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
        }
    }
}

@Composable
fun AssetScreen(nav: NavHostController, id: Int) {
    var range by remember { mutableStateOf("1D") }
    val l = rememberLoad(id, pollMs = 30_000) { api.get("/api/assets/$id").data()!! }
    val chart = rememberLoad(id, range) { api.get("/api/assets/$id/ohlc", mapOf("range" to range)).data()!! }
    val title = (l.state as? Load.Ok)?.value?.obj("asset")?.let { (it.str("symbol") ?: "") + " · " + (it.str("name") ?: "") } ?: t("asset_title")
    Screen(title, nav, back = true) {
        LoadedColumn(l) { d ->
            val a = d.obj("asset")!!
            val dp = a.int("price_decimals")
            OxCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CoinBadge(a.str("symbol") ?: "?", a.str("color"))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t("current_price"), color = Ox.colors.text2, style = MaterialTheme.typography.bodySmall)
                        Text(Fmt.price(a.str("price"), dp), fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    }
                    a.str("change_24h_pct")?.let { Chip(Fmt.pct(it, true) + " " + t("24h"), if (Fmt.sign(it) >= 0) "gain" else "loss") }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    if (a.str("updated_at") == null) t("price_unavailable") else if (a.bool("stale")) t("price_stale_since", "time" to Fmt.ago(a.str("updated_at"))) else t("price_updated", "time" to Fmt.ago(a.str("updated_at"))),
                    color = if (a.bool("stale")) Ox.colors.warn else Ox.colors.text3, style = MaterialTheme.typography.bodySmall,
                )
                if (a.bool("simulated")) Chip(t("simulated"), "warn")
                Spacer(Modifier.height(12.dp))
                val ranges = listOf("1D", "7D", "1M", "3M", "1Y")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    ranges.forEachIndexed { i, r ->
                        SegmentedButton(selected = range == r, onClick = { range = r }, shape = SegmentedButtonDefaults.itemShape(i, ranges.size)) { Text(t("range_$r"), maxLines = 1) }
                    }
                }
                Spacer(Modifier.height(12.dp))
                when (val c = chart.state) {
                    is Load.Loading -> Skeleton(height = 260.dp)
                    is Load.Err -> Text(c.error.message ?: t("chart_unavailable"), color = Ox.colors.text3)
                    is Load.Ok -> {
                        val candles = c.value.arr("candles").mapNotNull {
                            val o = Fmt.dec(it.str("open"))?.toDouble(); val hi = Fmt.dec(it.str("high"))?.toDouble(); val lo = Fmt.dec(it.str("low"))?.toDouble(); val cl = Fmt.dec(it.str("close"))?.toDouble()
                            if (o == null || hi == null || lo == null || cl == null) null else Candle(it.str("time")?.toLongOrNull() ?: 0, o, hi, lo, cl)
                        }
                        if (candles.isEmpty()) Text(c.value.str("error") ?: t("chart_no_data"), color = Ox.colors.text3)
                        else CandlestickChart(candles, priceDecimals = dp, description = t("chart_range") + " " + range)
                        val note = listOfNotNull(
                            if (c.value.bool("simulated")) t("simulated_chart") else null,
                            if (c.value.bool("stale")) (c.value.str("error") ?: t("chart_stale")) else null,
                            t("chart_source", "source" to (c.value.str("source") ?: "")),
                        ).joinToString(" ")
                        Text(note, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                    }
                }
            }
            val h = d.obj("holding")
            OxCard(title = t("your_holding")) {
                if (h == null || Fmt.sign(h.str("quantity")) <= 0) Text(t("no_holding_asset"), color = Ox.colors.text2)
                else {
                    KeyValue(t("holding_quantity"), Fmt.qty(h.str("quantity")) + " " + a.str("symbol"), divider = false)
                    if (Fmt.sign(h.str("borrowed_quantity")) > 0) KeyValue(t("of_which_borrowed"), Fmt.qty(h.str("borrowed_quantity")))
                    KeyValue(t("average_price"), Fmt.price(h.str("average_price"), dp))
                    KeyValue(t("cost_basis"), Fmt.usd(h.str("cost_basis_usd")))
                    KeyValue(t("market_value"), Fmt.usd(h.str("market_value_usd")))
                    KeyValue(t("unrealized_pnl"), Fmt.signedUsd(h.str("unrealized_pnl_usd")), signColor(h.str("unrealized_pnl_usd")))
                    KeyValue(t("return_pct"), Fmt.pct(h.str("return_pct"), true), signColor(h.str("return_pct")))
                    if (Fmt.sign(h.str("realized_pnl_usd")) != 0) KeyValue(t("realized_pnl"), Fmt.signedUsd(h.str("realized_pnl_usd")), signColor(h.str("realized_pnl_usd")))
                    KeyValue(t("last_updated"), Fmt.dateTime(h.str("price_updated_at")))
                    if (Fmt.sign(h.str("borrowed_quantity")) > 0) { Spacer(Modifier.height(8.dp)); Banner(t("borrowed_note")) }
                    Spacer(Modifier.height(8.dp))
                    Formula(t("formula_holding", "qty" to Fmt.qty(h.str("quantity")), "price" to Fmt.price(h.str("current_price"), dp), "mv" to Fmt.usd(h.str("market_value_usd")), "cost" to Fmt.usd(h.str("cost_basis_usd")), "pnl" to Fmt.signedUsd(h.str("unrealized_pnl_usd")), "pct" to Fmt.pct(h.str("return_pct"), true)))
                }
            }
            val lots = d.arr("lots")
            if (lots.isNotEmpty()) OxCard(title = t("acquisitions"), padding = 0.dp) {
                lots.forEach { lot ->
                    ListRow(Fmt.qty(lot.str("quantity")) + " @ " + Fmt.price(lot.str("unit_price"), dp), Fmt.date(lot.str("acquired_at")) + if (lot.str("funding") == "loan") " · " + t("borrowed") else "",
                        Fmt.usd(lot.str("cost_basis_usd")), t("cost_basis"))
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Trading
@Composable
fun TradeRow(tr: JsonObject, onClick: () -> Unit) {
    val open = tr.str("status") == "open"
    val pnl = if (open) tr.str("unrealized_pnl_usd") else tr.str("realized_pnl_usd")
    ListRow(
        title = (tr.str("symbol") ?: "") + " · " + t("dir_${tr.str("direction")}"),
        subtitle = Fmt.qty(tr.str("quantity")) + " @ " + Fmt.price(tr.str("entry_price")) + (tr.str("exit_price")?.let { " → " + Fmt.price(it) } ?: "") + " · " + Fmt.date(tr.str("closed_at") ?: tr.str("opened_at")),
        trailing = pnl?.let { Fmt.signedUsd(it) } ?: "—", trailingColor = signColor(pnl),
        trailingSub = if (open) t("unrealized") else if (tr.str("status") == "reversed") t("status_reversed") else t("realized"),
        leading = { IconBadge(if (tr.str("direction") == "short") Icons.AutoMirrored.Filled.TrendingDown else Icons.AutoMirrored.Filled.TrendingUp) },
        onClick = onClick, chevron = false,
    )
}

@Composable
fun TradeSheet(tr: JsonObject, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Ox.colors.surface) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
            Text(t("trade_details"), style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 8.dp)) { StatusChip(tr.str("status")); Chip(t("type_${tr.str("trade_type")}")); Chip(t("dir_${tr.str("direction")}")) }
            KeyValue(t("asset"), (tr.str("symbol") ?: "") + " · " + (tr.str("asset_name") ?: ""), divider = false)
            KeyValue(t("quantity"), Fmt.qty(tr.str("quantity")))
            KeyValue(t("entry_price"), Fmt.price(tr.str("entry_price")))
            KeyValue(t("exit_price"), tr.str("exit_price")?.let { Fmt.price(it) } ?: "—")
            KeyValue(t("fees"), Fmt.usd(tr.str("fee_usd")))
            tr.str("gross_pnl_usd")?.let { KeyValue(t("gross_pnl"), Fmt.signedUsd(it), signColor(it)) }
            tr.str("realized_pnl_usd")?.let { KeyValue(t("realized_pnl"), Fmt.signedUsd(it), signColor(it)) }
            if (tr.str("status") == "open") KeyValue(t("unrealized_pnl"), Fmt.signedUsd(tr.str("unrealized_pnl_usd")), signColor(tr.str("unrealized_pnl_usd")))
            KeyValue(t("opened_at"), Fmt.dateTime(tr.str("opened_at")))
            tr.str("closed_at")?.let { KeyValue(t("closed_at"), Fmt.dateTime(it)) }
            tr.str("reference")?.let { KeyValue(t("reference"), it) }
            Text(t("times_in_tz", "tz" to Fmt.tzLabel()), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
fun TradingScreen(nav: NavHostController) {
    var sheet by remember { mutableStateOf<JsonObject?>(null) }
    val l = rememberLoad(Unit, pollMs = 60_000) {
        Triple(api.get("/api/trading/monitor").data()!!, api.get("/api/trades", mapOf("per_page" to 8)).dataList(), api.get("/api/dashboard").data()!!)
    }
    Screen(t("trading_title")) {
        LoadedColumn(l) { (m, trades, d) ->
            val per = m.obj("periods")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 2) {
                MetricTile(t("main_balance"), Fmt.usd(d.str("cash_balance_usd")), t("cash_balance"), modifier = Modifier.weight(1f))
                MetricTile(t("trading_balance"), Fmt.usd(m.str("trading_balance_usd")), t("cash_for_trading"), modifier = Modifier.weight(1f))
                MetricTile(t("loss_balance"), Fmt.usd(m.str("realized_losses_usd")), t("realized_trade_losses"), if (Fmt.sign(m.str("realized_losses_usd")) != 0) Ox.colors.loss else Ox.colors.text, modifier = Modifier.weight(1f))
                MetricTile(t("unrealized_open_trades"), Fmt.signedUsd(m.str("unrealized_pnl_usd")), t("open_trades_count", "n" to Fmt.int(m.str("open_trades"))), signColor(m.str("unrealized_pnl_usd")), modifier = Modifier.weight(1f))
            }
            OxCard(title = t("realized_trading_pnl")) {
                listOf("today" to "todays_profit", "yesterday" to "yesterdays_profit", "last_7_days" to "last_7_days", "last_30_days" to "last_30_days", "last_1_year" to "last_1_year", "all_time" to "all_time")
                    .forEachIndexed { i, (k, label) -> KeyValue(t(label), Fmt.signedUsd(per.str(k)), signColor(per.str(k)), divider = i > 0) }
                Text(t("periods_note", "tz" to (m.str("timezone") ?: "")), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, modifier = Modifier.padding(top = 8.dp))
            }
            OxCard(title = t("trade_records"), padding = 0.dp, action = { TextButton(onClick = { nav.go("trades") }) { Text(t("trade_history")) } }) {
                if (trades.isEmpty()) EmptyState(t("empty_trades_title"), t("empty_trades_body"))
                trades.forEach { tr -> TradeRow(tr) { sheet = tr } }
            }
            OxCard(title = t("how_calculated")) {
                Text(t("def_trading_periods"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2)
                Spacer(Modifier.height(6.dp))
                Text(t("def_trading_unrealized"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2)
                Spacer(Modifier.height(8.dp))
                Formula(t("formula_trade"))
            }
            Banner(t("no_execution_note"))
        }
    }
    sheet?.let { TradeSheet(it) { sheet = null } }
}

@Composable
fun TradesScreen(nav: NavHostController) {
    var status by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    var sheet by remember { mutableStateOf<JsonObject?>(null) }
    val l = rememberLoad(status, page) { api.get("/api/trades", mapOf("status" to status, "page" to page)) }
    Screen(t("trade_history"), nav, back = true) {
        LoadedColumn(l) { r ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("" to "all_statuses", "open" to "status_open", "closed" to "status_closed", "reversed" to "status_reversed").forEach { (v, label) ->
                    FilterChip(selected = status == v, onClick = { status = v; page = 1 }, label = { Text(t(label)) })
                }
            }
            val rows = r.dataList()
            OxCard(padding = 0.dp) {
                if (rows.isEmpty()) EmptyState(t("empty_trades_title"), t("empty_trades_body"))
                rows.forEach { tr -> TradeRow(tr) { sheet = tr } }
            }
            Pager(page, r.meta().int("pages")) { page = it }
        }
    }
    sheet?.let { TradeSheet(it) { sheet = null } }
}

@Composable
fun Pager(page: Int, pages: Int, onPage: (Int) -> Unit) {
    if (pages <= 1) return
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { onPage(page - 1) }, enabled = page > 1) { Text(t("previous")) }
        Text(t("page_of", "page" to Fmt.int(page), "pages" to Fmt.int(pages)), modifier = Modifier.weight(1f), color = Ox.colors.text2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        TextButton(onClick = { onPage(page + 1) }, enabled = page < pages) { Text(t("next")) }
    }
}

@Composable
fun PnlScreen(nav: NavHostController) {
    val l = rememberLoad(Unit) { api.get("/api/dashboard").data()!! to api.get("/api/trading/monitor").data()!! }
    Screen(t("pnl_title"), nav, back = true) {
        LoadedColumn(l) { (d, m) ->
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 2) {
                MetricTile(t("todays_profit"), Fmt.signedUsd(d.str("todays_profit_usd")), t("realized_today"), signColor(d.str("todays_profit_usd")), modifier = Modifier.weight(1f))
                MetricTile(t("realized_all_time"), Fmt.signedUsd(d.str("realized_pnl_all_time_usd")), t("after_fees"), signColor(d.str("realized_pnl_all_time_usd")), modifier = Modifier.weight(1f))
                MetricTile(t("unrealized_pnl"), Fmt.signedUsd(d.str("unrealized_pnl_usd")), t("not_realized_yet"), signColor(d.str("unrealized_pnl_usd")), modifier = Modifier.weight(1f))
                MetricTile(t("loss_balance"), Fmt.usd(d.str("loss_balance_usd")), t("realized_losses_all_time"), if (Fmt.sign(d.str("loss_balance_usd")) != 0) Ox.colors.loss else Ox.colors.text, modifier = Modifier.weight(1f))
            }
            OxCard(title = t("unrealized_by_asset")) {
                val hs = d.arr("holdings").filter { Fmt.sign(it.str("quantity")) > 0 }
                if (hs.isEmpty()) Text(t("empty_holdings_body"), color = Ox.colors.text2)
                hs.forEachIndexed { i, h -> KeyValue(h.str("symbol") ?: "", Fmt.signedUsd(h.str("unrealized_pnl_usd")) + " (" + Fmt.pct(h.str("return_pct"), true) + ")", signColor(h.str("unrealized_pnl_usd")), divider = i > 0) }
            }
            OxCard(title = t("realized_trading_pnl")) {
                val per = m.obj("periods")
                listOf("today" to "todays_profit", "last_7_days" to "last_7_days", "last_30_days" to "last_30_days", "all_time" to "all_time")
                    .forEachIndexed { i, (k, label) -> KeyValue(t(label), Fmt.signedUsd(per.str(k)), signColor(per.str(k)), divider = i > 0) }
            }
            OxCard(title = t("definitions")) {
                listOf("def_realized", "def_unrealized", "def_todays_profit", "def_loss_balance", "def_salary_separate").forEach {
                    Text(t(it), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2, modifier = Modifier.padding(bottom = 6.dp))
                }
                Formula(t("formula_example_sol"))
            }
        }
    }
}

// ------------------------------------------------------------------ Activity
@Composable
fun ActivityScreen(nav: NavHostController) {
    var type by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    var sheet by remember { mutableStateOf<Int?>(null) }
    val l = rememberLoad(type, page) { api.get("/api/transactions", mapOf("type" to type, "page" to page)) }
    Screen(t("activity_title"), actions = { TextButton(onClick = { nav.go("trades") }) { Text(t("trades")) } }) {
        LoadedColumn(l) { r ->
            Row(Modifier.fillMaxWidth().horizontalScrollRow(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("", "deposit", "withdrawal", "investment_buy", "investment_sale", "trade_close", "loan_disbursement", "loan_repayment", "salary_payment", "reversal").forEach { v ->
                    FilterChip(selected = type == v, onClick = { type = v; page = 1 }, label = { Text(if (v.isEmpty()) t("all_types") else t("tx_$v")) })
                }
            }
            val rows = r.dataList()
            OxCard(padding = 0.dp) {
                if (rows.isEmpty()) EmptyState(t("empty_tx_title"), t("empty_tx_body"))
                rows.forEach { tx -> TxRow(tx) { sheet = tx.int("id") } }
            }
            Pager(page, r.meta().int("pages")) { page = it }
        }
    }
    sheet?.let { TxDetailSheet(it) { sheet = null } }
}

@Composable
private fun Modifier.horizontalScrollRow(): Modifier = this.horizontalScroll(androidx.compose.foundation.rememberScrollState())

// ------------------------------------------------------------------ Loans
@Composable
fun LoansScreen(nav: NavHostController) {
    val l = rememberLoad(Unit, pollMs = 60_000) { api.get("/api/loans").dataList() }
    Screen(t("loans_title"), nav, back = true) {
        LoadedColumn(l) { rows ->
            Banner(t("loans_note"))
            OxCard(padding = 0.dp) {
                if (rows.isEmpty()) EmptyState(t("empty_loans_title"), t("empty_loans_body"))
                rows.forEach { ln ->
                    val coin = ln.str("denomination") == "COIN"
                    ListRow(
                        title = (if (coin) (ln.str("symbol") ?: "") + " " + t("coin_loan") else t("usd_loan")) + " #" + ln.str("id"),
                        subtitle = Fmt.date(ln.str("loan_date")) + " · " + (if (coin) Fmt.qty(ln.str("outstanding_quantity")) + " " + ln.str("symbol") else Fmt.usd(ln.str("outstanding_usd"))) + " " + t("outstanding_lc"),
                        trailing = Fmt.usd(ln.str("current_liability_usd")),
                        trailingSub = if (ln.str("status") != "active") t("status_${ln.str("status")}") else if (coin && ln.bool("price_stale")) t("stale") else t("current_value"),
                        leading = { IconBadge(Icons.Default.AccountBalance, Ox.colors.primary, Ox.colors.primarySoft) },
                        onClick = { nav.go("loan/${ln.str("id")}") },
                    )
                }
            }
        }
    }
}

@Composable
fun LoanScreen(nav: NavHostController, id: Int) {
    val l = rememberLoad(id) { api.get("/api/loans/$id").data()!! }
    Screen(t("loan_details"), nav, back = true) {
        LoadedColumn(l) { ln ->
            val coin = ln.str("denomination") == "COIN"
            OxCard {
                Row(verticalAlignment = Alignment.CenterVertically) { Text(t("current_liability"), color = Ox.colors.text2, modifier = Modifier.weight(1f)); StatusChip(ln.str("status")) }
                Text(Fmt.usd(ln.str("current_liability_usd")), fontSize = 30.sp, fontWeight = FontWeight.Bold)
                if (coin && ln.bool("price_stale")) Text(t("stale"), color = Ox.colors.warn, style = MaterialTheme.typography.bodySmall)
            }
            OxCard(title = t("loan_summary")) {
                KeyValue(t("loan_type"), if (coin) t("coin_loan") + " (" + ln.str("symbol") + ")" else t("usd_loan"), divider = false)
                KeyValue(t("loan_date"), Fmt.date(ln.str("loan_date")))
                if (coin) { KeyValue(t("borrowed_quantity"), Fmt.qty(ln.str("principal_quantity")) + " " + ln.str("symbol")); KeyValue(t("origination_price"), Fmt.price(ln.str("origination_price"))) }
                KeyValue(t("original_principal"), Fmt.usd(ln.str("principal_usd")))
                if (coin) KeyValue(t("outstanding_quantity"), Fmt.qty(ln.str("outstanding_quantity")) + " " + ln.str("symbol")) else KeyValue(t("outstanding_amount"), Fmt.usd(ln.str("outstanding_usd")))
                if (coin) KeyValue(t("current_price"), Fmt.price(ln.str("current_price")))
                KeyValue(t("repaid_total"), Fmt.usd(ln.str("repaid_usd")))
                if (Fmt.sign(ln.str("charges_usd")) != 0) KeyValue(t("fees_interest"), Fmt.usd(ln.str("charges_usd")))
                ln.str("interest_rate_pct")?.let { KeyValue(t("interest_rate"), Fmt.pct(it)) }
                ln.str("due_date")?.let { KeyValue(t("due_date"), Fmt.date(it)) }
                KeyValue(t("last_updated"), Fmt.dateTime(ln.str("updated_at")))
            }
            if (coin) Formula(t("formula_coin_loan", "qty" to Fmt.qty(ln.str("outstanding_quantity")), "sym" to (ln.str("symbol") ?: ""), "price" to Fmt.price(ln.str("current_price")), "value" to Fmt.usd(ln.str("current_liability_usd"))))
            OxCard(title = t("loan_history"), padding = 0.dp) {
                val ev = ln.arr("events")
                if (ev.isEmpty()) EmptyState(t("no_loan_events"))
                ev.forEach { e ->
                    val charge = e.str("kind") == "charge"
                    ListRow(if (charge) t("charge_${e.str("charge_type")}") else t("repayment"), Fmt.dateTime(e.str("paid_at")) + (e.str("quantity")?.let { " · " + Fmt.qty(it) } ?: ""),
                        Fmt.usd(e.str("amount_usd")), if (e.str("status") != "completed") t("status_${e.str("status")}") else null)
                }
            }
            Banner(t("loan_equity_note"))
        }
    }
}

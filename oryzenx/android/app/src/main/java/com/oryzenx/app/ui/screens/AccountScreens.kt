@file:OptIn(ExperimentalMaterial3Api::class)

package com.oryzenx.app.ui.screens

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.oryzenx.app.BuildConfig
import com.oryzenx.app.OryzenApp
import com.oryzenx.app.data.Api
import com.oryzenx.app.data.ApiException
import com.oryzenx.app.data.Fmt
import com.oryzenx.app.data.I18n
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
import com.oryzenx.app.ui.components.Banner
import com.oryzenx.app.ui.components.Chip
import com.oryzenx.app.ui.components.EmptyState
import com.oryzenx.app.ui.components.IconBadge
import com.oryzenx.app.ui.components.KeyValue
import com.oryzenx.app.ui.components.ListRow
import com.oryzenx.app.ui.components.OxCard
import com.oryzenx.app.ui.components.OxTextField
import com.oryzenx.app.ui.components.PrimaryButton
import com.oryzenx.app.ui.components.SecondaryButton
import com.oryzenx.app.ui.components.SectionTitle
import com.oryzenx.app.ui.components.Skeleton
import com.oryzenx.app.ui.components.StatusChip
import com.oryzenx.app.ui.go
import com.oryzenx.app.ui.theme.Ox
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream

// ------------------------------------------------------------------ shared helpers
/** Server messages are shown as-is; field errors map onto inputs. */
fun errText(e: Throwable): String = (e as? ApiException)?.message ?: t("err_generic")

/**
 * Reads a picked image and re-encodes it as JPEG (max 2000 px, quality 85) before upload, so mobile
 * data use stays low. The server re-encodes again and enforces its own limits; this is only a first pass.
 */
fun readImageForUpload(ctx: Context, uri: Uri, maxPx: Int = 2000): ByteArray? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= maxPx || bounds.outHeight / (sample * 2) >= maxPx) sample *= 2
    val bmp = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
    val scale = minOf(1f, maxPx.toFloat() / maxOf(bmp.width, bmp.height))
    val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
    ByteArrayOutputStream().use { s -> out.compress(Bitmap.CompressFormat.JPEG, 85, s); s.toByteArray() }
}.getOrNull()

private val JPEG = "image/jpeg".toMediaType()

@Composable
fun rememberSnack(): SnackbarHostState = remember { SnackbarHostState() }

@Composable
fun MenuRow(icon: ImageVector, title: String, end: String? = null, badge: Int = 0, onClick: () -> Unit) {
    ListRow(title, trailing = if (badge > 0) Fmt.int(badge) else null, trailingSub = end, trailingColor = Ox.colors.loss,
        leading = { IconBadge(icon) }, onClick = onClick)
}

@Composable
fun ConfirmDialog(title: String, body: String, confirm: String, danger: Boolean = false, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(body) },
        confirmButton = { TextButton(onClick = { onDismiss(); onConfirm() }) { Text(confirm, color = if (danger) Ox.colors.loss else Ox.colors.primary) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("cancel")) } },
    )
}

@Composable
fun SwitchRow(label: String, desc: String? = null, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.SemiBold)
            if (desc != null) Text(desc, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
fun SelectField(label: String, options: List<Pair<String, String>>, value: String, error: String? = null, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val supporting: (@Composable () -> Unit)? = if (error != null) { { Text(error) } } else null
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = options.firstOrNull { it.first == value }?.second ?: "", onValueChange = {}, readOnly = true, label = { Text(label) },
            placeholder = { Text(t("select")) }, isError = error != null, supportingText = supporting,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (v, l) -> DropdownMenuItem(text = { Text(l) }, onClick = { onSelect(v); open = false }) }
        }
    }
}

// ------------------------------------------------------------------ Salary & payment details
@Composable
fun SalaryScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val snack = rememberSnack()
    var record by remember { mutableStateOf<JsonObject?>(null) }
    var form by remember { mutableStateOf<Int?>(null) } // 0 = new, >0 = edit method id
    var removing by remember { mutableStateOf<JsonObject?>(null) }
    var asked by remember { mutableStateOf(false) }
    val l = rememberLoad(Unit) { api.get("/api/salary").data()!! to api.get("/api/payment-methods").dataList() }
    fun msg(s: String) = scope.launch { snack.showSnackbar(s) }

    Screen(t("salary_title"), nav, back = true) {
        Box {
            LoadedColumn(l) { (d, methods) ->
                val sc = d.obj("schedule")
                val details = d.arr("payment_details")
                LaunchedEffect(sc, details.size) { if (sc != null && details.isEmpty() && !asked) { asked = true; form = 0 } }
                OxCard(title = t("salary_schedule")) {
                    if (sc == null) EmptyState(t("no_schedule_title"), t("no_schedule_body"))
                    else {
                        KeyValue(t("salary_amount"), Fmt.qty(sc.str("amount"), 2) + " " + sc.str("currency"), divider = false)
                        KeyValue(t("payment_day"), t("day_of_month", "day" to Fmt.int(sc.str("pay_day"))))
                        KeyValue(t("period"), t("monthly"))
                        KeyValue(t("payment_method"), sc.str("payment_method_name") ?: t("not_set"))
                        KeyValue(t("status"), if (sc.bool("is_active")) t("status_active") else t("inactive"))
                    }
                }
                OxCard(title = t("payment_details"), padding = 0.dp, action = { TextButton(onClick = { form = 0 }) { Text(t("add")) } }) {
                    if (details.isEmpty()) Text(t("no_payment_details"), color = Ox.colors.text2, modifier = Modifier.padding(16.dp))
                    details.forEach { pd ->
                        val masked = pd.obj("details_masked")?.values?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.joinToString(" · ").orEmpty()
                        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            IconBadge(Icons.Default.AccountBalanceWallet)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(pd.str("name") ?: "", fontWeight = FontWeight.SemiBold)
                                Text(masked, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                                if (pd.bool("is_primary")) Chip(t("primary"), "primary")
                                else TextButton(onClick = {
                                    scope.launch { runCatching { api.post("/api/payment-details/${pd.int("payment_method_id")}/primary") }.onSuccess { msg(t("saved")); l.reload() }.onFailure { msg(errText(it)) } }
                                }) { Text(t("make_primary")) }
                            }
                            IconButton(onClick = { form = pd.int("payment_method_id") }) { Icon(Icons.Default.Edit, t("edit") + " " + pd.str("name")) }
                            IconButton(onClick = { removing = pd }) { Icon(Icons.Default.Delete, t("remove") + " " + pd.str("name")) }
                        }
                        HorizontalDivider(color = Ox.colors.border)
                    }
                }
                OxCard(title = t("monthly_history"), padding = 0.dp) {
                    val recs = d.arr("records")
                    if (recs.isEmpty()) EmptyState(t("no_salary_records_title"), t("no_salary_records_body"))
                    recs.forEach { r ->
                        ListRow(r.str("period") ?: "", t("expected") + " " + Fmt.qty(r.str("expected_amount"), 2) + " " + r.str("currency") + (r.str("payment_date")?.let { " · " + Fmt.date(it) } ?: ""),
                            r.str("actual_amount")?.let { Fmt.qty(it, 2) + " " + r.str("currency") } ?: "—", t("status_${r.str("status")}"),
                            leading = { IconBadge(Icons.Default.AccountBalanceWallet, if (r.str("status") == "paid") Ox.colors.gain else Ox.colors.text2) },
                            onClick = { record = r }, chevron = false)
                    }
                }
                Banner(t("salary_separate_note"))

                form?.let { mid ->
                    PaymentForm(methods, if (mid > 0) mid else null, firstTime = details.isEmpty() && mid == 0, nav = nav,
                        onDone = { form = null; msg(t("payment_saved")); l.reload() }, onDismiss = { form = null })
                }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
    record?.let { r ->
        ModalBottomSheet(onDismissRequest = { record = null }, containerColor = Ox.colors.surface) {
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
                Text(t("salary_for", "period" to r.str("period")), style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                StatusChip(r.str("status"))
                KeyValue(t("expected_amount"), Fmt.qty(r.str("expected_amount"), 2) + " " + r.str("currency"), divider = false)
                KeyValue(t("actual_amount"), r.str("actual_amount")?.let { Fmt.qty(it, 2) + " " + r.str("currency") } ?: "—")
                KeyValue(t("due_date"), Fmt.date(r.str("due_date")))
                KeyValue(t("payment_date"), r.str("payment_date")?.let { Fmt.date(it) } ?: "—")
                KeyValue(t("payment_method"), r.str("payment_method_name") ?: "—")
                KeyValue(t("reference"), r.str("reference") ?: "—")
            }
        }
    }
    removing?.let { pd ->
        ConfirmDialog(t("remove_payment_title"), t("remove_payment_body", "name" to pd.str("name")), t("remove"), danger = true, onConfirm = {
            scope.launch { runCatching { api.delete("/api/payment-details/${pd.int("payment_method_id")}") }.onSuccess { msg(t("removed")); l.reload() }.onFailure { msg(errText(it)) } }
        }, onDismiss = { removing = null })
    }
}

@Composable
private fun PaymentForm(methods: List<JsonObject>, methodId: Int?, firstTime: Boolean, nav: NavHostController, onDone: () -> Unit, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val v = AppState.user.obj("verification")
    val blocked = v.bool("identity_required") && v.str("identity_status") != "approved"
    var selected by remember { mutableStateOf(methodId ?: methods.firstOrNull()?.int("id") ?: 0) }
    val values = remember(selected) { mutableStateMapOf<String, String>() }
    var errors by remember(selected) { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var general by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Ox.colors.surface) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (firstTime) t("add_payment_first") else t("payment_details"), style = MaterialTheme.typography.titleLarge)
            when {
                blocked -> {
                    Banner(t("identity_required_payment"), "warn", Icons.Default.Security)
                    PrimaryButton(t("complete_verification"), { onDismiss(); nav.go("verification") }, Modifier.fillMaxWidth())
                }
                methods.isEmpty() -> Text(t("no_methods_enabled"), color = Ox.colors.text2)
                else -> {
                    if (firstTime) Text(t("add_payment_first_body"), color = Ox.colors.text2, style = MaterialTheme.typography.bodySmall)
                    SelectField(t("payment_method"), methods.map { (it.int("id").toString()) to (it.str("name") ?: "") }, selected.toString()) { selected = it.toInt() }
                    val m = methods.firstOrNull { it.int("id") == selected } ?: return@Column
                    val instr = if (I18n.locale != "en" && I18n.has("pm_instr_" + m.str("code"))) t("pm_instr_" + m.str("code")) else m.str("instructions")
                    if (!instr.isNullOrBlank()) Text(instr, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2)
                    val fields = runCatching { m["fields"]!!.jsonArray.map { it as JsonObject } }.getOrDefault(emptyList())
                    fields.forEach { fd ->
                        val key = fd.str("key") ?: return@forEach
                        val label = if (I18n.has("pm_field_$key")) t("pm_field_$key") else fd.str("label") ?: key
                        val req = fd.bool("required")
                        if (fd.str("type") == "select") {
                            val opts = runCatching { fd["options"]!!.jsonArray.map { it.jsonPrimitive.content } }.getOrDefault(emptyList())
                            SelectField(label + if (req) "" else " " + t("optional_paren"), opts.map { it to it }, values[key].orEmpty(), errors[key]) { values[key] = it; errors = errors - key }
                        } else {
                            OxTextField(values[key].orEmpty(), { values[key] = it; errors = errors - key }, label + if (req) "" else " " + t("optional_paren"), error = errors[key],
                                keyboardType = if (key.contains("number") || key.contains("account")) KeyboardType.Ascii else KeyboardType.Text)
                        }
                    }
                    general?.let { Banner(it, "err", Icons.Default.Error) }
                    PrimaryButton(t("save"), {
                        // Client checks mirror the server rules; the server remains authoritative.
                        val errs = mutableMapOf<String, String>()
                        fields.forEach { fd ->
                            val key = fd.str("key") ?: return@forEach
                            val value = values[key].orEmpty().trim()
                            if (fd.bool("required") && value.isEmpty()) errs[key] = t("v_required")
                            else if (value.isNotEmpty()) fd.str("pattern")?.let { p -> if (runCatching { !Regex(p).matches(value) }.getOrDefault(false)) errs[key] = t("field_invalid") }
                        }
                        errors = errs
                        if (errs.isEmpty()) scope.launch {
                            busy = true; general = null
                            try {
                                api.post("/api/payment-details", Api.body("payment_method_id" to selected, "details" to buildJsonObject { values.forEach { (k, v) -> put(k, JsonPrimitive(v.trim())) } }))
                                onDone()
                            } catch (e: ApiException) {
                                errors = e.fields.mapKeys { it.key.removePrefix("details.") }
                                general = e.message
                            } finally { busy = false }
                        }
                    }, Modifier.fillMaxWidth(), loading = busy)
                    Text(t("payment_security_note"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Notifications
fun notifIcon(type: String?): Pair<ImageVector, String> = when (type) {
    "realized_profit" -> Icons.Default.ShowChart to "gain"
    "realized_loss" -> Icons.Default.ShowChart to "loss"
    "salary_status" -> Icons.Default.AccountBalanceWallet to ""
    "loan_status" -> Icons.Default.AccountBalance to ""
    "verification_decision" -> Icons.Default.Verified to "primary"
    "security" -> Icons.Default.Security to "loss"
    else -> Icons.Default.Notifications to ""
}

@Composable
fun NotificationsScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    var page by remember { mutableStateOf(1) }
    var open by remember { mutableStateOf<JsonObject?>(null) }
    val readIds = remember { mutableStateMapOf<Int, Boolean>() }
    val l = rememberLoad(page) { api.get("/api/notifications", mapOf("page" to page)).also { AppState.unread = it.meta().int("unread") } }
    Screen(t("notifications"), nav, back = true, actions = {
        TextButton(onClick = { scope.launch { runCatching { api.post("/api/notifications/read") }.onSuccess { AppState.unread = 0; l.reload() } } }) { Text(t("mark_all_read")) }
    }) {
        LoadedColumn(l) { r ->
            val rows = r.dataList()
            OxCard(padding = 0.dp) {
                if (rows.isEmpty()) EmptyState(t("empty_notifications_title"), t("empty_notifications_body"), Icons.Default.Notifications)
                rows.forEach { n ->
                    val id = n.int("id")
                    val read = n.str("read_at") != null || readIds[id] == true
                    val (icon, kind) = notifIcon(n.str("type"))
                    val tint = when (kind) { "gain" -> Ox.colors.gain; "loss" -> Ox.colors.loss; "primary" -> Ox.colors.primary; else -> Ox.colors.text2 }
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            open = n
                            if (!read) scope.launch { runCatching { api.post("/api/notifications/read", Api.body("id" to id)) }.onSuccess { readIds[id] = true; AppState.unread = (AppState.unread - 1).coerceAtLeast(0) } }
                        }.padding(16.dp),
                    ) {
                        IconBadge(icon, tint)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(n.str("title") ?: "", fontWeight = if (read) FontWeight.Normal else FontWeight.SemiBold, color = if (read) Ox.colors.text2 else Ox.colors.text)
                            Text(n.str("body") ?: "", style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, maxLines = 3)
                            Text(Fmt.ago(n.str("created_at")), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                        }
                        if (!read) Box(Modifier.padding(start = 8.dp, top = 6.dp).size(8.dp).clip(CircleShape).background(Ox.colors.loss))
                    }
                    HorizontalDivider(color = Ox.colors.border)
                }
            }
            Pager(page, r.meta().int("pages")) { page = it }
        }
    }
    open?.let { n ->
        ModalBottomSheet(onDismissRequest = { open = null }, containerColor = Ox.colors.surface) {
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
                Text(n.str("title") ?: "", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                Text(n.str("body") ?: "")
                Spacer(Modifier.height(8.dp))
                Text(Fmt.dateTime(n.str("created_at")), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
            }
        }
    }
}

// ------------------------------------------------------------------ More
@Composable
fun Avatar(name: String?, hasPhoto: Boolean, size: Int = 56) {
    val initials = (name ?: "?").split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }
    Box(Modifier.size(size.dp).clip(CircleShape).background(Ox.colors.primarySoft), contentAlignment = Alignment.Center) {
        // The photo is served from an authenticated endpoint; initials are shown in-app to avoid
        // sending the bearer token through an image loader.
        Text(initials.ifEmpty { "?" }, color = Ox.colors.primary, fontWeight = FontWeight.Bold)
        if (hasPhoto) Box(Modifier.align(Alignment.BottomEnd).size(12.dp).clip(CircleShape).background(Ox.colors.gain))
    }
}

@Composable
fun VerificationChip() {
    val v = AppState.user.obj("verification")
    when {
        v.bool("fully_verified") -> Chip(t("verified"), "gain")
        v.str("identity_status") == "pending" -> Chip(t("under_review"), "warn")
        else -> Chip(t("verification_incomplete"), "warn")
    }
}

@Composable
fun MoreScreen(nav: NavHostController) {
    var confirm by remember { mutableStateOf(false) }
    val u = AppState.user
    LaunchedEffect(Unit) { runCatching { AppState.unread = api.get("/api/notifications", mapOf("per_page" to 1)).meta().int("unread") } }
    Screen(t("more_title")) {
        Column(Modifier.verticalScrollCompat().padding(horizontal = 16.dp, vertical = 8.dp)) {
            OxCard(modifier = Modifier.clickable { nav.go("profile") }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(u.str("full_name"), u.str("avatar_url") != null)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(u.str("full_name") ?: "", fontWeight = FontWeight.Bold)
                        Text(u.str("email") ?: "", style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                        Spacer(Modifier.height(4.dp))
                        VerificationChip()
                    }
                }
            }
            SectionTitle(t("account"))
            OxCard(padding = 0.dp) {
                MenuRow(Icons.Default.Verified, t("verification_status")) { nav.go("verification") }
                MenuRow(Icons.Default.AccountBalanceWallet, t("salary_payments")) { nav.go("salary") }
                MenuRow(Icons.Default.AccountBalance, t("loans_title")) { nav.go("loans") }
                MenuRow(Icons.Default.ShowChart, t("markets")) { nav.go("markets") }
                MenuRow(Icons.Default.Notifications, t("notifications"), badge = AppState.unread) { nav.go("notifications") }
            }
            SectionTitle(t("settings"))
            OxCard(padding = 0.dp) {
                MenuRow(Icons.Default.Security, t("security_settings")) { nav.go("security") }
                MenuRow(Icons.Default.Tune, t("notification_settings")) { nav.go("notification-settings") }
                MenuRow(Icons.Default.Language, t("language"), if (I18n.locale == "bn") "বাংলা" else "English") { nav.go("language") }
                MenuRow(Icons.Default.Palette, t("appearance"), t("theme_" + AppState.theme)) { nav.go("appearance") }
            }
            SectionTitle(t("support_legal"))
            OxCard(padding = 0.dp) {
                MenuRow(Icons.Default.SupportAgent, t("help_support")) { nav.go("help") }
                MenuRow(Icons.Default.Description, t("legal_documents")) { nav.go("legal") }
            }
            Spacer(Modifier.height(20.dp))
            SecondaryButton(t("sign_out"), { confirm = true }, Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Text("OryzenX ${BuildConfig.VERSION_NAME} · " + t("monitoring_disclaimer"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Spacer(Modifier.height(24.dp))
        }
    }
    if (confirm) ConfirmDialog(t("sign_out"), t("sign_out_confirm"), t("sign_out"), onConfirm = { signOut(nav) }, onDismiss = { confirm = false })
}

@Composable
private fun Modifier.verticalScrollCompat(): Modifier = this.verticalScroll(rememberScrollState())

// ------------------------------------------------------------------ Profile
@Composable
fun ProfileScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val snack = rememberSnack()
    val ctx = LocalContext.current
    val l = rememberLoad(Unit) { api.get("/api/me/profile").data()!! }
    var uploading by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            uploading = true
            val bytes = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { readImageForUpload(ctx, uri, 1024) }
            if (bytes == null) { snack.showSnackbar(t("err_generic")); uploading = false; return@launch }
            runCatching {
                api.upload("/api/me/avatar", MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("avatar", "avatar.jpg", bytes.toRequestBody(JPEG)).build())
            }.onSuccess { r ->
                snack.showSnackbar(t("photo_updated_size", "kb" to Fmt.int((r.data().int("bytes") / 1024))))
                runCatching { AppState.user = api.get("/api/me").data().obj("user") ?: AppState.user }
            }.onFailure { snack.showSnackbar(errText(it)) }
            uploading = false
        }
    }
    Screen(t("profile_title"), nav, back = true) {
        Box {
            LoadedColumn(l) { d ->
                val u = d.obj("user")
                val p = d.obj("profile")
                var name by remember { mutableStateOf(u.str("full_name").orEmpty()) }
                var phone by remember { mutableStateOf(u.str("phone").orEmpty()) }
                var address by remember { mutableStateOf(p.str("address_line").orEmpty()) }
                var city by remember { mutableStateOf(p.str("city").orEmpty()) }
                var country by remember { mutableStateOf(p.str("country").orEmpty()) }
                var postal by remember { mutableStateOf(p.str("postal_code").orEmpty()) }
                var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
                var busy by remember { mutableStateOf(false) }
                OxCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(u.str("full_name"), u.str("avatar_url") != null, 64)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(u.str("full_name") ?: "", fontWeight = FontWeight.Bold)
                            Text(t("member_since", "date" to Fmt.date(u.str("created_at"))), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    SecondaryButton(if (uploading) t("uploading") else t("change_photo"), { if (!uploading) picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.fillMaxWidth())
                }
                OxCard(title = t("personal_details")) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OxTextField(name, { name = it; errors = errors - "full_name" }, t("full_name"), errors["full_name"])
                        OxTextField(u.str("email").orEmpty(), {}, t("email"), enabled = false, hint = t("email_change_note").takeIf { I18n.has("email_change_note") })
                        OxTextField(phone, { phone = it; errors = errors - "phone" }, t("phone") + " " + t("optional_paren"), errors["phone"], keyboardType = KeyboardType.Phone)
                        OxTextField(address, { address = it }, t("address") + " " + t("optional_paren"), errors["address_line"])
                        OxTextField(city, { city = it }, t("city") + " " + t("optional_paren"), errors["city"])
                        OxTextField(country, { country = it }, t("country") + " " + t("optional_paren"), errors["country"])
                        OxTextField(postal, { postal = it }, t("postal_code") + " " + t("optional_paren"), errors["postal_code"])
                        PrimaryButton(t("save_changes"), {
                            if (name.trim().length < 2) { errors = mapOf("full_name" to t("v_name")); return@PrimaryButton }
                            scope.launch {
                                busy = true
                                try {
                                    val r = api.put("/api/me/profile", Api.body("full_name" to name.trim(), "phone" to phone.trim().ifEmpty { null }, "address_line" to address.trim(), "city" to city.trim(), "country" to country.trim(), "postal_code" to postal.trim()))
                                    r.data().obj("user")?.let { AppState.user = it }
                                    snack.showSnackbar(t("saved"))
                                } catch (e: ApiException) { errors = e.fields; snack.showSnackbar(e.message) } finally { busy = false }
                            }
                        }, Modifier.fillMaxWidth(), loading = busy)
                    }
                }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
}

// ------------------------------------------------------------------ Verification
@Composable
private fun VerificationStep(done: Boolean, title: String, desc: String, state: String? = null) {
    val (icon, tint) = when {
        done -> Icons.Default.CheckCircle to Ox.colors.gain
        state == "pending" -> Icons.Default.HourglassTop to Ox.colors.warn
        state == "rejected" -> Icons.Default.Error to Ox.colors.loss
        else -> Icons.Default.Warning to Ox.colors.text2
    }
    ListRow(title, desc, leading = { IconBadge(icon, tint) })
}

@Composable
fun VerificationScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val snack = rememberSnack()
    val l = rememberLoad(Unit) { api.get("/api/verification").data()!! }
    Screen(t("verification_status"), nav, back = true) {
        Box {
            LoadedColumn(l) { v ->
                OxCard(title = t("verification_steps"), padding = 0.dp) {
                    VerificationStep(v.bool("email_verified"), t("step_email"), if (v.bool("email_verified")) t("email_verified_on", "date" to Fmt.date(v.str("email_verified_at"))) else t("step_email_todo"))
                    if (v.bool("identity_required")) VerificationStep(v.str("identity_status") == "approved", t("step_identity"), t("identity_" + v.str("identity_status")), v.str("identity_status"))
                }
                val latest = v.obj("latest_submission")
                if (latest.str("status") == "rejected" && latest.str("user_message") != null) Banner(t("rejected_reason") + ": " + latest.str("user_message"), "err", Icons.Default.Error)
                if (v.bool("identity_required") && (v.str("identity_status") == "not_submitted" || v.str("identity_status") == "rejected")) {
                    var docType by remember { mutableStateOf("") }
                    var docNo by remember { mutableStateOf("") }
                    var front by remember { mutableStateOf<Uri?>(null) }
                    var back by remember { mutableStateOf<Uri?>(null) }
                    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
                    var busy by remember { mutableStateOf(false) }
                    val pickFront = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { if (it != null) { front = it; errors = errors - "front" } }
                    val pickBack = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { if (it != null) back = it }
                    val img = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    OxCard(title = t("submit_identity")) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(t("identity_intro"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2)
                            SelectField(t("document_type"), listOf("national_id" to t("doc_national_id"), "passport" to t("doc_passport"), "driving_license" to t("doc_driving_license")), docType, errors["document_type"]) { docType = it; errors = errors - "document_type" }
                            OxTextField(docNo, { docNo = it; errors = errors - "document_number" }, t("document_number"), errors["document_number"])
                            Text(t("document_front"), fontWeight = FontWeight.SemiBold)
                            SecondaryButton(if (front != null) t("photo_selected") else t("choose_photo"), { pickFront.launch(img) }, Modifier.fillMaxWidth())
                            errors["front"]?.let { Text(it, color = Ox.colors.loss, style = MaterialTheme.typography.bodySmall) }
                            Text(t("document_hint"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                            Text(t("document_back") + " " + t("optional_paren"), fontWeight = FontWeight.SemiBold)
                            SecondaryButton(if (back != null) t("photo_selected") else t("choose_photo"), { pickBack.launch(img) }, Modifier.fillMaxWidth())
                            PrimaryButton(t("submit_for_review"), {
                                val errs = mutableMapOf<String, String>()
                                if (docType.isEmpty()) errs["document_type"] = t("v_required")
                                if (!Regex("[A-Za-z0-9 -]{5,40}").matches(docNo.trim())) errs["document_number"] = t("v_document_number")
                                if (front == null) errs["front"] = t("v_required")
                                errors = errs
                                if (errs.isEmpty()) scope.launch {
                                    busy = true
                                    try {
                                        val b = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("document_type", docType).addFormDataPart("document_number", docNo.trim())
                                        val fb = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { readImageForUpload(ctx, front!!) } ?: throw ApiException(0, "read", t("err_generic"))
                                        b.addFormDataPart("front", "front.jpg", fb.toRequestBody(JPEG))
                                        back?.let { u -> kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { readImageForUpload(ctx, u) }?.let { b.addFormDataPart("back", "back.jpg", it.toRequestBody(JPEG)) } }
                                        api.upload("/api/verification", b.build())
                                        snack.showSnackbar(t("submitted_for_review"))
                                        runCatching { AppState.user = api.get("/api/me").data().obj("user") ?: AppState.user }
                                        l.reload()
                                    } catch (e: ApiException) { errors = e.fields; snack.showSnackbar(e.message) } finally { busy = false }
                                }
                            }, Modifier.fillMaxWidth(), loading = busy)
                            Text(t("identity_privacy"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                        }
                    }
                }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
}

// ------------------------------------------------------------------ Security
fun deviceLabel(ua: String?): String {
    if (ua.isNullOrBlank()) return t("unknown_device")
    val os = Regex("(Android|iPhone|iPad|Windows|Mac OS X|Linux)").find(ua)?.value?.replace("Mac OS X", "macOS")
    val br = Regex("(OryzenX|Edg|Chrome|Firefox|Safari)").find(ua)?.value?.replace("Edg", "Edge")
    return (br ?: t("browser")) + " · " + (os ?: t("unknown_os"))
}

@Composable
fun SecurityScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val snack = rememberSnack()
    val hasPw = AppState.user.bool("has_password")
    var cur by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var pw2 by remember { mutableStateOf("") }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var confirmOthers by remember { mutableStateOf(false) }
    val l = rememberLoad(Unit) { api.get("/api/me/sessions").data()!! }
    Screen(t("security_settings"), nav, back = true) {
        Box {
            LoadedColumn(l) { d ->
                OxCard(title = if (hasPw) t("change_password") else t("set_password")) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (hasPw) OxTextField(cur, { cur = it; errors = errors - "current_password" }, t("current_password"), errors["current_password"], password = true)
                        OxTextField(pw, { pw = it; errors = errors - "password" }, t("new_password"), errors["password"], hint = t("password_rules"), password = true)
                        OxTextField(pw2, { pw2 = it; errors = errors - "password_confirmation" }, t("confirm_password"), errors["password_confirmation"], password = true)
                        PrimaryButton(t("update_password"), {
                            val errs = mutableMapOf<String, String>()
                            if (hasPw && cur.isEmpty()) errs["current_password"] = t("v_required")
                            if (!Regex("(?=.*[A-Za-z])(?=.*\\d).{10,200}").matches(pw)) errs["password"] = t("password_rules")
                            if (pw != pw2) errs["password_confirmation"] = t("v_password_match")
                            errors = errs
                            if (errs.isEmpty()) scope.launch {
                                busy = true
                                try {
                                    api.post("/api/me/password", Api.body("current_password" to cur.takeIf { hasPw }, "password" to pw, "password_confirmation" to pw2))
                                    cur = ""; pw = ""; pw2 = ""
                                    snack.showSnackbar(t("password_updated"))
                                    l.reload()
                                } catch (e: ApiException) { errors = e.fields; snack.showSnackbar(e.message) } finally { busy = false }
                            }
                        }, Modifier.fillMaxWidth(), loading = busy)
                    }
                }
                OxCard(title = t("active_sessions"), padding = 0.dp, action = { TextButton(onClick = { confirmOthers = true }) { Text(t("sign_out_others")) } }) {
                    d.arr("sessions").forEach { s ->
                        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            IconBadge(if (s.str("kind") == "api") Icons.Default.PhoneAndroid else Icons.Default.Computer)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(s.str("device_name") ?: deviceLabel(s.str("user_agent")), fontWeight = FontWeight.SemiBold)
                                Text(t("last_active", "time" to Fmt.ago(s.str("last_seen_at"))) + " · " + (s.str("ip") ?: ""), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
                            }
                            if (s.bool("current")) Chip(t("this_device"), "primary")
                            else TextButton(onClick = { scope.launch { runCatching { api.delete("/api/me/sessions/${s.int("id")}") }.onSuccess { snack.showSnackbar(t("session_revoked")); l.reload() }.onFailure { snack.showSnackbar(errText(it)) } } }) { Text(t("sign_out")) }
                        }
                        HorizontalDivider(color = Ox.colors.border)
                    }
                }
                OxCard(title = t("login_history"), padding = 0.dp) {
                    d.arr("logins").forEach { lg ->
                        val ok = lg.bool("success"); val sus = lg.bool("suspicious")
                        ListRow(
                            if (ok) t("login_success") + if (lg.str("method") == "google") " · Google" else "" else t("login_failed"),
                            Fmt.dateTime(lg.str("created_at")) + " · " + (lg.str("ip") ?: "") + " · " + deviceLabel(lg.str("user_agent")),
                            trailingSub = if (sus) t("new_device") else null,
                            leading = { IconBadge(if (!ok) Icons.Default.Error else if (sus) Icons.Default.Warning else Icons.AutoMirrored.Filled.Logout, if (!ok || sus) Ox.colors.loss else Ox.colors.text2) },
                        )
                    }
                }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
    if (confirmOthers) ConfirmDialog(t("sign_out_others"), t("sign_out_others_body"), t("sign_out_others"), onConfirm = {
        scope.launch { runCatching { api.post("/api/me/sessions/revoke-others") }.onSuccess { snack.showSnackbar(t("sessions_revoked", "n" to Fmt.int(it.data().int("revoked")))); l.reload() }.onFailure { snack.showSnackbar(errText(it)) } }
    }, onDismiss = { confirmOthers = false })
}

// ------------------------------------------------------------------ Language & appearance
@Composable
fun RadioCard(selected: Boolean, title: String, sub: String?, icon: ImageVector? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected, onClick = onClick, role = Role.RadioButton).heightIn(min = 60.dp).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Spacer(Modifier.width(8.dp))
        if (icon != null) { Icon(icon, null, tint = Ox.colors.text2); Spacer(Modifier.width(10.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3)
        }
    }
}

@Composable
fun LanguageScreen(nav: NavHostController, context: Context) {
    val scope = rememberCoroutineScope()
    Screen(t("language"), nav, back = true) {
        Column(Modifier.padding(16.dp)) {
            OxCard {
                Text(t("language_note"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2)
                Spacer(Modifier.height(8.dp))
                Column(Modifier.selectableGroup()) {
                    listOf(Triple("en", "English", "English"), Triple("bn", "বাংলা", "Bangla")).forEach { (code, name, sub) ->
                        RadioCard(I18n.locale == code, name, sub) {
                            switchLanguage(context, code)
                            scope.launch {
                                runCatching { api.put("/api/me/preferences", Api.body("locale" to code)) }
                                runCatching { I18n.applyRemote(code, api.get("/api/i18n/$code").data() ?: JsonObject(emptyMap())) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AppearanceScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val sysDark = androidx.compose.foundation.isSystemInDarkTheme()
    Screen(t("appearance"), nav, back = true) {
        Column(Modifier.padding(16.dp)) {
            OxCard {
                Text(t("appearance_note"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2)
                Spacer(Modifier.height(8.dp))
                Column(Modifier.selectableGroup()) {
                    listOf("light" to Icons.Default.LightMode, "dark" to Icons.Default.DarkMode, "system" to Icons.Default.Settings).forEach { (mode, icon) ->
                        val sub = when (mode) { "light" -> t("default"); "system" -> t("system_currently", "mode" to t(if (sysDark) "theme_dark" else "theme_light")); else -> null }
                        RadioCard(AppState.theme == mode, t("theme_$mode"), sub, icon) {
                            AppState.theme = mode
                            OryzenApp.instance.session.theme = mode
                            scope.launch { runCatching { api.put("/api/me/preferences", Api.body("theme" to mode)) } }
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Notification settings
@Composable
private fun PrefSwitch(prefs: Map<String, Boolean>, onToggle: (String, Boolean) -> Unit, key: String, label: String, desc: String? = null) =
    SwitchRow(label, desc, prefs[key] == true) { onToggle(key, it) }

@Composable
fun NotificationSettingsScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val snack = rememberSnack()
    val prefs = remember { mutableStateMapOf<String, Boolean>() }
    var threshold by remember { mutableStateOf("5") }
    val l = rememberLoad(Unit) {
        api.get("/api/me/notification-preferences").data()!!.also { p ->
            p.keys.forEach { k -> if (k != "threshold_pct") prefs[k] = p.bool(k) }
            threshold = Fmt.dec(p.str("threshold_pct"))?.toInt()?.toString() ?: "5"
        }
    }
    fun save(key: String, value: Any) = scope.launch {
        runCatching { api.put("/api/me/notification-preferences", Api.body(key to value)) }
            .onSuccess { snack.showSnackbar(t("saved")) }
            .onFailure { if (value is Boolean) prefs[key] = !value; snack.showSnackbar(errText(it)) }
    }
    val onToggle: (String, Boolean) -> Unit = { key, value -> prefs[key] = value; save(key, value) }

    Screen(t("notification_settings"), nav, back = true) {
        Box {
            LoadedColumn(l) { _ ->
                OxCard(title = t("email_notifications")) {
                    PrefSwitch(prefs, onToggle, "email_pnl", t("pref_email_pnl"), t("pref_email_pnl_desc"))
                    PrefSwitch(prefs, onToggle, "email_trades", t("pref_email_trades"))
                    PrefSwitch(prefs, onToggle, "email_salary", t("pref_email_salary"))
                    PrefSwitch(prefs, onToggle, "email_loans", t("pref_email_loans"))
                    PrefSwitch(prefs, onToggle, "email_portfolio_threshold", t("pref_email_threshold"), t("pref_email_threshold_desc"))
                    SelectField(t("threshold"), listOf("3", "5", "10", "20").map { it to Fmt.pct(it) }, threshold) { threshold = it; save("threshold_pct", it) }
                    PrefSwitch(prefs, onToggle, "email_reminders", t("pref_email_reminders"), t("pref_email_reminders_desc"))
                    SwitchRow(t("pref_security"), t("pref_security_desc"), checked = true, enabled = false) {}
                }
                OxCard(title = t("app_notifications")) {
                    PrefSwitch(prefs, onToggle, "push_enabled", t("pref_push_enabled"), t("pref_push_desc"))
                    PrefSwitch(prefs, onToggle, "push_trades", t("pref_push_trades"))
                    PrefSwitch(prefs, onToggle, "push_salary", t("pref_push_salary"))
                    PrefSwitch(prefs, onToggle, "push_security", t("pref_push_security"))
                    if (!BuildConfig.FIREBASE_CONFIGURED) Banner(t("push_not_configured").takeIf { I18n.has("push_not_configured") } ?: t("pref_push_desc"), "warn")
                }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
}

// ------------------------------------------------------------------ Help & legal
@Composable
fun HelpScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val snack = rememberSnack()
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    val open = remember { mutableStateMapOf<Int, Boolean>() }
    Screen(t("help_support"), nav, back = true) {
        Box {
            Column(Modifier.verticalScrollCompat().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionTitle(t("faq"))
                OxCard(padding = 0.dp) {
                    (1..5).forEach { i ->
                        Column(Modifier.fillMaxWidth().clickable { open[i] = open[i] != true }.padding(16.dp)) {
                            Text(t("faq_q$i"), fontWeight = FontWeight.SemiBold)
                            if (open[i] == true) { Spacer(Modifier.height(6.dp)); Text(t("faq_a$i"), color = Ox.colors.text2, style = MaterialTheme.typography.bodySmall) }
                        }
                        if (i < 5) HorizontalDivider(color = Ox.colors.border)
                    }
                }
                OxCard(title = t("contact_support")) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AppState.config.str("support_email")?.let { Text(t("email_us") + " " + it, style = MaterialTheme.typography.bodySmall) }
                        OxTextField(subject, { subject = it; errors = errors - "subject" }, t("subject"), errors["subject"])
                        OxTextField(message, { message = it; errors = errors - "message" }, t("message"), errors["message"], hint = t("message_hint"), singleLine = false, minLines = 5)
                        PrimaryButton(t("send_message"), {
                            val errs = mutableMapOf<String, String>()
                            if (subject.trim().length !in 3..150) errs["subject"] = t("v_subject")
                            if (message.trim().length !in 10..5000) errs["message"] = t("v_message")
                            errors = errs
                            if (errs.isEmpty()) scope.launch {
                                busy = true
                                try {
                                    val r = api.post("/api/support/app", Api.body("subject" to subject.trim(), "message" to message.trim()))
                                    subject = ""; message = ""
                                    snack.showSnackbar(t("support_sent", "ticket" to r.data().str("ticket")))
                                } catch (e: ApiException) { errors = e.fields; snack.showSnackbar(e.message) } finally { busy = false }
                            }
                        }, Modifier.fillMaxWidth(), loading = busy)
                    }
                }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
}

@Composable
fun LegalScreen(nav: NavHostController) {
    val ctx = LocalContext.current
    Screen(t("legal_documents"), nav, back = true) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OxCard(padding = 0.dp) {
                listOf(Triple("privacy", "privacy_policy", Icons.Default.Lock), Triple("terms", "terms", Icons.Default.Description), Triple("risk", "risk_disclosure", Icons.Default.Warning)).forEach { (path, key, icon) ->
                    ListRow(t(key), leading = { IconBadge(icon) }, onClick = {
                        val url = BuildConfig.API_BASE_URL.trimEnd('/') + "/" + path + "?lang=" + I18n.locale
                        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    })
                }
            }
            Banner(t("risk_short"), "warn", Icons.Default.Warning)
        }
    }
}

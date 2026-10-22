@file:OptIn(ExperimentalMaterial3Api::class)

package com.oryzenx.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oryzenx.app.data.ApiException
import com.oryzenx.app.data.Fmt
import com.oryzenx.app.data.t
import com.oryzenx.app.ui.theme.Ox

@Composable
fun OxTopBar(title: String, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    CenterAlignedTopAppBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium) },
        navigationIcon = {
            if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = t("back")) }
        },
        actions = actions,
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = Ox.colors.bg, scrolledContainerColor = Ox.colors.bg),
    )
}

@Composable
fun OxCard(modifier: Modifier = Modifier, title: String? = null, action: (@Composable () -> Unit)? = null, padding: Dp = 16.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Ox.colors.surface)
            .border(1.dp, Ox.colors.border, RoundedCornerShape(16.dp))
            .padding(padding),
    ) {
        if (title != null) {
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                action?.invoke()
            }
        }
        content()
    }
}

/** Amount with explicit sign AND colour (colour is never the only signal). */
@Composable
fun SignedAmount(value: String?, style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyMedium, suffix: String = "") {
    val c = when (Fmt.sign(value)) { 1 -> Ox.colors.gain; -1 -> Ox.colors.loss; else -> Ox.colors.text }
    Text(Fmt.signedUsd(value) + suffix, color = c, style = style.copy(fontWeight = FontWeight.SemiBold))
}

@Composable
fun signColor(value: String?): Color = when (Fmt.sign(value)) { 1 -> Ox.colors.gain; -1 -> Ox.colors.loss; else -> Ox.colors.text }

@Composable
fun MetricTile(label: String, value: String, sub: String? = null, valueColor: Color = Ox.colors.text, icon: ImageVector? = null, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Ox.colors.surface)
            .border(1.dp, Ox.colors.border, RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .heightIn(min = 92.dp)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { Icon(icon, null, tint = Ox.colors.text3, modifier = Modifier.size(15.dp)); Spacer(Modifier.width(6.dp)) }
            Text(label, style = MaterialTheme.typography.labelMedium, color = Ox.colors.text2, maxLines = 2)
        }
        Text(value, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = valueColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, maxLines = 2)
    }
}

@Composable
fun KeyValue(label: String, value: String, valueColor: Color = Ox.colors.text, divider: Boolean = true) {
    if (divider) HorizontalDivider(color = Ox.colors.border)
    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Ox.colors.text2, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(12.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = valueColor, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
    }
}

@Composable
fun ListRow(
    title: String, subtitle: String? = null, trailing: String? = null, trailingSub: String? = null,
    trailingColor: Color = Ox.colors.text, leading: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null, chevron: Boolean = onClick != null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) { leading(); Spacer(Modifier.width(12.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (trailing != null || trailingSub != null) {
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                if (trailing != null) Text(trailing, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = trailingColor, maxLines = 1)
                if (trailingSub != null) Text(trailingSub, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, maxLines = 1)
            }
        }
        if (chevron) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Ox.colors.text3)
    }
}

@Composable
fun CoinBadge(symbol: String, color: String?, size: Dp = 40.dp) {
    val c = runCatching { Color(android.graphics.Color.parseColor(color ?: "#1A56DB")) }.getOrDefault(Ox.colors.primary)
    Box(Modifier.size(size).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
        Text(symbol.take(1), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.36f).sp)
    }
}

@Composable
fun IconBadge(icon: ImageVector, tint: Color = Ox.colors.text2, bg: Color = Ox.colors.surface2) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun Chip(text: String, kind: String = "") {
    val (bg, fg) = when (kind) {
        "gain" -> Ox.colors.gainSoft to Ox.colors.gain
        "loss" -> Ox.colors.lossSoft to Ox.colors.loss
        "warn" -> Ox.colors.warnSoft to Ox.colors.warn
        "info" -> Ox.colors.infoSoft to Ox.colors.info
        "primary" -> Ox.colors.primarySoft to Ox.colors.primary
        else -> Ox.colors.surface2 to Ox.colors.text2
    }
    Text(text, color = fg, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 8.dp, vertical = 3.dp))
}

fun statusKind(status: String?): String = when (status) {
    "completed", "paid", "approved", "repaid", "sent", "resolved" -> "gain"
    "rejected", "failed", "suspended" -> "loss"
    "pending", "reversed", "reversal" -> "warn"
    "active" -> "primary"
    "open", "processed", "queued", "new" -> "info"
    else -> ""
}

@Composable
fun StatusChip(status: String?) = Chip(t("status_${status ?: ""}"), statusKind(status))

@Composable
fun Banner(text: String, kind: String = "info", icon: ImageVector = Icons.Default.Info) {
    val (bg, fg) = when (kind) {
        "warn" -> Ox.colors.warnSoft to Ox.colors.warn
        "err" -> Ox.colors.lossSoft to Ox.colors.loss
        "ok" -> Ox.colors.gainSoft to Ox.colors.gain
        else -> Ox.colors.infoSoft to Ox.colors.info
    }
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(bg).padding(12.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Text(text, color = fg, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun Formula(text: String) {
    Text(text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall, color = Ox.colors.text2,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Ox.colors.surface2).padding(12.dp))
}

/** Shimmer placeholder. Animates only a gradient offset (cheap, frame-rate independent). */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 64.dp, corner: Dp = 12.dp) {
    val tr = rememberInfiniteTransition(label = "skeleton")
    val x by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart), label = "x")
    val base = Ox.colors.surface2
    val hi = Ox.colors.surface
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(corner)).background(
        Brush.linearGradient(listOf(base, hi, base), start = androidx.compose.ui.geometry.Offset(x * 1600f - 400f, 0f), end = androidx.compose.ui.geometry.Offset(x * 1600f, 0f))
    ).semantics { contentDescription = t("loading") })
}

@Composable
fun LoadingList(rows: Int = 4) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Skeleton(height = 140.dp, corner = 16.dp)
        repeat(rows) { Skeleton() }
    }
}

@Composable
fun StateView(icon: ImageVector, title: String, body: String? = null, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(Ox.colors.surface2), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Ox.colors.text3, modifier = Modifier.size(26.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (body != null) Text(body, style = MaterialTheme.typography.bodyMedium, color = Ox.colors.text2, textAlign = TextAlign.Center)
        action?.invoke()
    }
}

@Composable
fun EmptyState(title: String, body: String? = null, icon: ImageVector = Icons.Default.Inbox) = StateView(icon, title, body)

@Composable
fun ErrorState(error: Throwable, onRetry: () -> Unit) {
    val e = error as? ApiException
    val offline = e?.code == "network" || e?.status == 0
    StateView(
        icon = if (offline) Icons.Default.CloudOff else Icons.Default.ErrorOutline,
        title = if (offline) t("state_offline_title") else if (e?.status == 403) t("state_denied_title") else t("state_error_title"),
        body = if (offline) t("state_offline_body") else error.message,
        action = { if (e?.status != 403) OutlinedButton(onClick = onRetry) { Text(t("retry")) } },
    )
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, loading: Boolean = false, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled && !loading, modifier = modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 20.dp)) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        else Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedButton(onClick = onClick, modifier = modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(10.dp)) { Text(text) }
}

@Composable
fun LinkButton(text: String, onClick: () -> Unit) = TextButton(onClick = onClick) { Text(text) }

@Composable
fun OxTextField(
    value: String, onValueChange: (String) -> Unit, label: String, error: String? = null, hint: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text, password: Boolean = false, singleLine: Boolean = true, minLines: Int = 1, enabled: Boolean = true,
) {
    var visible by remember { mutableStateOf(false) }
    val trailing: (@Composable () -> Unit)? = if (password) {
        { IconButton(onClick = { visible = !visible }) { Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, t("show_password")) } }
    } else null
    val supporting: (@Composable () -> Unit)? = when {
        error != null -> { { Text(error) } }
        hint != null -> { { Text(hint) } }
        else -> null
    }
    OutlinedTextField(
        value = value, onValueChange = onValueChange, label = { Text(label) }, isError = error != null, singleLine = singleLine, minLines = minLines, enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboardType),
        visualTransformation = if (password && !visible) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = trailing,
        supportingText = supporting,
        shape = RoundedCornerShape(10.dp),
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 0.8.sp), color = Ox.colors.text2, modifier = Modifier.padding(top = 20.dp, bottom = 8.dp, start = 4.dp))
}

val ScreenPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp)

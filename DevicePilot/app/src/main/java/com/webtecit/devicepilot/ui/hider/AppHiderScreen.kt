package com.webtecit.devicepilot.ui.hider

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.hider.HideableApp
import com.webtecit.devicepilot.security.AppLock
import com.webtecit.devicepilot.security.LockAvailability
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.ConfirmDialog
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AppHiderScreen() {
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val lockReady = remember { AppLock.availability(context) == LockAvailability.READY }
    // The hider always asks for fingerprint / face / screen lock when a screen lock exists.
    var unlocked by rememberSaveable { mutableStateOf(!lockReady) }
    var error by remember { mutableStateOf<String?>(null) }
    val title = stringResource(R.string.hider_unlock_title)
    val subtitle = stringResource(R.string.lock_prompt_subtitle)
    fun unlock() {
        if (activity == null) { unlocked = true; return }
        AppLock.authenticate(activity, title, subtitle, onSuccess = { unlocked = true }, onFail = { error = it })
    }
    LaunchedEffect(Unit) { if (!unlocked) unlock() }

    if (!unlocked) {
        ScreenList {
            item { HeroCard(R.drawable.ill_firewall, stringResource(R.string.hider_locked_title), stringResource(R.string.hider_locked_text)) }
            error?.let { item { Text(it, color = levelColor(Level.BAD), style = MaterialTheme.typography.bodySmall) } }
            item {
                Button(onClick = { error = null; unlock() }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.Fingerprint, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.lock_unlock))
                }
            }
        }
        return
    }
    HiderContent(lockReady)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HiderContent(lockReady: Boolean) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val hider = c.hider
    var reload by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var confirmRemove by remember { mutableStateOf(false) }
    val owner = remember(reload) { hider.isDeviceOwner() }
    val apps by produceState<List<HideableApp>?>(null, reload, owner) { value = if (owner) hider.apps() else emptyList() }
    val failMsg = stringResource(R.string.hider_failed)

    ScreenList {
        item { HeroCard(R.drawable.ill_apps, stringResource(R.string.hider_hero_title), stringResource(R.string.hider_hero_text)) }
        if (!lockReady) item {
            DpCard(color = levelColor(Level.WARN).copy(alpha = 0.10f)) {
                Text(stringResource(R.string.hider_no_lock), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { SystemSettings.open(context, AppLock.enrollIntent(), Intent(Settings.ACTION_SECURITY_SETTINGS)) }) {
                    Text(stringResource(R.string.lock_set_up_screen_lock))
                }
            }
        }
        if (!owner) {
            item { SetupCards(context) }
        } else {
            item {
                DpCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Lock, null, tint = levelColor(Level.GOOD))
                        Spacer(Modifier.width(10.dp))
                        Text(stringResource(R.string.hider_active), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        StatusPill(stringResource(R.string.hider_hidden_count, apps?.count { it.hidden } ?: 0), Level.INFO)
                    }
                }
            }
            item {
                OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
                    label = { Text(stringResource(R.string.apps_search)) }, shape = MaterialTheme.shapes.small)
            }
            val list = apps
            if (list == null) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            else {
                val filtered = list.filter { query.isBlank() || it.label.contains(query, true) || it.packageName.contains(query, true) }
                val hidden = filtered.filter { it.hidden }
                if (hidden.isNotEmpty()) item { SectionTitle(stringResource(R.string.hider_section_hidden)) }
                items(hidden, key = { "h_" + it.packageName }) { app ->
                    HideRow(app, busy == app.packageName) { hide -> toggle(scope, c, app, hide, { busy = it }, { reload++ }, context, failMsg) }
                }
                item { SectionTitle(stringResource(R.string.hider_section_visible)) }
                items(filtered.filter { !it.hidden }, key = { "v_" + it.packageName }) { app ->
                    HideRow(app, busy == app.packageName) { hide -> toggle(scope, c, app, hide, { busy = it }, { reload++ }, context, failMsg) }
                }
            }
            item {
                OutlinedButton(onClick = { confirmRemove = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.hider_remove_owner))
                }
            }
        }
        item { SourceNote(stringResource(R.string.hider_note)) }
    }

    if (confirmRemove) {
        ConfirmDialog(
            title = stringResource(R.string.hider_remove_owner),
            text = stringResource(R.string.hider_remove_owner_text),
            confirm = stringResource(R.string.action_continue),
            destructive = true,
            onConfirm = {
                confirmRemove = false
                scope.launch { hider.removeOwner(); reload++ }
            },
            onDismiss = { confirmRemove = false },
        )
    }
}

private fun toggle(
    scope: kotlinx.coroutines.CoroutineScope,
    c: com.webtecit.devicepilot.AppContainer,
    app: HideableApp,
    hide: Boolean,
    setBusy: (String?) -> Unit,
    reload: () -> Unit,
    context: Context,
    failMsg: String,
) {
    scope.launch {
        setBusy(app.packageName)
        val ok = withContext(Dispatchers.IO) { c.hider.setHidden(app.packageName, hide) }
        setBusy(null)
        if (!ok) Toast.makeText(context, failMsg, Toast.LENGTH_LONG).show()
        reload()
    }
}

@Composable
private fun HideRow(app: HideableApp, busy: Boolean, onToggle: (Boolean) -> Unit) {
    DpCard(contentPadding = 10.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (app.hidden) Icon(Icons.Outlined.VisibilityOff, null, tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(8.dp)) else AppIcon(app.packageName, 36.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(app.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(stringResource(if (app.hidden) R.string.hider_state_hidden else R.string.hider_state_visible),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (app.hidden) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(if (app.hidden) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(6.dp))
            Switch(checked = app.hidden, enabled = !busy, onCheckedChange = onToggle)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SetupCards(context: Context) {
    val c = LocalContainer.current
    val copied = stringResource(R.string.hider_copied)
    Column {
        DpCard {
            Text(stringResource(R.string.hider_why_title), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.hider_why_text), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(12.dp))
        DpCard {
            Text(stringResource(R.string.hider_opt_builtin_title), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.hider_opt_builtin_text), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (Build.VERSION.SDK_INT >= 35) ShortcutButton(stringResource(R.string.hider_private_space), Icons.Outlined.Lock) {
                    SystemSettings.open(context, Intent("android.settings.PRIVATE_SPACE_SETTINGS"),
                        Intent(Settings.ACTION_SECURITY_SETTINGS))
                }
                ShortcutButton(stringResource(R.string.hider_launcher_settings), Icons.Outlined.Home) {
                    SystemSettings.open(context, Intent(Settings.ACTION_HOME_SETTINGS), Intent(Settings.ACTION_SETTINGS))
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        DpCard {
            Text(stringResource(R.string.hider_opt_owner_title), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.hider_opt_owner_text), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            val cmd = c.hider.setupCommand()
            Text(cmd, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            ShortcutButton(stringResource(R.string.hider_copy_command), Icons.Outlined.ContentCopy) {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
                    .setPrimaryClip(ClipData.newPlainText("adb", cmd))
                Toast.makeText(context, copied, Toast.LENGTH_SHORT).show()
            }
        }
    }
}

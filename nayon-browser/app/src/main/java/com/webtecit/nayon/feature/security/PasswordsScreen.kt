package com.webtecit.nayon.feature.security

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Password
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.ConfirmDialog
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SearchField
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.component.SettingsSwitchRow
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.security.SavedLogin
import kotlinx.coroutines.launch

/**
 * Password manager. Opening it asks for fingerprint / face / screen lock (like Chrome), and
 * every password is decrypted only when you choose to see or copy it.
 */
@Composable
fun PasswordsScreen(
    onBack: () -> Unit,
    onOpenSite: (String) -> Unit,
    viewModel: PasswordsViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val context = LocalContext.current
    val logins by viewModel.logins.collectAsStateWithLifecycle()
    val never by viewModel.neverSave.collectAsStateWithLifecycle()
    val offer by viewModel.offerToSave.collectAsStateWithLifecycle()
    val lockAvailable = remember { DeviceLock.available(context) }
    var unlocked by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var expanded by rememberSaveable { mutableStateOf<Long?>(null) }
    var confirmDelete by remember { mutableStateOf<SavedLogin?>(null) }
    var confirmDeleteAll by remember { mutableStateOf(false) }
    val revealed = remember { mutableStateMapOf<Long, String>() }
    val scope = rememberCoroutineScope()
    val title = stringResource(R.string.passwords_title)
    val unlockSubtitle = stringResource(R.string.passwords_unlock_subtitle)

    fun unlock() = DeviceLock.confirm(context, title, unlockSubtitle) { ok -> if (ok) unlocked = true }
    LaunchedEffect(Unit) { if (lockAvailable && !unlocked) unlock() }

    ScreenScaffold(title = title, onBack = onBack) {
        if (!lockAvailable) {
            item {
                MessageState(
                    icon = Icons.Outlined.Lock,
                    title = stringResource(R.string.passwords_need_lock_title),
                    body = stringResource(R.string.passwords_need_lock_body),
                )
            }
            return@ScreenScaffold
        }
        if (!unlocked) {
            item {
                MessageState(
                    icon = Icons.Outlined.Lock,
                    title = stringResource(R.string.passwords_locked_title),
                    body = stringResource(R.string.passwords_locked_body),
                    actionLabel = stringResource(R.string.passwords_unlock),
                    onAction = ::unlock,
                )
            }
            return@ScreenScaffold
        }

        item {
            SettingsGroup(Modifier.padding(top = Spacing.sm)) {
                SettingsSwitchRow(
                    stringResource(R.string.passwords_offer_to_save), offer, { viewModel.setOfferToSave(it) },
                    icon = Icons.Outlined.Key, subtitle = stringResource(R.string.passwords_offer_to_save_desc),
                )
                GroupDivider()
                SettingsRow(
                    stringResource(R.string.passwords_protection), {}, icon = Icons.Outlined.Shield,
                    subtitle = stringResource(R.string.passwords_protection_desc), showChevron = false,
                )
            }
        }

        val all = logins
        if (all == null) return@ScreenScaffold
        if (all.isEmpty()) {
            item {
                MessageState(
                    icon = Icons.Outlined.Password,
                    title = stringResource(R.string.passwords_empty_title),
                    body = stringResource(R.string.passwords_empty_body),
                )
            }
        } else {
            item {
                SearchField(query, { query = it }, stringResource(R.string.passwords_search),
                    Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm))
            }
            val shown = all.filter {
                query.isBlank() || it.origin.contains(query, true) || it.username.contains(query, true)
            }
            item { SectionHeader(stringResource(R.string.passwords_saved_count, all.size)) }
            item {
                SettingsGroup {
                    shown.forEachIndexed { i, login ->
                        if (i > 0) GroupDivider()
                        LoginRow(
                            login = login,
                            expanded = expanded == login.id,
                            revealed = revealed[login.id],
                            onToggle = { expanded = if (expanded == login.id) null else login.id },
                            onReveal = {
                                if (revealed.containsKey(login.id)) revealed.remove(login.id)
                                else scope.launch { viewModel.password(login.id)?.let { revealed[login.id] = it } }
                            },
                            onCopyPassword = { scope.launch { viewModel.password(login.id)?.let { copySecret(context, it) } } },
                            onCopyUser = { copySecret(context, login.username, sensitive = false) },
                            onOpen = { onOpenSite(login.origin) },
                            onDelete = { confirmDelete = login },
                        )
                    }
                }
            }
        }

        if (never.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.passwords_never_saved)) }
            item {
                SettingsGroup {
                    never.forEachIndexed { i, origin ->
                        if (i > 0) GroupDivider()
                        Row(Modifier.fillMaxWidth().padding(start = Spacing.lg, end = Spacing.xs, top = Spacing.xs, bottom = Spacing.xs),
                            verticalAlignment = Alignment.CenterVertically) {
                            SiteIcon(origin, UrlResolver.displayHost(origin), size = 32.dp)
                            Spacer(Modifier.width(Spacing.md))
                            Text(UrlResolver.displayHost(origin), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                            TextButton(onClick = { viewModel.allowSaving(origin) }) { Text(stringResource(R.string.action_remove)) }
                        }
                    }
                }
            }
        }

        if (!all.isNullOrEmpty()) {
            item {
                TextButton(
                    onClick = { confirmDeleteAll = true },
                    modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                ) {
                    Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(Spacing.sm))
                    Text(stringResource(R.string.passwords_delete_all), color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }

    confirmDelete?.let { login ->
        ConfirmDialog(
            title = stringResource(R.string.passwords_delete_title),
            body = stringResource(R.string.passwords_delete_body, UrlResolver.displayHost(login.origin)),
            confirmLabel = stringResource(R.string.action_delete),
            dismissLabel = stringResource(R.string.action_cancel),
            onConfirm = { viewModel.delete(login.id); revealed.remove(login.id); confirmDelete = null },
            onDismiss = { confirmDelete = null },
            destructive = true,
        )
    }
    if (confirmDeleteAll) {
        ConfirmDialog(
            title = stringResource(R.string.passwords_delete_all),
            body = stringResource(R.string.passwords_delete_all_body),
            confirmLabel = stringResource(R.string.action_delete),
            dismissLabel = stringResource(R.string.action_cancel),
            onConfirm = { viewModel.deleteAll(); revealed.clear(); confirmDeleteAll = false },
            onDismiss = { confirmDeleteAll = false },
            destructive = true,
        )
    }
}

@Composable
private fun LoginRow(
    login: SavedLogin,
    expanded: Boolean,
    revealed: String?,
    onToggle: () -> Unit,
    onReveal: () -> Unit,
    onCopyPassword: () -> Unit,
    onCopyUser: () -> Unit,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onToggle)
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SiteIcon(login.origin, UrlResolver.displayHost(login.origin), size = 36.dp)
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Text(UrlResolver.displayHost(login.origin), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(login.username.ifBlank { stringResource(R.string.password_no_username) }, style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        AnimatedVisibility(expanded) {
            Surface(
                shape = RoundedCornerShape(16.dp), color = scheme.surfaceContainerHigh,
                modifier = Modifier.fillMaxWidth().padding(start = Spacing.lg, end = Spacing.lg, bottom = Spacing.md),
            ) {
                Column(Modifier.padding(vertical = Spacing.xs)) {
                    DetailRow(Icons.Outlined.Person, login.username.ifBlank { stringResource(R.string.password_no_username) }) {
                        IconButton(onClick = onCopyUser) { Icon(Icons.Outlined.ContentCopy, stringResource(R.string.passwords_copy_username)) }
                    }
                    HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.5f))
                    DetailRow(Icons.Outlined.Key, revealed ?: "••••••••••", mono = revealed != null) {
                        IconButton(onClick = onReveal) {
                            Icon(if (revealed != null) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, stringResource(R.string.password_show))
                        }
                        IconButton(onClick = onCopyPassword) { Icon(Icons.Outlined.ContentCopy, stringResource(R.string.passwords_copy_password)) }
                    }
                    HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.5f))
                    Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.xs), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = onOpen) {
                            Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(Spacing.sm))
                            Text(stringResource(R.string.passwords_open_site))
                        }
                        TextButton(onClick = onDelete) {
                            Icon(Icons.Outlined.DeleteOutline, null, tint = scheme.error, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(Spacing.sm))
                            Text(stringResource(R.string.action_delete), color = scheme.error)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    mono: Boolean = false,
    actions: @Composable () -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(start = Spacing.lg, end = Spacing.xs).height(52.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(Spacing.md))
        SelectionContainer(Modifier.weight(1f)) {
            Text(text, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
                fontFamily = if (mono) FontFamily.Monospace else null)
        }
        actions()
    }
}

/** Copies to the clipboard, marked sensitive so Android hides it from clipboard previews. */
private fun copySecret(context: Context, text: String, sensitive: Boolean = true) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    val clip = ClipData.newPlainText("NAYON", text)
    if (sensitive) {
        clip.description.extras = PersistableBundle().apply {
            if (Build.VERSION.SDK_INT >= 33) putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
            else putBoolean("android.content.extra.IS_SENSITIVE", true)
        }
    }
    cm.setPrimaryClip(clip)
    if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, R.string.passwords_copied, Toast.LENGTH_SHORT).show()
}


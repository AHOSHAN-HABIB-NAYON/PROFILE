package com.webtecit.nayon.feature.security

import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Flight
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Loyalty
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.ConfirmDialog
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.component.SettingsSwitchRow
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.security.AutofillEntry
import com.webtecit.nayon.data.security.AutofillGroup
import com.webtecit.nayon.data.security.AutofillKind
import com.webtecit.nayon.data.security.CardInfo
import com.webtecit.nayon.data.security.FieldInput
import com.webtecit.nayon.data.security.SecurityRepository
import com.webtecit.nayon.data.settings.BrowserPreferences
import com.webtecit.nayon.data.settings.BrowserPreferencesRepository
import com.webtecit.nayon.feature.browser.autofillSubtitle
import com.webtecit.nayon.feature.browser.autofillTitle
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AutofillViewModel(private val security: SecurityRepository, private val prefsRepo: BrowserPreferencesRepository) : ViewModel() {
    val entries: StateFlow<List<AutofillEntry>?> = security.autofillEntries.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val prefs: StateFlow<BrowserPreferences> = prefsRepo.preferences.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BrowserPreferences())
    val loginCount: StateFlow<Int?> = kotlinx.coroutines.flow.flow { security.logins.collect { emit(it.size) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    suspend fun entry(id: Long) = security.entry(id)
    fun save(kind: AutofillKind, values: Map<String, String>, id: Long, done: () -> Unit) =
        viewModelScope.launch { security.saveEntry(kind, values, id); done() }
    fun delete(id: Long) = viewModelScope.launch { security.deleteEntry(id) }

    fun setSavePasswords(v: Boolean) = viewModelScope.launch { prefsRepo.setSavePasswords(v) }
    fun setSavePayments(v: Boolean) = viewModelScope.launch { prefsRepo.setSavePayments(v) }
    fun setSaveAddresses(v: Boolean) = viewModelScope.launch { prefsRepo.setSaveAddresses(v) }
    fun setVerifyPayments(v: Boolean) = viewModelScope.launch { prefsRepo.setVerifyPayments(v) }
    fun setOtherAutofill(v: Boolean) = viewModelScope.launch { prefsRepo.setOtherAutofillApps(v) }
}

private fun AutofillGroup.icon(): ImageVector = when (this) {
    AutofillGroup.PAYMENTS -> Icons.Outlined.CreditCard
    AutofillGroup.CONTACT -> Icons.Outlined.Mail
    AutofillGroup.IDENTITY -> Icons.Outlined.Badge
    AutofillGroup.TRAVEL -> Icons.Outlined.Work
}

private fun AutofillKind.icon(): ImageVector = when (this) {
    AutofillKind.CARD -> Icons.Outlined.CreditCard
    AutofillKind.IBAN -> Icons.Outlined.AccountBalance
    AutofillKind.LOYALTY -> Icons.Outlined.Loyalty
    AutofillKind.ADDRESS -> Icons.Outlined.Home
    AutofillKind.ID_DOC -> Icons.Outlined.Badge
    AutofillKind.TRAVEL_INFO -> Icons.Outlined.Flight
    AutofillKind.VEHICLE -> Icons.Outlined.DirectionsCar
}

/** "Autofill and passwords", laid out like Chrome's. */
@Composable
fun AutofillHubScreen(
    onBack: () -> Unit,
    onOpenPasswords: () -> Unit,
    onOpenGroup: (AutofillGroup) -> Unit,
    onOpenSettings: () -> Unit,
) {
    ScreenScaffold(title = stringResource(R.string.af_hub_title), onBack = onBack) {
        item {
            SettingsGroup(Modifier.padding(top = Spacing.sm)) {
                SettingsRow(stringResource(R.string.af_password_manager), onOpenPasswords, icon = Icons.Outlined.Key,
                    subtitle = stringResource(R.string.af_password_manager_desc))
                AutofillGroup.entries.forEach { g ->
                    GroupDivider()
                    SettingsRow(stringResource(g.title), { onOpenGroup(g) }, icon = g.icon(), subtitle = stringResource(g.summary))
                }
                GroupDivider()
                SettingsRow(stringResource(R.string.af_settings), onOpenSettings, icon = Icons.Outlined.Settings,
                    subtitle = stringResource(R.string.af_settings_desc))
            }
        }
        item {
            Text(stringResource(R.string.af_hub_note), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(Spacing.xl))
        }
    }
}

/** One section (Payments, Contact info, Identity docs, Travel): saved items and "Add …" buttons. */
@Composable
fun AutofillGroupScreen(
    group: AutofillGroup,
    onBack: () -> Unit,
    onEdit: (AutofillKind, Long) -> Unit,
    viewModel: AutofillViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val context = LocalContext.current
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val lockAvailable = remember { DeviceLock.available(context) }
    var unlocked by rememberSaveable { mutableStateOf(!group.locked) }
    val title = stringResource(group.title)
    val unlockSubtitle = stringResource(R.string.af_unlock_subtitle)
    fun unlock() = DeviceLock.confirm(context, title, unlockSubtitle) { ok -> if (ok) unlocked = true }
    LaunchedEffect(Unit) { if (!unlocked && lockAvailable) unlock() }

    ScreenScaffold(title = title, onBack = onBack) {
        if (!unlocked) {
            item {
                if (lockAvailable) {
                    MessageState(Icons.Outlined.Lock, stringResource(R.string.af_locked_title), stringResource(R.string.af_locked_body),
                        actionLabel = stringResource(R.string.passwords_unlock), onAction = ::unlock)
                } else {
                    MessageState(Icons.Outlined.Lock, stringResource(R.string.passwords_need_lock_title), stringResource(R.string.af_need_lock_body))
                }
            }
            return@ScreenScaffold
        }
        val all = entries ?: return@ScreenScaffold
        group.kinds.forEach { kind ->
            val items = all.filter { it.kind == kind }
            item { SectionHeader(stringResource(kind.title)) }
            item {
                SettingsGroup {
                    items.forEachIndexed { i, e ->
                        if (i > 0) GroupDivider()
                        Row(
                            Modifier.fillMaxWidth().clickable(role = Role.Button) { onEdit(kind, e.id) }
                                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(kind.icon(), null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.width(Spacing.lg))
                            Column(Modifier.weight(1f)) {
                                Text(autofillTitle(e), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val sub = autofillSubtitle(e)
                                if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    if (items.isNotEmpty()) GroupDivider()
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.Button) { onEdit(kind, 0L) }
                            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.Add, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(Spacing.lg))
                        Text(stringResource(kind.addLabel), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        }
        item {
            Text(stringResource(R.string.af_group_note), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(Spacing.xl))
        }
    }
}

/** Add or edit one card / IBAN / address / document / travel item / vehicle. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AutofillEditScreen(
    kind: AutofillKind,
    id: Long,
    onBack: () -> Unit,
    viewModel: AutofillViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val context = LocalContext.current
    val values = remember { mutableStateMapOf<String, String>() }
    var loaded by rememberSaveable { mutableStateOf(id == 0L) }
    var errorKey by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val shown = remember { mutableStateMapOf<String, Boolean>() }
    LaunchedEffect(id) {
        if (id != 0L && values.isEmpty()) viewModel.entry(id)?.let { values.putAll(it.values) }
        loaded = true
    }
    val res = context.resources

    fun save() {
        val missing = kind.fields.firstOrNull { it.required && values[it.key].isNullOrBlank() }
        if (missing != null) { errorKey = missing.key; return }
        val clean = values.toMutableMap()
        if (kind == AutofillKind.CARD) {
            val number = CardInfo.digits(clean["number"].orEmpty())
            if (!CardInfo.luhnValid(number)) { errorKey = "number"; return }
            clean["number"] = number
            clean["exp"] = CardInfo.normaliseExpiry(clean["exp"].orEmpty()) ?: run { errorKey = "exp"; return }
        }
        viewModel.save(kind, clean, id) { onBack() }
    }

    ScreenScaffold(
        title = stringResource(if (id == 0L) kind.addLabel else kind.title),
        onBack = onBack,
        actions = { TextButton(onClick = ::save, enabled = loaded) { Text(stringResource(R.string.password_save)) } },
    ) {
        kind.fields.forEach { f ->
            item(key = f.key) {
                val label = stringResource(f.label) + if (f.required) " *" else ""
                if (f.input == FieldInput.CHOICE) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = Spacing.xl, vertical = Spacing.sm)) {
                        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            f.choices.forEach { c ->
                                val text = res.getString(c)
                                FilterChip(selected = values[f.key] == text, onClick = { values[f.key] = text; errorKey = null },
                                    label = { Text(text) })
                            }
                        }
                        if (errorKey == f.key) Text(stringResource(R.string.af_required), color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall)
                    }
                } else {
                    val hidden = f.secret && shown[f.key] != true
                    OutlinedTextField(
                        value = values[f.key].orEmpty(),
                        onValueChange = { values[f.key] = it.take(200); if (errorKey == f.key) errorKey = null },
                        label = { Text(label) },
                        placeholder = when (f.input) {
                            FieldInput.EXPIRY -> ({ Text("MM/YY") })
                            FieldInput.DATE -> ({ Text("DD/MM/YYYY") })
                            else -> null
                        },
                        singleLine = true,
                        isError = errorKey == f.key,
                        supportingText = if (errorKey == f.key) ({
                            Text(stringResource(if (f.input == FieldInput.CARD_NUMBER) R.string.af_card_invalid
                                else if (f.input == FieldInput.EXPIRY) R.string.af_expiry_invalid else R.string.af_required))
                        }) else null,
                        visualTransformation = if (hidden) PasswordVisualTransformation() else VisualTransformation.None,
                        trailingIcon = if (f.secret) ({
                            IconButton(onClick = { shown[f.key] = shown[f.key] != true }) {
                                Icon(if (hidden) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff, stringResource(R.string.password_show))
                            }
                        }) else null,
                        keyboardOptions = KeyboardOptions(keyboardType = when (f.input) {
                            FieldInput.CARD_NUMBER, FieldInput.NUMBER, FieldInput.EXPIRY, FieldInput.DATE -> KeyboardType.Number
                            FieldInput.PHONE -> KeyboardType.Phone
                            FieldInput.EMAIL -> KeyboardType.Email
                            else -> KeyboardType.Text
                        }),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.xl, vertical = Spacing.xs),
                    )
                }
            }
        }
        if (kind == AutofillKind.CARD) {
            item {
                Text(stringResource(R.string.af_card_no_cvc), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.sm))
            }
        }
        item {
            Column(Modifier.fillMaxWidth().padding(Spacing.xl), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Button(onClick = ::save, enabled = loaded, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text(stringResource(R.string.password_save))
                }
                if (id != 0L) {
                    TextButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        ConfirmDialog(
            title = stringResource(R.string.af_delete_title),
            body = stringResource(R.string.af_delete_body),
            confirmLabel = stringResource(R.string.action_delete),
            dismissLabel = stringResource(R.string.action_cancel),
            onConfirm = { viewModel.delete(id); confirmDelete = false; onBack() },
            onDismiss = { confirmDelete = false },
            destructive = true,
        )
    }
}

/** Autofill settings: what NAYON offers to save and fill, and Android's autofill service. */
@Composable
fun AutofillSettingsScreen(onBack: () -> Unit, viewModel: AutofillViewModel = viewModel(factory = NayonViewModelFactory.Factory)) {
    val context = LocalContext.current
    val p by viewModel.prefs.collectAsStateWithLifecycle()
    ScreenScaffold(title = stringResource(R.string.af_settings), onBack = onBack) {
        item { SectionHeader(stringResource(R.string.af_settings_nayon)) }
        item {
            SettingsGroup {
                SettingsSwitchRow(stringResource(R.string.passwords_offer_to_save), p.savePasswords, { viewModel.setSavePasswords(it) },
                    icon = Icons.Outlined.Key, subtitle = stringResource(R.string.passwords_offer_to_save_desc))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.af_set_payments), p.savePayments, { viewModel.setSavePayments(it) },
                    icon = Icons.Outlined.CreditCard, subtitle = stringResource(R.string.af_set_payments_desc))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.af_set_verify), p.verifyPayments, { viewModel.setVerifyPayments(it) },
                    icon = Icons.Outlined.Fingerprint, subtitle = stringResource(R.string.af_set_verify_desc))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.af_set_addresses), p.saveAddresses, { viewModel.setSaveAddresses(it) },
                    icon = Icons.Outlined.Home, subtitle = stringResource(R.string.af_set_addresses_desc))
            }
        }
        item { SectionHeader(stringResource(R.string.af_settings_android)) }
        item {
            SettingsGroup {
                SettingsSwitchRow(stringResource(R.string.af_set_other_apps), p.otherAutofillApps, { viewModel.setOtherAutofill(it) },
                    icon = Icons.Outlined.Apps, subtitle = stringResource(R.string.af_set_other_apps_desc))
                GroupDivider()
                SettingsRow(stringResource(R.string.af_set_provider), { openAutofillProvider(context) }, icon = Icons.Outlined.Settings,
                    subtitle = stringResource(R.string.af_set_provider_desc))
            }
        }
    }
}

/** Opens Android's screen for choosing the autofill / password provider. */
private fun openAutofillProvider(context: android.content.Context) {
    val candidates = buildList {
        if (Build.VERSION.SDK_INT >= 34) add(Intent("android.settings.CREDENTIAL_PROVIDER"))
        add(Intent(Settings.ACTION_SETTINGS))
    }
    for (intent in candidates) {
        if (runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess) return
    }
}

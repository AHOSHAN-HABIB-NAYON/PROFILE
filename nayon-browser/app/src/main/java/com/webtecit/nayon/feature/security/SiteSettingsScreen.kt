package com.webtecit.nayon.feature.security

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
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
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.security.SitePermission
import com.webtecit.nayon.feature.browser.icon
import com.webtecit.nayon.feature.browser.label

/** Sites you allowed or blocked for camera, microphone, location and protected media. */
@Composable
fun SiteSettingsScreen(onBack: () -> Unit, viewModel: SiteSettingsViewModel = viewModel(factory = NayonViewModelFactory.Factory)) {
    val sites by viewModel.sites.collectAsStateWithLifecycle()
    var confirmReset by remember { mutableStateOf(false) }

    ScreenScaffold(title = stringResource(R.string.site_settings_title), onBack = onBack) {
        item {
            Text(
                stringResource(R.string.site_settings_intro), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.sm),
            )
        }
        val all = sites ?: return@ScreenScaffold
        if (all.isEmpty()) {
            item {
                MessageState(
                    icon = Icons.Outlined.Tune,
                    title = stringResource(R.string.site_settings_empty_title),
                    body = stringResource(R.string.site_settings_empty_body),
                )
            }
            return@ScreenScaffold
        }
        item { SectionHeader(stringResource(R.string.site_settings_sites)) }
        item {
            SettingsGroup {
                all.entries.forEachIndexed { i, (origin, perms) ->
                    if (i > 0) GroupDivider()
                    SiteBlock(origin, perms, onSet = { kind, allowed -> viewModel.set(origin, kind, allowed) }, onReset = { viewModel.resetSite(origin) })
                }
            }
        }
        item {
            TextButton(onClick = { confirmReset = true }, modifier = Modifier.fillMaxWidth().padding(Spacing.md)) {
                Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.width(Spacing.sm))
                Text(stringResource(R.string.site_settings_reset_all), color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmReset) {
        ConfirmDialog(
            title = stringResource(R.string.site_settings_reset_all),
            body = stringResource(R.string.site_settings_reset_all_body),
            confirmLabel = stringResource(R.string.action_reset),
            dismissLabel = stringResource(R.string.action_cancel),
            onConfirm = { viewModel.resetAll(); confirmReset = false },
            onDismiss = { confirmReset = false },
            destructive = true,
        )
    }
}

@Composable
private fun SiteBlock(
    origin: String,
    perms: List<SitePermission>,
    onSet: (com.webtecit.nayon.data.security.SiteKind, Boolean?) -> Unit,
    onReset: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SiteIcon(origin, UrlResolver.displayHost(origin), size = 32.dp)
            Spacer(Modifier.width(Spacing.md))
            Text(UrlResolver.displayHost(origin), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f),
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            TextButton(onClick = onReset) { Text(stringResource(R.string.action_reset)) }
        }
        perms.forEach { p -> PermissionLine(p, onSet) }
    }
}

/** One permission with Allow / Block chips. */
@Composable
fun PermissionLine(p: SitePermission, onSet: (com.webtecit.nayon.data.security.SiteKind, Boolean?) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
        Icon(p.kind.icon(), null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(Spacing.md))
        Text(stringResource(p.kind.label()), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            FilterChip(selected = p.allowed, onClick = { onSet(p.kind, true) }, label = { Text(stringResource(R.string.site_allowed)) })
            FilterChip(selected = !p.allowed, onClick = { onSet(p.kind, false) }, label = { Text(stringResource(R.string.site_blocked)) })
        }
    }
}

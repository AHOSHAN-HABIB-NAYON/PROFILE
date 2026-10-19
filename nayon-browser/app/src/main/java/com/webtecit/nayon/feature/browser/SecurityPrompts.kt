package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.security.SiteKind

fun SiteKind.icon(): ImageVector = when (this) {
    SiteKind.CAMERA -> Icons.Outlined.PhotoCamera
    SiteKind.MICROPHONE -> Icons.Outlined.Mic
    SiteKind.LOCATION -> Icons.Outlined.LocationOn
    SiteKind.PROTECTED_MEDIA -> Icons.Outlined.VerifiedUser
}

fun SiteKind.label(): Int = when (this) {
    SiteKind.CAMERA -> R.string.site_kind_camera
    SiteKind.MICROPHONE -> R.string.site_kind_microphone
    SiteKind.LOCATION -> R.string.site_kind_location
    SiteKind.PROTECTED_MEDIA -> R.string.site_kind_protected_media
}

/** Chrome-style permission prompt: "site.com wants to use your camera". */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermissionPromptSheet(ask: PermissionAsk, onChoice: (PermissionChoice) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val host = UrlResolver.displayHost(ask.origin)
    val what = ask.kinds.joinToString(" + ") { stringResource(it.label()) }
    ModalBottomSheet(
        onDismissRequest = { onChoice(PermissionChoice.BLOCK) },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = scheme.surfaceContainerLow,
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Spacing.xl).padding(bottom = Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                ask.kinds.forEach { kind ->
                    Box(Modifier.size(56.dp).clip(CircleShape).background(scheme.primaryContainer), contentAlignment = Alignment.Center) {
                        Icon(kind.icon(), null, tint = scheme.onPrimaryContainer, modifier = Modifier.size(28.dp))
                    }
                }
            }
            Spacer(Modifier.height(Spacing.lg))
            Text(
                stringResource(R.string.permission_prompt_title, host, what),
                style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center,
            )
            if (ask.isPrivate) {
                Text(stringResource(R.string.permission_prompt_private), style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = Spacing.xs))
            }
            Spacer(Modifier.height(Spacing.xl))
            if (!ask.isPrivate) {
                Button(onClick = { onChoice(PermissionChoice.ALLOW) }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text(stringResource(R.string.permission_allow_always))
                }
                Spacer(Modifier.height(Spacing.sm))
            }
            FilledTonalButton(onClick = { onChoice(PermissionChoice.ALLOW_ONCE) }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(stringResource(R.string.permission_allow_once))
            }
            TextButton(onClick = { onChoice(PermissionChoice.BLOCK) }, modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs)) {
                Text(stringResource(R.string.permission_block))
            }
        }
    }
}

/** "Save password for site?" after a sign-in. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavePasswordSheet(offer: PasswordOffer, onSave: () -> Unit, onNever: () -> Unit, onDismiss: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    var show by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = scheme.surfaceContainerLow,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Spacing.xl).padding(bottom = Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(44.dp).clip(CircleShape).background(scheme.primaryContainer), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Key, null, tint = scheme.onPrimaryContainer)
                }
                Spacer(Modifier.width(Spacing.md))
                Text(
                    stringResource(if (offer.update) R.string.password_update_title else R.string.password_save_title),
                    style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(Spacing.lg))
            Surface(shape = RoundedCornerShape(16.dp), color = scheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SiteIcon(offer.origin, UrlResolver.displayHost(offer.origin), size = 28.dp)
                        Spacer(Modifier.width(Spacing.md))
                        Text(UrlResolver.displayHost(offer.origin), style = MaterialTheme.typography.titleSmall)
                    }
                    Text(offer.username.ifBlank { stringResource(R.string.password_no_username) },
                        style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (show) offer.password else "•".repeat(offer.password.length.coerceAtMost(16)),
                            style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        IconButton(onClick = { show = !show }) {
                            Icon(if (show) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, stringResource(R.string.password_show))
                        }
                    }
                }
            }
            Text(stringResource(R.string.password_save_note), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.sm))
            Spacer(Modifier.height(Spacing.lg))
            Button(onClick = onSave, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(stringResource(if (offer.update) R.string.password_update else R.string.password_save))
            }
            Row(Modifier.fillMaxWidth().padding(top = Spacing.xs), horizontalArrangement = Arrangement.SpaceBetween) {
                if (!offer.update) TextButton(onClick = onNever) { Text(stringResource(R.string.password_never)) } else Spacer(Modifier)
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.password_not_now)) }
            }
        }
    }
}

/** A slim bar on sign-in pages: "Sign in as …" with the saved accounts for this site. */
@Composable
fun FillPasswordBar(offer: FillOffer, onFill: (Long) -> Unit, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    var menu by remember { mutableStateOf(false) }
    val first = offer.logins.first()
    Surface(shape = RoundedCornerShape(28.dp), color = scheme.inverseSurface, shadowElevation = 8.dp, modifier = modifier) {
        Row(Modifier.padding(start = Spacing.lg, end = Spacing.xs).height(52.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Key, null, tint = scheme.inversePrimary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Spacing.md))
            Box(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.password_fill_as, first.username.ifBlank { stringResource(R.string.password_no_username) }),
                    color = scheme.inverseOnSurface, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) {
                        if (offer.logins.size == 1) onFill(first.id) else menu = true
                    }.padding(vertical = Spacing.sm),
                )
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    offer.logins.forEach { login ->
                        DropdownMenuItem(
                            text = { Text(login.username.ifBlank { stringResource(R.string.password_no_username) }) },
                            leadingIcon = { Icon(Icons.Outlined.Key, null) },
                            onClick = { menu = false; onFill(login.id) },
                        )
                    }
                }
            }
            IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, stringResource(R.string.action_close), tint = scheme.inverseOnSurface) }
        }
    }
}

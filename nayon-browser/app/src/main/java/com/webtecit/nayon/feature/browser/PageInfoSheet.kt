package com.webtecit.nayon.feature.browser

import android.net.http.SslCertificate
import android.text.format.DateFormat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Cookie
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.GppBad
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing

/** Chrome-style "site information" sheet opened from the icon in the address bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PageInfoSheet(
    tab: TabState,
    certificate: SslCertificate?,
    cookieCount: Int,
    javaScriptEnabled: Boolean,
    onClearSiteData: () -> Unit,
    onDismiss: () -> Unit,
    permissions: List<com.webtecit.nayon.data.security.SitePermission> = emptyList(),
    onSetPermission: (com.webtecit.nayon.data.security.SiteKind, Boolean?) -> Unit = { _, _ -> },
    onResetPermissions: () -> Unit = {},
) {
    val scheme = MaterialTheme.colorScheme
    val context = LocalContext.current
    val secure = tab.isSecure
    var showCert by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = scheme.surfaceContainerLow,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = Spacing.lg)) {
            // Header
            Row(Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                SiteIcon(tab.url, tab.title, favicon = tab.favicon, size = 44.dp)
                Spacer(Modifier.width(Spacing.md))
                Column(Modifier.weight(1f)) {
                    Text(UrlResolver.displayHost(tab.url), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(tab.url.orEmpty(), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }

            // Connection
            Surface(
                shape = MaterialTheme.shapes.large,
                color = if (secure) scheme.primaryContainer.copy(alpha = 0.55f) else scheme.errorContainer,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            ) {
                Row(Modifier.padding(Spacing.lg), verticalAlignment = Alignment.Top) {
                    val (icon, tint) = when {
                        tab.certificateError -> Icons.Outlined.GppBad to scheme.error
                        secure -> Icons.Filled.Lock to scheme.primary
                        else -> Icons.Outlined.LockOpen to scheme.error
                    }
                    Box(Modifier.size(40.dp).background(scheme.surface, CircleShape), contentAlignment = Alignment.Center) {
                        Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(Spacing.md))
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                        Text(
                            stringResource(if (secure) R.string.page_info_secure_title else R.string.page_info_insecure_title),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (secure) scheme.onPrimaryContainer else scheme.onErrorContainer,
                        )
                        Text(
                            stringResource(
                                when {
                                    tab.certificateError -> R.string.page_info_cert_error_body
                                    secure -> R.string.page_info_secure_body
                                    else -> R.string.page_info_insecure_body
                                },
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (secure) scheme.onPrimaryContainer else scheme.onErrorContainer,
                        )
                    }
                }
            }

            // Certificate
            if (secure && certificate != null) {
                val dateFormat = remember { DateFormat.getMediumDateFormat(context) }
                InfoLine(
                    icon = Icons.Outlined.VerifiedUser,
                    title = stringResource(R.string.page_info_certificate),
                    subtitle = certificate.issuedBy?.oName?.ifBlank { null } ?: certificate.issuedBy?.cName.orEmpty(),
                    trailing = { Icon(if (showCert) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null) },
                    onClick = { showCert = !showCert },
                )
                AnimatedVisibility(showCert) {
                    Column(Modifier.padding(start = 72.dp, end = Spacing.xl, bottom = Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        CertField(stringResource(R.string.page_info_issued_to), certificate.issuedTo?.cName.orEmpty())
                        CertField(
                            stringResource(R.string.page_info_issued_by),
                            listOfNotNull(certificate.issuedBy?.cName, certificate.issuedBy?.oName).filter { it.isNotBlank() }.joinToString(" · "),
                        )
                        certificate.validNotAfterDate?.let { CertField(stringResource(R.string.page_info_valid_until), dateFormat.format(it)) }
                    }
                }
            }
            HorizontalDivider(Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.xs), color = scheme.outlineVariant.copy(alpha = 0.6f))

            InfoLine(
                icon = Icons.Outlined.Cookie,
                title = stringResource(R.string.page_info_cookies),
                subtitle = if (cookieCount > 0) stringResource(R.string.page_info_cookies_count, cookieCount)
                else stringResource(R.string.page_info_no_cookies),
                trailing = {
                    TextButton(onClick = { onClearSiteData(); onDismiss() }) { Text(stringResource(R.string.page_info_clear_site)) }
                },
            )
            InfoLine(
                icon = Icons.Outlined.Shield,
                title = stringResource(R.string.page_info_permissions),
                subtitle = if (permissions.isEmpty()) stringResource(R.string.page_info_permissions_none) else null,
                trailing = if (permissions.isEmpty()) null else {
                    { TextButton(onClick = onResetPermissions) { Text(stringResource(R.string.action_reset)) } }
                },
            )
            if (permissions.isNotEmpty()) {
                Column(Modifier.padding(start = Spacing.xl, end = Spacing.lg, bottom = Spacing.sm)) {
                    permissions.forEach { p -> com.webtecit.nayon.feature.security.PermissionLine(p, onSetPermission) }
                }
            }
            InfoLine(
                icon = Icons.Outlined.Code,
                title = stringResource(if (javaScriptEnabled) R.string.page_info_javascript_on else R.string.page_info_javascript_off),
                subtitle = null,
            )
        }
    }
}

@Composable
private fun InfoLine(
    icon: ImageVector,
    title: String,
    subtitle: String?,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(horizontal = Spacing.xl, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(Spacing.xl))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        trailing?.invoke()
    }
}

@Composable
private fun CertField(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "—" }, style = MaterialTheme.typography.bodyMedium)
    }
}


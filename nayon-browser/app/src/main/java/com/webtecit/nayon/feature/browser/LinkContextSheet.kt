package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.TextFields
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing

/** Chrome-style long-press menu for links and images. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LinkContextSheet(
    target: ContextTarget,
    onDismiss: () -> Unit,
    onOpenNewTab: (String) -> Unit,
    onOpenPrivate: (String) -> Unit,
    onOpenHere: (String) -> Unit,
    onCopy: (String) -> Unit,
    onCopyText: (String) -> Unit,
    onDownload: (String) -> Unit,
    onShare: (String) -> Unit,
    onLens: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val link = target.linkUrl
    val image = target.imageUrl
    val webImage = image?.takeIf { UrlResolver.isWebUrl(it) }
    fun act(block: () -> Unit) { onDismiss(); block() }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = scheme.surfaceContainerLow,
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = Spacing.md)) {
            val headerUrl = link ?: image.orEmpty()
            Row(Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                SiteIcon(headerUrl, target.linkText.orEmpty(), size = 40.dp)
                Spacer(Modifier.width(Spacing.md))
                Column(Modifier.weight(1f)) {
                    val title = target.linkText ?: UrlResolver.displayHost(headerUrl).ifBlank { stringResource(R.string.ctx_image) }
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(headerUrl.take(300), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.6f))

            if (link != null && UrlResolver.isWebUrl(link)) {
                if (!target.isPrivate) {
                    SettingsRow(stringResource(R.string.ctx_open_new_tab), { act { onOpenNewTab(link) } }, icon = Icons.Outlined.OpenInNew, showChevron = false)
                }
                SettingsRow(stringResource(R.string.ctx_open_private), { act { onOpenPrivate(link) } }, icon = Icons.Outlined.VisibilityOff, showChevron = false)
                SettingsRow(stringResource(R.string.ctx_open_here), { act { onOpenHere(link) } }, icon = Icons.Outlined.OpenInBrowser, showChevron = false)
                SettingsRow(stringResource(R.string.ctx_copy_link), { act { onCopy(link) } }, icon = Icons.Outlined.ContentCopy, showChevron = false)
                target.linkText?.let { text ->
                    SettingsRow(stringResource(R.string.ctx_copy_link_text), { act { onCopyText(text) } }, icon = Icons.Outlined.TextFields, showChevron = false)
                }
                SettingsRow(stringResource(R.string.ctx_download_link), { act { onDownload(link) } }, icon = Icons.Outlined.Download, showChevron = false)
                SettingsRow(stringResource(R.string.ctx_share_link), { act { onShare(link) } }, icon = Icons.Outlined.Share, showChevron = false)
            }
            if (image != null) {
                if (link != null) HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.6f))
                if (webImage != null) {
                    SettingsRow(stringResource(R.string.ctx_open_image), { act { onOpenNewTab(webImage) } }, icon = Icons.Outlined.Image, showChevron = false)
                }
                SettingsRow(stringResource(R.string.ctx_download_image), { act { onDownload(image) } }, icon = Icons.Outlined.Download, showChevron = false)
                if (webImage != null) {
                    SettingsRow(stringResource(R.string.ctx_copy_image_link), { act { onCopy(webImage) } }, icon = Icons.Outlined.ContentCopy, showChevron = false)
                    SettingsRow(stringResource(R.string.ctx_share_image), { act { onShare(webImage) } }, icon = Icons.Outlined.Share, showChevron = false)
                    SettingsRow(stringResource(R.string.ctx_lens_image), { act { onLens(webImage) } }, icon = Icons.Outlined.CenterFocusWeak, showChevron = false)
                }
            }
        }
    }
}

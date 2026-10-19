package com.webtecit.nayon.feature.browser

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
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.data.browser.GoogleAccount
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing

/** Google services reachable from the account sheet. */
private val GoogleApps = listOf(
    "Search" to "https://www.google.com",
    "Gmail" to "https://mail.google.com",
    "YouTube" to "https://m.youtube.com",
    "Drive" to "https://drive.google.com",
    "Maps" to "https://maps.google.com",
    "Photos" to "https://photos.google.com",
    "Translate" to "https://translate.google.com",
    "Gemini" to "https://gemini.google.com",
)

const val GOOGLE_SIGN_IN_URL = "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F"
const val GOOGLE_ACCOUNT_URL = "https://myaccount.google.com/"
const val GOOGLE_SIGN_OUT_URL = "https://accounts.google.com/Logout"

/**
 * Chrome-style Google account entry. NAYON signs in to Google on the web (like any site);
 * it does not sync passwords or bookmarks with the Google Account.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoogleAccountSheet(signedIn: Boolean, account: GoogleAccount?, onOpen: (String) -> Unit, onDismiss: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    fun open(url: String) { onDismiss(); onOpen(url) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = scheme.surfaceContainerLow,
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Spacing.xl).padding(bottom = Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box {
                Surface(shape = CircleShape, color = scheme.surfaceContainerLowest, modifier = Modifier.size(72.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        if (account != null) AccountAvatar(account, 72.dp)
                        else Icon(painterResource(R.drawable.ic_google_g), null, tint = Color.Unspecified, modifier = Modifier.size(36.dp))
                    }
                }
                if (signedIn) {
                    Icon(Icons.Filled.CheckCircle, null, tint = Color(0xFF34A853),
                        modifier = Modifier.align(Alignment.BottomEnd).size(22.dp))
                }
            }
            Spacer(Modifier.height(Spacing.md))
            Text(account?.name ?: stringResource(R.string.account_title), style = MaterialTheme.typography.titleLarge)
            Text(
                account?.email ?: stringResource(if (signedIn) R.string.account_signed_in else R.string.account_signed_out),
                style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant, textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.xs),
            )
            Spacer(Modifier.height(Spacing.lg))
            Button(onClick = { open(if (signedIn) GOOGLE_ACCOUNT_URL else GOOGLE_SIGN_IN_URL) }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(stringResource(if (signedIn) R.string.account_manage else R.string.account_sign_in))
            }
            Spacer(Modifier.height(Spacing.lg))
            Surface(shape = RoundedCornerShape(24.dp), color = scheme.surfaceContainerLowest, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(vertical = Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    GoogleApps.chunked(4).forEach { row ->
                        Row(Modifier.fillMaxWidth()) {
                            row.forEach { (name, url) ->
                                Column(
                                    Modifier.weight(1f),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Surface(onClick = { open(url) }, shape = CircleShape, color = scheme.surfaceContainerLow, modifier = Modifier.size(52.dp)) {
                                        Box(contentAlignment = Alignment.Center) { SiteIcon(url, name, size = 52.dp, downloadIcon = true) }
                                    }
                                    Text(name, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.padding(top = Spacing.xs))
                                }
                            }
                        }
                    }
                }
            }
            if (signedIn) {
                TextButton(onClick = { open(GOOGLE_SIGN_OUT_URL) }, modifier = Modifier.padding(top = Spacing.sm)) {
                    Icon(Icons.AutoMirrored.Outlined.Logout, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(Spacing.sm))
                    Text(stringResource(R.string.account_sign_out))
                }
            }
            Text(
                stringResource(R.string.account_no_sync), style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}

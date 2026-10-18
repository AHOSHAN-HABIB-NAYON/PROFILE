package com.webtecit.nayon.feature.about

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.BuildConfig
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.InfoRow
import com.webtecit.nayon.core.designsystem.component.NayonLogo
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.theme.Spacing

@Composable
fun AboutScreen(onBack: () -> Unit, onOpenPrivacy: () -> Unit, onOpenLicenses: () -> Unit) {
    val context = LocalContext.current
    val website = stringResource(R.string.developer_website)
    ScreenScaffold(title = stringResource(R.string.about_title), onBack = onBack) {
        item {
            Column(
                Modifier.fillMaxWidth().padding(vertical = Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                NayonLogo(size = 88.dp)
                Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() })
                Text(stringResource(R.string.tagline), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.about_version, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Text(
                stringResource(R.string.about_statement),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.sm),
            )
        }
        item {
            SettingsGroup {
                InfoRow(stringResource(R.string.about_developer), icon = Icons.Outlined.Person,
                    subtitle = stringResource(R.string.developer_name))
                GroupDivider()
                SettingsRow(
                    title = stringResource(R.string.about_visit_website),
                    subtitle = website,
                    icon = Icons.Outlined.Language,
                    onClick = { context.openExternalLink(website) },
                )
            }
        }
        item {
            SettingsGroup {
                SettingsRow(stringResource(R.string.settings_privacy_policy), onOpenPrivacy, icon = Icons.Outlined.PrivacyTip)
                GroupDivider()
                SettingsRow(stringResource(R.string.settings_licenses), onOpenLicenses, icon = Icons.Outlined.Description)
            }
        }
    }
}

package com.webtecit.nayon.feature.about

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.BuildConfig
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.NayonBrand
import com.webtecit.nayon.core.designsystem.component.NayonLogoBadge
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.theme.IconSize
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.Spacing

@Composable
fun AboutScreen(onBack: () -> Unit, onOpenPrivacy: () -> Unit, onOpenLicenses: () -> Unit, onOpenUrl: (String) -> Unit) {
    val website = stringResource(R.string.developer_website)
    ScreenScaffold(title = stringResource(R.string.about_title), onBack = onBack) {
        item { BrandHero() }
        item { SectionHeader(stringResource(R.string.about_meet_developer)) }
        item { DeveloperCard(website) { onOpenUrl(website) } }
        item {
            Text(
                stringResource(R.string.about_statement),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            )
        }
        item {
            SettingsGroup {
                SettingsRow(stringResource(R.string.settings_privacy_policy), onOpenPrivacy, icon = Icons.Outlined.PrivacyTip)
                GroupDivider()
                SettingsRow(stringResource(R.string.settings_licenses), onOpenLicenses, icon = Icons.Outlined.Description)
            }
        }
        item {
            Text(
                stringResource(R.string.about_built_with),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
            )
        }
    }
}

/** Night-sky brand card, the same in every theme, matching the app icon. */
@Composable
private fun BrandHero() {
    Box(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.extraLarge).background(NayonBrand.nightGradient)
            .padding(vertical = Spacing.xxl, horizontal = Spacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            NayonLogoBadge(size = 96.dp, modifier = Modifier.border(1.dp, Color.White.copy(alpha = 0.18f), androidx.compose.foundation.shape.RoundedCornerShape(26.dp)))
            Spacer(Modifier.size(Spacing.xs))
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall, color = Color.White,
                modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.tagline), style = MaterialTheme.typography.bodyMedium, color = Color(0xFFC7D2FE))
            Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.12f)) {
                Text(
                    stringResource(R.string.about_version, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
                )
            }
        }
    }
}

@Composable
private fun DeveloperCard(website: String, onOpenWebsite: () -> Unit) {
    Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
        Column(
            Modifier.fillMaxWidth().padding(Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Box(
                Modifier.size(124.dp).border(3.dp, NayonBrand.gradient, CircleShape).padding(5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.developer_photo),
                    contentDescription = stringResource(R.string.about_developer_photo),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().clip(CircleShape),
                )
            }
            Spacer(Modifier.size(Spacing.xs))
            Text(stringResource(R.string.developer_name), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
            Text(stringResource(R.string.about_developer_role), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            FilledTonalButton(onClick = onOpenWebsite, modifier = Modifier.padding(top = Spacing.sm).heightIn(min = Layout.minTouchTarget)) {
                Icon(Icons.Outlined.Language, null, modifier = Modifier.size(IconSize.sm))
                Spacer(Modifier.width(Spacing.sm))
                Text(website.removePrefix("https://"))
            }
        }
    }
}

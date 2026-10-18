package com.webtecit.nayon.feature.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Upcoming
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.InfoRow
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.feature.appearance.nameRes

@Composable
fun SettingsScreen(
    appearance: AppearanceSettings,
    onBack: () -> Unit,
    onOpenAppearance: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenLicenses: () -> Unit,
) {
    ScreenScaffold(title = stringResource(R.string.settings_title), onBack = onBack) {
        item { SectionHeader(stringResource(R.string.settings_section_appearance)) }
        item {
            SettingsGroup {
                SettingsRow(
                    title = stringResource(R.string.settings_theme_and_colors),
                    subtitle = "${stringResource(appearance.family.nameRes())} · ${stringResource(appearance.mode.nameRes())}",
                    icon = Icons.Outlined.Palette,
                    onClick = onOpenAppearance,
                )
            }
        }
        item { SectionHeader(stringResource(R.string.settings_section_about)) }
        item {
            SettingsGroup {
                SettingsRow(stringResource(R.string.settings_about_app), onOpenAbout, icon = Icons.Outlined.Info,
                    subtitle = stringResource(R.string.developed_by))
                GroupDivider()
                SettingsRow(stringResource(R.string.settings_privacy_policy), onOpenPrivacy, icon = Icons.Outlined.PrivacyTip)
                GroupDivider()
                SettingsRow(stringResource(R.string.settings_licenses), onOpenLicenses, icon = Icons.Outlined.Description)
            }
        }
        item {
            SettingsGroup {
                InfoRow(
                    title = stringResource(R.string.settings_coming_title),
                    subtitle = stringResource(R.string.settings_coming_body),
                    icon = Icons.Outlined.Upcoming,
                )
            }
        }
    }
}

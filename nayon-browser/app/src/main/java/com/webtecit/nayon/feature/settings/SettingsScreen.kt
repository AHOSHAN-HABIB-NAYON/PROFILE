package com.webtecit.nayon.feature.settings

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.Settings
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.UnfoldLess
import androidx.compose.material.icons.outlined.VerticalAlignBottom
import androidx.compose.material.icons.outlined.VerticalAlignTop
import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.outlined.FormatSize
import androidx.compose.material.icons.outlined.ManageSearch
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.sp
import com.webtecit.nayon.core.designsystem.theme.Spacing
import kotlin.math.roundToInt
import androidx.compose.ui.Modifier
import com.webtecit.nayon.core.designsystem.component.RadioRow
import com.webtecit.nayon.data.settings.ToolbarLayout
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.SearchEngine
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.InfoRow
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.component.SettingsSwitchRow
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.feature.appearance.nameRes
import com.webtecit.nayon.feature.browser.BrowserViewModel

@Composable
fun SettingsScreen(
    appearance: AppearanceSettings,
    browser: BrowserViewModel,
    onBack: () -> Unit,
    onOpenAppearance: () -> Unit,
    onOpenSearchEngine: () -> Unit,
    onOpenClearData: () -> Unit,
    onOpenDownloads: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenLicenses: () -> Unit,
) {
    val context = LocalContext.current
    val prefs by browser.preferences.collectAsStateWithLifecycle()
    val engineName = if (prefs.searchEngine == SearchEngine.CUSTOM) stringResource(R.string.search_engine_custom_title) else prefs.searchEngine.displayName

    ScreenScaffold(title = stringResource(R.string.settings_title), onBack = onBack) {
        item { SectionHeader(stringResource(R.string.settings_section_general)) }
        item {
            SettingsGroup {
                SettingsRow(stringResource(R.string.settings_search_engine), onOpenSearchEngine, icon = Icons.Outlined.Search, subtitle = engineName)
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_suggestions), prefs.searchSuggestions, { browser.setSearchSuggestions(it) },
                    icon = Icons.Outlined.ManageSearch, subtitle = stringResource(R.string.settings_suggestions_desc, engineName))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_restore_tabs), prefs.restoreTabs, { browser.setRestoreTabs(it) },
                    icon = Icons.Outlined.Restore, subtitle = stringResource(R.string.settings_restore_tabs_desc))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_home_shortcuts), prefs.showShortcuts, { browser.setShowShortcuts(it) },
                    icon = Icons.Outlined.GridView)
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_home_recent), prefs.showRecentOnHome, { browser.setShowRecentOnHome(it) },
                    icon = Icons.Outlined.History)
                GroupDivider()
                SettingsRow(
                    stringResource(R.string.settings_default_browser),
                    onClick = {
                        try {
                            context.startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
                        } catch (e: ActivityNotFoundException) {
                            context.startActivity(Intent(Settings.ACTION_SETTINGS))
                        }
                    },
                    icon = Icons.Outlined.OpenInBrowser,
                    subtitle = stringResource(R.string.settings_default_browser_desc),
                )
            }
        }

        item { SectionHeader(stringResource(R.string.settings_toolbar_layout)) }
        item {
            SettingsGroup(Modifier.selectableGroup()) {
                RadioRow(
                    title = stringResource(R.string.toolbar_layout_top),
                    subtitle = stringResource(R.string.toolbar_layout_top_desc),
                    icon = Icons.Outlined.VerticalAlignTop,
                    selected = prefs.toolbarLayout == ToolbarLayout.TOP,
                    onSelect = { browser.setToolbarLayout(ToolbarLayout.TOP) },
                )
                GroupDivider()
                RadioRow(
                    title = stringResource(R.string.toolbar_layout_bottom),
                    subtitle = stringResource(R.string.toolbar_layout_bottom_desc),
                    icon = Icons.Outlined.VerticalAlignBottom,
                    selected = prefs.toolbarLayout == ToolbarLayout.TOP_AND_BOTTOM,
                    onSelect = { browser.setToolbarLayout(ToolbarLayout.TOP_AND_BOTTOM) },
                )
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_hide_toolbars), prefs.hideToolbarsOnScroll, { browser.setHideToolbarsOnScroll(it) },
                    icon = Icons.Outlined.UnfoldLess, subtitle = stringResource(R.string.settings_hide_toolbars_desc))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_pull_refresh), prefs.pullToRefresh, { browser.setPullToRefresh(it) },
                    icon = Icons.Outlined.Refresh, subtitle = stringResource(R.string.settings_pull_refresh_desc))
            }
        }

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

        item { SectionHeader(stringResource(R.string.settings_section_accessibility)) }
        item {
            SettingsGroup {
                Column(Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.md)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.FormatSize, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(Spacing.lg))
                        Text(stringResource(R.string.settings_text_size), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text("${prefs.textZoom}%", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    }
                    var zoom by remember(prefs.textZoom) { mutableFloatStateOf(prefs.textZoom.toFloat()) }
                    Slider(
                        value = zoom,
                        onValueChange = { zoom = it },
                        onValueChangeFinished = { browser.setTextZoom(zoom.roundToInt()) },
                        valueRange = 50f..200f,
                        steps = 14,
                    )
                    Text(
                        stringResource(R.string.settings_text_size_preview),
                        fontSize = (16 * zoom / 100f).sp,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }

        item { SectionHeader(stringResource(R.string.settings_section_privacy)) }
        item {
            SettingsGroup {
                SettingsRow(stringResource(R.string.settings_clear_data), onOpenClearData, icon = Icons.Outlined.DeleteOutline,
                    subtitle = stringResource(R.string.settings_clear_data_desc))
                GroupDivider()
                SettingsSwitchRow(stringResource(R.string.settings_javascript), prefs.javaScriptEnabled, { browser.setJavaScriptEnabled(it) },
                    icon = Icons.Outlined.Code, subtitle = stringResource(R.string.settings_javascript_desc))
                GroupDivider()
                InfoRow(stringResource(R.string.settings_security_info), icon = Icons.Outlined.Shield,
                    subtitle = stringResource(R.string.settings_security_info_desc))
            }
        }

        item { SectionHeader(stringResource(R.string.settings_section_downloads)) }
        item {
            SettingsGroup {
                SettingsRow(stringResource(R.string.settings_open_downloads), onOpenDownloads, icon = Icons.Outlined.Download,
                    subtitle = stringResource(R.string.settings_open_downloads_desc))
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
    }
}

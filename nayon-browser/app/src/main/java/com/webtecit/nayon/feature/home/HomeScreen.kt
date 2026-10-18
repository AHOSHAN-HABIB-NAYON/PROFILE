package com.webtecit.nayon.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.NayonLogo
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.Brightness
import com.webtecit.nayon.core.designsystem.theme.IconSize
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.NayonTheme
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.feature.appearance.nameRes

@Composable
fun HomeScreen(
    appearance: AppearanceSettings,
    onOpenAppearance: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenPrivacy: () -> Unit,
) {
    ScreenScaffold(
        title = stringResource(R.string.app_name),
        navigationIcon = { NayonLogo(Modifier.padding(start = Spacing.md), size = 28.dp) },
        actions = {
            IconButton(onClick = onOpenSettings) {
                Icon(Icons.Outlined.Settings, contentDescription = stringResource(R.string.action_open_settings))
            }
        },
    ) {
        item { HeroCard() }
        item { EngineStatusCard() }
        item { SectionHeader(stringResource(R.string.home_your_theme)) }
        item { ThemeSummaryCard(appearance, onOpenAppearance) }
        item { SectionHeader(stringResource(R.string.home_quick_access)) }
        item {
            QuickAccessGrid(
                listOf(
                    Tile(Icons.Outlined.Palette, stringResource(R.string.home_tile_appearance), onOpenAppearance),
                    Tile(Icons.Outlined.Settings, stringResource(R.string.home_tile_settings), onOpenSettings),
                    Tile(Icons.Outlined.PrivacyTip, stringResource(R.string.home_tile_privacy), onOpenPrivacy),
                    Tile(Icons.Outlined.Info, stringResource(R.string.home_tile_about), onOpenAbout),
                ),
            )
        }
    }
}

@Composable
private fun HeroCard() {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.extraLarge)
            .background(Brush.linearGradient(listOf(scheme.primaryContainer, scheme.secondaryContainer)))
            .padding(vertical = Spacing.xxl, horizontal = Spacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            NayonLogo(size = 72.dp)
            Text(
                stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineSmall,
                color = scheme.onPrimaryContainer,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                stringResource(R.string.tagline),
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onPrimaryContainer,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun EngineStatusCard() {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.tertiaryContainer) {
                Text(
                    stringResource(R.string.home_engine_badge),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Construction, null, tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(IconSize.md))
                Spacer(Modifier.width(Spacing.sm))
                Text(stringResource(R.string.home_engine_title), style = MaterialTheme.typography.titleMedium)
            }
            Text(
                stringResource(R.string.home_engine_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ThemeSummaryCard(appearance: AppearanceSettings, onOpenAppearance: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Text(
                "${stringResource(appearance.family.nameRes())} · ${stringResource(appearance.mode.nameRes())}",
                style = MaterialTheme.typography.titleMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                val s = MaterialTheme.colorScheme
                listOf(s.primary, s.secondary, s.tertiary, s.primaryContainer, s.surfaceContainerHighest).forEach {
                    Box(Modifier.size(28.dp).clip(CircleShape).background(it))
                }
            }
            FilledTonalButton(onClick = onOpenAppearance, modifier = Modifier.heightIn(min = Layout.minTouchTarget)) {
                Icon(Icons.Outlined.Palette, null, modifier = Modifier.size(IconSize.sm))
                Spacer(Modifier.width(Spacing.sm))
                Text(stringResource(R.string.home_customize_theme))
            }
        }
    }
}

private data class Tile(val icon: ImageVector, val label: String, val onClick: () -> Unit)

@Composable
private fun QuickAccessGrid(tiles: List<Tile>) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = if (maxWidth < 340.dp) 2 else 4
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            tiles.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    row.forEach { tile ->
                        Card(
                            onClick = tile.onClick,
                            modifier = Modifier.weight(1f),
                            shape = MaterialTheme.shapes.large,
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                        ) {
                            Column(
                                Modifier.fillMaxWidth().padding(vertical = Spacing.lg, horizontal = Spacing.xs),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                            ) {
                                Box(
                                    Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(tile.icon, null, tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                        modifier = Modifier.size(IconSize.sm + 4.dp))
                                }
                                Text(tile.label, style = MaterialTheme.typography.labelMedium, maxLines = 1,
                                    textAlign = TextAlign.Center)
                            }
                        }
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}


@Preview(widthDp = 360, heightDp = 900)
@Composable
private fun HomePreview() {
    NayonTheme(ThemeFamily.AURORA, Brightness.LIGHT) { HomeScreen(AppearanceSettings(), {}, {}, {}, {}) }
}

@Preview(widthDp = 360, heightDp = 900)
@Composable
private fun HomePreviewDark() {
    NayonTheme(ThemeFamily.EMERALD, Brightness.DARK) { HomeScreen(AppearanceSettings(), {}, {}, {}, {}) }
}

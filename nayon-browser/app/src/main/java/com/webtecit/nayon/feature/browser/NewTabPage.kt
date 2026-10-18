package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.NayonBrand
import com.webtecit.nayon.core.designsystem.component.NayonLogo
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.browser.HistoryEntry
import java.util.Calendar

@Composable
fun NewTabPage(
    isPrivate: Boolean,
    showShortcuts: Boolean,
    recent: List<HistoryEntry>,
    privateIsolationSupported: Boolean,
    voiceAvailable: Boolean,
    onSearchClick: () -> Unit,
    onVoiceClick: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onSeeHistory: () -> Unit,
    onOpenAbout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to (if (isPrivate) scheme.tertiaryContainer else scheme.primaryContainer).copy(alpha = 0.45f),
                    0.45f to scheme.surface,
                ),
            ),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .widthIn(max = Layout.maxContentWidth)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.gutter, vertical = Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
        ) {
            if (isPrivate) {
                PrivateHero(privateIsolationSupported)
            } else {
                BrandHeader()
            }
            SearchPill(isPrivate, voiceAvailable, onSearchClick, onVoiceClick)

            if (!isPrivate && showShortcuts) {
                SectionHeader(stringResource(R.string.ntp_shortcuts), Modifier.fillMaxWidth())
                ShortcutGrid(DefaultShortcuts, onOpenUrl)
            }
            if (!isPrivate && recent.isNotEmpty()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SectionHeader(stringResource(R.string.ntp_recent), Modifier.weight(1f))
                    TextButton(onClick = onSeeHistory) { Text(stringResource(R.string.ntp_see_all)) }
                }
                RecentList(recent, onOpenUrl)
            }
            Spacer(Modifier.height(Spacing.sm))
            DeveloperCredit(onOpenAbout)
        }
    }
}

@Composable
private fun BrandHeader() {
    val greeting = remember {
        when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
            in 5..11 -> R.string.ntp_greeting_morning
            in 12..16 -> R.string.ntp_greeting_afternoon
            else -> R.string.ntp_greeting_evening
        }
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        NayonLogo(size = 84.dp)
        Text(
            stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineMedium.merge(TextStyle(brush = NayonBrand.gradient, fontWeight = FontWeight.Bold)),
            modifier = Modifier.semantics { heading() },
        )
        Text(
            "${stringResource(greeting)} · ${stringResource(R.string.tagline)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PrivateHero(isolationSupported: Boolean) {
    val scheme = MaterialTheme.colorScheme
    Surface(shape = MaterialTheme.shapes.extraLarge, color = scheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Spacing.xl), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Box(
                Modifier.size(56.dp).clip(CircleShape).background(scheme.tertiaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.VisibilityOff, null, tint = scheme.onTertiaryContainer, modifier = Modifier.size(28.dp))
            }
            Text(stringResource(R.string.ntp_private_title), style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.ntp_private_body), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.ntp_private_note), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            if (!isolationSupported) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Icon(Icons.Outlined.Info, null, tint = scheme.error, modifier = Modifier.size(18.dp))
                    Text(stringResource(R.string.ntp_private_not_isolated), style = MaterialTheme.typography.bodySmall, color = scheme.error)
                }
            }
        }
    }
}

@Composable
private fun SearchPill(isPrivate: Boolean, voiceAvailable: Boolean, onClick: () -> Unit, onVoice: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = scheme.surfaceContainerLowest,
        shadowElevation = 3.dp,
        modifier = Modifier.fillMaxWidth().height(56.dp)
            .border(1.dp, scheme.outlineVariant.copy(alpha = 0.6f), CircleShape),
    ) {
        Row(Modifier.padding(start = Spacing.lg, end = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Search, null, tint = scheme.primary)
            Spacer(Modifier.width(Spacing.md))
            Text(
                stringResource(if (isPrivate) R.string.address_hint_private else R.string.address_hint),
                style = MaterialTheme.typography.bodyLarge,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (voiceAvailable) {
                IconButton(onClick = onVoice) {
                    Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search), tint = scheme.primary)
                }
            }
        }
    }
}

@Composable
private fun ShortcutGrid(shortcuts: List<Shortcut>, onOpen: (String) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = if (maxWidth < 300.dp) 3 else 4
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            shortcuts.chunked(columns).forEach { row ->
                Row(Modifier.fillMaxWidth()) {
                    row.forEach { s ->
                        Column(
                            Modifier.weight(1f).clip(MaterialTheme.shapes.medium)
                                .clickable(role = Role.Button) { onOpen(s.url) }
                                .padding(vertical = Spacing.sm),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                        ) {
                            SiteIcon(s.url, s.label, size = 52.dp, background = s.color)
                            Text(s.label, style = MaterialTheme.typography.labelMedium, maxLines = 1,
                                overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun RecentList(recent: List<HistoryEntry>, onOpen: (String) -> Unit) {
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
        Column {
            recent.forEach { entry ->
                Row(
                    Modifier.fillMaxWidth().clickable(role = Role.Button) { onOpen(entry.url) }
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SiteIcon(entry.url, entry.title, size = 36.dp)
                    Spacer(Modifier.width(Spacing.md))
                    Column(Modifier.weight(1f)) {
                        Text(entry.title.ifBlank { UrlResolver.displayHost(entry.url) }, style = MaterialTheme.typography.titleSmall,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(UrlResolver.displayHost(entry.url), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun DeveloperCredit(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Row(Modifier.padding(start = Spacing.xs, end = Spacing.lg, top = Spacing.xs, bottom = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically) {
            Image(
                painterResource(R.drawable.developer_photo),
                contentDescription = stringResource(R.string.about_developer_photo),
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(32.dp).clip(CircleShape).border(1.5.dp, NayonBrand.gradient, CircleShape),
            )
            Spacer(Modifier.width(Spacing.sm))
            Column {
                Text(stringResource(R.string.ntp_developed_by), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.developer_name), style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

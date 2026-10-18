package com.webtecit.nayon.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.theme.Spacing

/**
 * Selectable theme card. The miniature browser preview is painted with [preview],
 * the family's own scheme, so users see the real colours before choosing.
 */
@Composable
fun ThemeCard(
    name: String,
    description: String,
    preview: ColorScheme,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = MaterialTheme.shapes.large
    val selectedLabel = stringResource(R.string.selected)
    Column(
        modifier
            .clip(shape)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                shape = shape,
            )
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .semantics(mergeDescendants = true) { if (selected) contentDescription = "$name, $selectedLabel" }
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        MiniBrowserPreview(preview, Modifier.fillMaxWidth().height(84.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = Spacing.xs)) {
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(description, style = MaterialTheme.typography.bodySmall, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (selected) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun MiniBrowserPreview(s: ColorScheme, modifier: Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(10.dp)).background(s.surface).padding(Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Address bar
        Row(
            Modifier.fillMaxWidth().height(16.dp).clip(CircleShape).background(s.surfaceContainerHigh)
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(s.primary))
            Spacer(Modifier.width(4.dp))
            Box(Modifier.width(36.dp).height(3.dp).clip(CircleShape).background(s.onSurfaceVariant.copy(alpha = 0.5f)))
        }
        // Content card
        Row(
            Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(6.dp)).background(s.surfaceContainerLow)
                .padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(14.dp).clip(CircleShape).background(s.primaryContainer))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth(0.8f).height(3.dp).clip(CircleShape).background(s.onSurface))
                Box(Modifier.fillMaxWidth(0.5f).height(3.dp).clip(CircleShape).background(s.onSurfaceVariant))
            }
            Box(Modifier.width(18.dp).height(8.dp).clip(CircleShape).background(s.primary))
        }
        // Toolbar
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf(s.primary, s.onSurfaceVariant, s.onSurfaceVariant, s.secondary).forEach { c ->
                Box(Modifier.size(5.dp).clip(CircleShape).background(c))
            }
        }
    }
}

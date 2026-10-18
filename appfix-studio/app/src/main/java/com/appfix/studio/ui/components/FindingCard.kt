package com.appfix.studio.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.appfix.core.analysis.Certainty
import com.appfix.core.analysis.Finding
import com.appfix.core.analysis.Severity
import com.appfix.studio.ui.theme.CodeTextStyle
import com.appfix.studio.ui.theme.LocalStatusColors

@Composable
fun SeverityPill(severity: Severity) {
    val s = LocalStatusColors.current
    when (severity) {
        Severity.ERROR -> StatusPill("Error", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
        Severity.WARNING -> StatusPill("Warning", s.warningContainer, s.warning)
        Severity.INFO -> StatusPill("Info", s.infoContainer, s.info)
    }
}

@Composable
fun CertaintyPill(certainty: Certainty) {
    val text = when (certainty) {
        Certainty.CONFIRMED -> "Confirmed"
        Certainty.LIKELY -> "Likely"
        Certainty.SUGGESTION -> "Suggestion"
    }
    StatusPill(text, MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.onSurfaceVariant)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FindingCard(
    finding: Finding,
    onPreviewFix: (() -> Unit)?,
    onOpenFile: ((String, Int?) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    var expanded by rememberSaveable(finding.key) { mutableStateOf(false) }
    val s = LocalStatusColors.current
    val (icon, tint) = when (finding.severity) {
        Severity.ERROR -> Icons.Outlined.ErrorOutline to MaterialTheme.colorScheme.error
        Severity.WARNING -> Icons.Outlined.WarningAmber to s.warning
        Severity.INFO -> Icons.Outlined.Info to s.info
    }
    Card(
        modifier = modifier.fillMaxWidth().animateContentSize(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Column(
            Modifier
                .clickable(role = Role.Button, onClickLabel = if (expanded) "Collapse" else "Expand") { expanded = !expanded }
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Icon(icon, contentDescription = finding.severity.name, tint = tint)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(finding.title, style = MaterialTheme.typography.titleSmall)
                    if (finding.file != null) {
                        Text(finding.file + (finding.line?.let { ":$it" } ?: ""), style = CodeTextStyle, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SeverityPill(finding.severity)
                CertaintyPill(finding.certainty)
                StatusPill(finding.category, MaterialTheme.colorScheme.surfaceContainer, MaterialTheme.colorScheme.onSurfaceVariant)
                if (finding.hasFix) StatusPill("Auto-fix", s.successContainer, s.success)
            }
            if (expanded) {
                Spacer(Modifier.height(12.dp))
                Text(finding.description, style = MaterialTheme.typography.bodyMedium)
                finding.likelyCause?.let {
                    Spacer(Modifier.height(8.dp))
                    Text("Likely cause", style = MaterialTheme.typography.labelLarge)
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
                finding.suggestedFix?.let {
                    Spacer(Modifier.height(8.dp))
                    Text("Suggested fix", style = MaterialTheme.typography.labelLarge)
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (finding.hasFix && onPreviewFix != null) {
                        FilledTonalButton(onClick = onPreviewFix) {
                            Icon(Icons.Outlined.Build, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Preview fix")
                        }
                    }
                    if (finding.file != null && onOpenFile != null) {
                        OutlinedButton(onClick = { onOpenFile(finding.file!!, finding.line) }) { Text("Open file") }
                    }
                }
            }
        }
    }
}

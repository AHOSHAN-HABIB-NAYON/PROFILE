package com.appfix.studio.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.appfix.core.patch.DiffLine
import com.appfix.core.patch.FileChange
import com.appfix.core.patch.FileDiff
import com.appfix.studio.ui.theme.CodeTextStyle
import com.appfix.studio.ui.theme.LocalStatusColors

/** Renders one file's diff. Long lines scroll horizontally together. */
@Composable
fun FileDiffView(diff: FileDiff, modifier: Modifier = Modifier) {
    val status = LocalStatusColors.current
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest, border = androidx.compose.material3.CardDefaults.outlinedCardBorder(), modifier = modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(diff.path, style = CodeTextStyle, modifier = Modifier.weight(1f))
                val kind = when (diff.kind) { FileChange.Kind.CREATE -> "new"; FileChange.Kind.DELETE -> "deleted"; FileChange.Kind.MODIFY -> "+${diff.added} −${diff.removed}" }
                Text(kind, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (diff.isBinary) {
                Text("Binary file — content not shown", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(12.dp))
            } else {
                Column(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp)) {
                    for (line in diff.lines.take(MAX_LINES)) {
                        val bg = when (line.type) {
                            DiffLine.Type.ADDED -> status.diffAdded
                            DiffLine.Type.REMOVED -> status.diffRemoved
                            DiffLine.Type.HUNK -> MaterialTheme.colorScheme.surfaceContainerHigh
                            DiffLine.Type.CONTEXT -> MaterialTheme.colorScheme.surfaceContainerLowest
                        }
                        val marker = when (line.type) { DiffLine.Type.ADDED -> "+"; DiffLine.Type.REMOVED -> "−"; DiffLine.Type.HUNK -> ""; DiffLine.Type.CONTEXT -> " " }
                        Row(Modifier.background(bg).padding(horizontal = 8.dp)) {
                            Text((line.oldLine ?: line.newLine)?.toString()?.padStart(4) ?: "    ", style = CodeTextStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(8.dp))
                            Text("$marker ${line.text}", style = CodeTextStyle)
                        }
                    }
                    if (diff.lines.size > MAX_LINES) {
                        Text("… ${diff.lines.size - MAX_LINES} more lines", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(8.dp))
                    }
                }
            }
        }
    }
}

private const val MAX_LINES = 400

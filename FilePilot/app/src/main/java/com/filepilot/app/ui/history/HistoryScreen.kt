package com.filepilot.app.ui.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Error
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.OperationStatus
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import kotlinx.coroutines.launch

@Composable
fun HistoryScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    val history by container.store.history.collectAsStateWithLifecycle(emptyList())
    var confirm by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            BackTopBar("Operation history", navigator::back, actions = {
                if (history.isNotEmpty()) IconButton(onClick = { confirm = true }) { Icon(Icons.Rounded.DeleteSweep, "Clear history") }
            })
        },
    ) { padding ->
        if (history.isEmpty()) {
            EmptyState(
                Icons.Rounded.History, "No operations yet",
                "Copies, moves, deletions, renames and extractions are listed here with their result.",
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(Modifier.padding(padding).fillMaxSize()) {
                items(history, key = { it.id }) { h ->
                    val (icon, color, label) = when (h.status) {
                        OperationStatus.SUCCESS -> Triple(Icons.Rounded.CheckCircle, Color(0xFF16A34A), "Completed")
                        OperationStatus.PARTIAL -> Triple(Icons.Rounded.WarningAmber, Color(0xFFD97706), "Completed with errors")
                        OperationStatus.CANCELLED -> Triple(Icons.Rounded.Block, Color(0xFF64748B), "Cancelled")
                        OperationStatus.FAILED -> Triple(Icons.Rounded.Error, MaterialTheme.colorScheme.error, "Failed")
                    }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.Top) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(color.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                            Icon(icon, label, tint = color, modifier = Modifier.size(20.dp))
                        }
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(h.title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                Text(Format.dateTime(h.finishedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text("$label · ${h.detail}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Clear operation history?") },
            text = { Text("Only the history list is cleared. Files are not affected.") },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    scope.launch { container.store.clearHistory() }
                }) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } },
        )
    }
}

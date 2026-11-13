package com.webtecit.filepilot.feature.operations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import com.webtecit.filepilot.core.operations.FileOperation
import com.webtecit.filepilot.core.operations.FileOperationManager
import com.webtecit.filepilot.core.operations.OperationStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.delay

@HiltViewModel
class OperationsViewModel @Inject constructor(private val manager: FileOperationManager) : ViewModel() {
    val operations = manager.operations
    fun cancel(id: Long) = manager.cancel(id)
    fun dismiss(id: Long) = manager.dismiss(id)
}

/** Progress of running copy, move and delete operations, visible on every screen. */
@Composable
fun OperationsPanel(
    modifier: Modifier = Modifier,
    padNavigationBar: Boolean = false,
    viewModel: OperationsViewModel = hiltViewModel(),
) {
    val ops by viewModel.operations.collectAsStateWithLifecycle()
    var problems by remember { mutableStateOf<FileOperation?>(null) }
    AnimatedVisibility(visible = ops.isNotEmpty(), modifier = modifier) {
        Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth()) {
            Column(
                Modifier
                    .then(if (padNavigationBar) Modifier.navigationBarsPadding() else Modifier)
                    .padding(vertical = 4.dp),
            ) {
                ops.takeLast(3).forEach { op ->
                    OperationRow(
                        op = op,
                        onCancel = { viewModel.cancel(op.id) },
                        onDismiss = { viewModel.dismiss(op.id) },
                        onShowProblems = { problems = op },
                    )
                }
            }
        }
    }
    problems?.let { op ->
        AlertDialog(
            onDismissRequest = { problems = null },
            title = { Text("Some items weren't processed") },
            text = {
                LazyColumn {
                    items(op.errors) { e ->
                        Column(Modifier.padding(vertical = 6.dp)) {
                            if (e.name.isNotBlank()) Text(e.name, style = MaterialTheme.typography.titleSmall)
                            Text(e.message, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { problems = null; viewModel.dismiss(op.id) }) { Text("Close") }
            },
        )
    }
}

@Composable
private fun OperationRow(op: FileOperation, onCancel: () -> Unit, onDismiss: () -> Unit, onShowProblems: () -> Unit) {
    // Successful operations disappear on their own after a moment.
    if (op.status == OperationStatus.COMPLETED || op.status == OperationStatus.CANCELLED) {
        LaunchedEffect(op.id, op.status) {
            delay(3500)
            onDismiss()
        }
    }
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp).testTag("operation_row"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val (icon, tint) = when (op.status) {
            OperationStatus.COMPLETED -> Icons.Rounded.CheckCircle to MaterialTheme.colorScheme.tertiary
            OperationStatus.FAILED -> Icons.Rounded.ErrorOutline to MaterialTheme.colorScheme.error
            else -> Icons.Rounded.Sync to MaterialTheme.colorScheme.primary
        }
        Icon(icon, contentDescription = null, tint = tint)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(op.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val detail = if (op.status == OperationStatus.RUNNING && op.currentName.isNotBlank()) "${op.summary} · ${op.currentName}" else op.summary
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!op.status.finished) {
                Spacer(Modifier.height(6.dp))
                val progress = op.progress
                if (progress == null || op.status == OperationStatus.PREPARING) LinearProgressIndicator(Modifier.fillMaxWidth())
                else LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            }
        }
        when {
            !op.status.finished -> TextButton(onClick = onCancel) { Text("Cancel") }
            op.status == OperationStatus.FAILED -> TextButton(onClick = onShowProblems) { Text("View") }
            else -> IconButton(onClick = onDismiss) { Icon(Icons.Rounded.Close, contentDescription = "Dismiss") }
        }
    }
}

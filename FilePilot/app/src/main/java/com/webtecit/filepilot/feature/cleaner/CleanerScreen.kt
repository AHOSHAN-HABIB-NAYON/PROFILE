@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.cleaner

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.storage.FileTypes

@Composable
fun CleanerScreen(onBack: () -> Unit, onPreview: (String) -> Unit = {}, viewModel: CleanerViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar)
    LaunchedEffect(Unit) { if (!state.scanned && !state.scanning) viewModel.scan() }
    var confirm by remember { mutableStateOf(false) }
    var permanentConfirm by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cleaner") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { if (!state.scanning) IconButton(onClick = viewModel::scan) { Icon(Icons.Rounded.Refresh, "Scan again") } },
            )
        },
        bottomBar = {
            if (state.scanned && state.selected.isNotEmpty()) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${Formatters.count(state.selected.size, "item")} selected", style = MaterialTheme.typography.titleSmall)
                            Text(Formatters.size(state.selectedBytes), style = MaterialTheme.typography.bodySmall)
                        }
                        Button(onClick = { confirm = true }, enabled = !state.cleaning) { Text("Clean up") }
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when {
            state.scanning -> Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center) {
                com.webtecit.filepilot.core.designsystem.ScanAnimation("Looking for junk and duplicates", state.progress, size = 240.dp)
                Text(
                    "You can leave this screen — the scan keeps running.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
            state.items.isEmpty() && state.scanned -> EmptyState(
                Icons.Rounded.CleaningServices, "All clean", "No junk, duplicates or large leftovers were found.",
                modifier = Modifier.padding(padding), actionLabel = "Scan again", onAction = viewModel::scan,
            )
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                item {
                    Text(
                        "Review the list: nothing is removed until you tap Clean up and confirm.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
                CleanGroup.entries.forEach { group ->
                    val groupItems = state.items.filter { it.group == group }
                    if (groupItems.isNotEmpty()) {
                        item(key = "h" + group.name) {
                            val all = groupItems.all { it.path in state.selected }
                            AppCard(modifier = Modifier.padding(top = 12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(group.label, style = MaterialTheme.typography.titleMedium)
                                        Text(
                                            "${Formatters.count(groupItems.size, "item")} · ${Formatters.size(groupItems.sumOf { it.size })} · ${group.description}",
                                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Checkbox(checked = all, onCheckedChange = { viewModel.toggleGroup(group, !all) })
                                }
                            }
                        }
                        items(groupItems.take(200), key = { group.name + it.path }) { it ->
                            val style = kindStyle(FileTypes.kindOf(it.name, it.isDirectory))
                            Row(
                                Modifier.fillMaxWidth().clickable { viewModel.toggle(it.path) }.padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                IconTile(if (it.isDirectory) Icons.Rounded.Folder else style.icon, style.tint, size = 36.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(it.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOf(if (it.size > 0) Formatters.size(it.size) else "", it.note, it.path.substringBeforeLast('/').substringAfter("/0/"))
                                            .filter { s -> s.isNotEmpty() }.joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                if (!it.isDirectory) IconButton(onClick = { onPreview(it.path) }) {
                                    Icon(Icons.Rounded.Visibility, "Preview ${it.name}", tint = MaterialTheme.colorScheme.primary)
                                }
                                Checkbox(checked = it.path in state.selected, onCheckedChange = { _ -> viewModel.toggle(it.path) })
                            }
                        }
                    }
                }
            }
        }
    }
    if (confirm) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Clean up ${Formatters.count(state.selected.size, "item")}?") },
            text = {
                Text(
                    "${Formatters.size(state.selectedBytes)} will be removed.\n\n" +
                        "Move to Recycle Bin: files can be restored for 30 days.\n" +
                        "Delete permanently: files are erased now and can't be recovered.",
                )
            },
            confirmButton = {
                Column(horizontalAlignment = Alignment.End) {
                    androidx.compose.material3.TextButton(onClick = { confirm = false; viewModel.clean(permanently = false) }) { Text("Move to Recycle Bin") }
                    androidx.compose.material3.TextButton(onClick = { confirm = false; permanentConfirm = true }) {
                        Text("Delete permanently", color = MaterialTheme.colorScheme.error)
                    }
                    androidx.compose.material3.TextButton(onClick = { confirm = false }) { Text("Cancel") }
                }
            },
        )
    }
    if (permanentConfirm) {
        ConfirmDialog(
            title = "Delete permanently?",
            message = "${Formatters.count(state.selected.size, "item")} (${Formatters.size(state.selectedBytes)}) will be erased. This can't be undone.",
            confirmLabel = "Delete permanently",
            destructive = true,
            onConfirm = { permanentConfirm = false; viewModel.clean(permanently = true) },
            onDismiss = { permanentConfirm = false },
        )
    }
}

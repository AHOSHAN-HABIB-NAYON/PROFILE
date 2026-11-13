@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.recycle

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.cleaning.RecycleBin
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.database.TrashEntity
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class RecycleBinViewModel @Inject constructor(private val bin: RecycleBin) : ViewModel() {
    val items = bin.items.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun restore(e: TrashEntity) = viewModelScope.launch {
        _events.send(UiEvent.Message(runCatching { bin.restore(e) }.fold({ "Restored to ${it.substringBeforeLast('/')}" }, { it.userMessage() })))
    }

    fun delete(e: TrashEntity) = viewModelScope.launch {
        runCatching { bin.deleteForever(e) }.onFailure { _events.send(UiEvent.Message(it.userMessage())) }
    }

    fun empty() = viewModelScope.launch {
        items.value.forEach { runCatching { bin.deleteForever(it) } }
        _events.send(UiEvent.Message("Recycle Bin emptied."))
    }
}

@Composable
fun RecycleBinScreen(onBack: () -> Unit, viewModel: RecycleBinViewModel = hiltViewModel()) {
    val entries by viewModel.items.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    EventHandler(viewModel.events, snackbar)
    var confirmEmpty by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<TrashEntity?>(null) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Recycle Bin") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { if (entries.isNotEmpty()) IconButton(onClick = { confirmEmpty = true }) { Icon(Icons.Rounded.DeleteSweep, "Empty Recycle Bin") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        if (entries.isEmpty()) {
            EmptyState(Icons.Rounded.DeleteSweep, "Recycle Bin is empty",
                "Deleted files stay here for ${RecycleBin.KEEP_DAYS} days so you can restore them.", modifier = Modifier.padding(padding))
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Text(
                        "${Formatters.count(entries.size, "item")} · ${Formatters.size(entries.sumOf { it.size })}. Items are removed automatically after ${RecycleBin.KEEP_DAYS} days.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp),
                    )
                }
                items(entries, key = { it.id }) { e ->
                    val daysLeft = (RecycleBin.KEEP_DAYS - (System.currentTimeMillis() - e.deletedAt) / RecycleBin.DAY_MS).coerceAtLeast(0)
                    val style = kindStyle(FileTypes.kindOf(e.name, e.isDirectory))
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconTile(if (e.isDirectory) Icons.Rounded.Folder else style.icon, style.tint, size = 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(e.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${Formatters.size(e.size)} · $daysLeft days left · ${e.originalPath.substringBeforeLast('/').substringAfter("/0/")}",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        IconButton(onClick = { viewModel.restore(e) }) { Icon(Icons.Rounded.Restore, "Restore ${e.name}") }
                        IconButton(onClick = { confirmDelete = e }) { Icon(Icons.Rounded.DeleteForever, "Delete ${e.name} forever") }
                    }
                }
            }
        }
    }
    if (confirmEmpty) ConfirmDialog("Empty the Recycle Bin?", "All ${entries.size} items will be deleted permanently. This can't be undone.",
        "Empty Recycle Bin", onConfirm = { confirmEmpty = false; viewModel.empty() }, onDismiss = { confirmEmpty = false }, destructive = true)
    confirmDelete?.let { e ->
        ConfirmDialog("Delete \"${e.name}\" forever?", "It can't be restored afterwards.", "Delete forever",
            onConfirm = { confirmDelete = null; viewModel.delete(e) }, onDismiss = { confirmDelete = null }, destructive = true)
    }
}

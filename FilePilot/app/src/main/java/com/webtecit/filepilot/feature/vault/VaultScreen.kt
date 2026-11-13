@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.vault

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.database.VaultEntity
import com.webtecit.filepilot.core.designsystem.ConfirmDialog
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.EventHandler
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.kindStyle
import com.webtecit.filepilot.core.security.PinPad
import com.webtecit.filepilot.core.security.VaultKeys
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class VaultViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repo: VaultRepository,
) : ViewModel() {
    val items = repo.items.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val unlocked = MutableStateFlow(false)
    val busy = MutableStateFlow<String?>(null)
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun hasPin() = VaultKeys.hasPin(context)
    fun checkPin(pin: String) = VaultKeys.checkPin(context, pin)
    fun setPin(pin: String) { VaultKeys.setPin(context, pin); unlocked.value = true }
    fun unlock() { unlocked.value = true }
    fun lock() { unlocked.value = false; repo.clearOpenCopies() }

    fun add(uris: List<Uri>) = viewModelScope.launch {
        busy.value = "Encrypting ${Formatters.count(uris.size, "file")}…"
        var ok = 0
        for (uri in uris) {
            runCatching {
                val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
                    ?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "file"
                val mime = context.contentResolver.getType(uri) ?: FileTypes.mimeOf(name)
                repo.add(name, mime, context.contentResolver.openInputStream(uri) ?: error("unreadable"))
            }.onSuccess { ok++ }
        }
        busy.value = null
        _events.send(UiEvent.Message("Added $ok to the Secure Folder. The original files are unchanged; delete them if you no longer need them."))
    }

    fun open(e: VaultEntity) = viewModelScope.launch {
        busy.value = "Decrypting…"
        runCatching { repo.openCopy(e) }.onSuccess { f ->
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", f)
            _events.send(UiEvent.OpenFile(uri, e.mime, chooser = false))
        }.onFailure { _events.send(UiEvent.Message(it.userMessage())) }
        busy.value = null
    }

    fun export(e: VaultEntity) = viewModelScope.launch {
        busy.value = "Decrypting…"
        runCatching { repo.export(e, removeFromVault = true) }
            .onSuccess { _events.send(UiEvent.Message("Restored to Download/FilePilot Restored/${it.name}")) }
            .onFailure { _events.send(UiEvent.Message(it.userMessage())) }
        busy.value = null
    }

    fun delete(e: VaultEntity) = viewModelScope.launch { repo.delete(e) }
}

@Composable
fun VaultScreen(onBack: () -> Unit, viewModel: VaultViewModel = hiltViewModel()) {
    val unlocked by viewModel.unlocked.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    EventHandler(viewModel.events, snackbar)
    DisposableEffect(Unit) { onDispose { viewModel.lock() } }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { if (it.isNotEmpty()) viewModel.add(it) }
    var confirmDelete by remember { mutableStateOf<VaultEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Secure Folder") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { if (unlocked) IconButton(onClick = { viewModel.lock() }) { Icon(Icons.Rounded.Lock, "Lock") } },
            )
        },
        floatingActionButton = {
            if (unlocked) ExtendedFloatingActionButton(onClick = { picker.launch(arrayOf("*/*")) }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Add files") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            busy?.let { Text(it, Modifier.padding(horizontal = 16.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }
            when {
                !viewModel.hasPin() -> PinPad(
                    "Create a PIN", "Protects your Secure Folder. You can also unlock with your fingerprint or device lock.",
                    confirmNew = true, verify = { false }, onDone = viewModel::setPin,
                )
                !unlocked -> PinPad("Secure Folder", "Enter your PIN", confirmNew = false, verify = viewModel::checkPin, onDone = { viewModel.unlock() })
                items.isEmpty() -> EmptyState(
                    Icons.Rounded.Lock, "Your Secure Folder is empty",
                    "Files you add are encrypted with AES-256 and stored privately on this device. Keep a backup: if the app's data is cleared or the app is uninstalled, they can't be recovered.",
                    actionLabel = "Add files", onAction = { picker.launch(arrayOf("*/*")) },
                )
                else -> LazyColumn(contentPadding = PaddingValues(bottom = 96.dp)) {
                    item {
                        Text(
                            "Encrypted on this device. Keep important files backed up elsewhere: clearing app data or uninstalling deletes the keys.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                    items(items, key = { it.id }) { e -> VaultRow(e, onOpen = { viewModel.open(e) }, onExport = { viewModel.export(e) }, onDelete = { confirmDelete = e }) }
                }
            }
        }
    }
    confirmDelete?.let { e ->
        ConfirmDialog("Delete \"${e.name}\"?", "The encrypted copy is deleted permanently and can't be recovered.", "Delete permanently",
            onConfirm = { confirmDelete = null; viewModel.delete(e) }, onDismiss = { confirmDelete = null }, destructive = true)
    }
}

@Composable
private fun VaultRow(e: VaultEntity, onOpen: () -> Unit, onExport: () -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val style = kindStyle(FileTypes.kindOf(e.name, false))
    Row(Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        IconTile(style.icon, style.tint)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(e.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${Formatters.size(e.size)} · added ${Formatters.shortDate(e.addedAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        androidx.compose.foundation.layout.Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "More for ${e.name}") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Open") }, onClick = { menu = false; onOpen() })
                DropdownMenuItem(text = { Text("Restore to Downloads") }, onClick = { menu = false; onExport() })
                DropdownMenuItem(text = { Text("Delete") }, onClick = { menu = false; onDelete() })
            }
        }
    }
}

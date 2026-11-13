package com.webtecit.devicepilot.feature.storage

import android.app.Activity
import android.content.IntentSender
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.designsystem.LocalStatusColors
import com.webtecit.devicepilot.data.local.AppSettings
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.DeleteOutcome
import com.webtecit.devicepilot.data.repository.MediaAccess
import com.webtecit.devicepilot.data.repository.StorageScanRepository
import com.webtecit.devicepilot.data.repository.SystemRepository
import com.webtecit.devicepilot.domain.model.CategoryStat
import com.webtecit.devicepilot.domain.model.DuplicateGroup
import com.webtecit.devicepilot.domain.model.FileCategory
import com.webtecit.devicepilot.domain.model.FileItem
import com.webtecit.devicepilot.domain.model.FolderScanResult
import com.webtecit.devicepilot.domain.model.StorageStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StorageUi(
    val storage: StorageStatus? = null,
    val access: MediaAccess = MediaAccess.NONE,
    val scanning: Boolean = false,
    val progress: String? = null,
    val media: List<FileItem>? = null,
    val folder: FolderScanResult? = null,
    val duplicates: List<DuplicateGroup>? = null,
    val duplicateProgress: Float? = null,
    val ownCacheBytes: Long = 0,
    val error: String? = null,
) {
    /** Media plus files from the picked folder, without duplicates. */
    val allFiles: List<FileItem>
        get() = (media.orEmpty() + folder?.files.orEmpty()).distinctBy { it.uri }

    val stats: List<CategoryStat>
        get() = allFiles.groupBy { it.category }
            .map { (c, l) -> CategoryStat(c, l.size, l.sumOf { it.sizeBytes }) }
            .sortedByDescending { it.bytes }
}

@HiltViewModel
class StorageViewModel @Inject constructor(
    val repo: StorageScanRepository,
    private val system: SystemRepository,
    settings: SettingsRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(StorageUi())
    val ui: StateFlow<StorageUi> = _ui.asStateFlow()

    val settings: StateFlow<AppSettings> = settings.settings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    private val _messages = MutableStateFlow<String?>(null)
    val messages: StateFlow<String?> = _messages.asStateFlow()

    private val _consent = MutableStateFlow<IntentSender?>(null)
    val consent: StateFlow<IntentSender?> = _consent.asStateFlow()
    private var pendingDelete: List<FileItem> = emptyList()

    private var scanJob: Job? = null

    init {
        _ui.update { it.copy(storage = system.storage(), folder = repo.lastFolderScan, ownCacheBytes = repo.ownCacheBytes()) }
    }

    fun refresh(force: Boolean = false) {
        val access = repo.mediaAccess()
        _ui.update { it.copy(access = access, storage = system.storage(), ownCacheBytes = repo.ownCacheBytes(), folder = repo.lastFolderScan) }
        if (access == MediaAccess.NONE) return
        if (_ui.value.media != null && !force) return
        scanJob?.cancel()
        scanJob = viewModelScope.launch {
            _ui.update { it.copy(scanning = true, progress = "Scanning media…", error = null) }
            try {
                val files = repo.mediaFiles(force)
                _ui.update { it.copy(media = files, scanning = false, progress = null) }
            } catch (e: Exception) {
                _ui.update { it.copy(scanning = false, progress = null, error = e.message ?: "Scan failed") }
            }
        }
    }

    fun scanFolder(uri: Uri) {
        repo.persistFolder(uri)
        scanJob?.cancel()
        scanJob = viewModelScope.launch {
            _ui.update { it.copy(scanning = true, progress = "Scanning folder…", error = null) }
            try {
                val result = repo.scanTree(uri) { n -> _ui.update { it.copy(progress = "Scanning folder… $n files") } }
                _ui.update { it.copy(folder = result, scanning = false, progress = null, duplicates = null) }
            } catch (e: Exception) {
                _ui.update { it.copy(scanning = false, progress = null, error = "Could not read that folder") }
            }
        }
    }

    fun findDuplicates() {
        scanJob?.cancel()
        scanJob = viewModelScope.launch {
            _ui.update { it.copy(duplicateProgress = 0f, duplicates = null) }
            val source = _ui.value.allFiles.filter { it.category == FileCategory.IMAGES || it.category == FileCategory.VIDEOS || it.category == FileCategory.AUDIO || it.category == FileCategory.DOCUMENTS }
            val groups = repo.findDuplicates(source) { done, total ->
                _ui.update { it.copy(duplicateProgress = if (total == 0) 1f else done.toFloat() / total) }
            }
            _ui.update { it.copy(duplicates = groups, duplicateProgress = null) }
        }
    }

    fun clearOwnCache() {
        viewModelScope.launch {
            val freed = repo.clearOwnCache()
            _ui.update { it.copy(ownCacheBytes = repo.ownCacheBytes()) }
            _messages.value = "Cleared ${Formatters.bytes(freed)} of Devicepilot cache"
        }
    }

    fun delete(items: List<FileItem>) {
        if (items.isEmpty()) return
        viewModelScope.launch {
            when (val outcome = repo.delete(items)) {
                is DeleteOutcome.Deleted -> settle(items)
                is DeleteOutcome.NeedsUserConsent -> {
                    // Folder files (if any) were already deleted; remember media still waiting for consent.
                    val treeDone = items.filter { it.fromDocumentTree }
                    if (treeDone.isNotEmpty()) forget(treeDone)
                    pendingDelete = outcome.pending
                    _consent.value = outcome.intentSender
                }
            }
        }
    }

    fun onConsentResult(approved: Boolean) {
        _consent.value = null
        val pending = pendingDelete
        pendingDelete = emptyList()
        if (!approved || pending.isEmpty()) {
            _messages.value = "Nothing was deleted"
            return
        }
        viewModelScope.launch {
            if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
                // Android 10 grants access after consent; the delete must be repeated.
                delete(pending)
                return@launch
            }
            settle(pending)
        }
    }

    /** Checks which files are really gone, updates every list and reports the true counts. */
    private suspend fun settle(attempted: List<FileItem>) {
        val remaining = repo.stillExisting(attempted).map { it.uri }.toSet()
        val gone = attempted.filterNot { it.uri in remaining }
        forget(gone)
        _ui.update { it.copy(storage = system.storage()) }
        _messages.value = buildString {
            append("Deleted ${gone.size} item${if (gone.size == 1) "" else "s"}")
            if (remaining.isNotEmpty()) append(", ${remaining.size} could not be deleted")
        }
    }

    private fun forget(items: List<FileItem>) {
        repo.forget(items)
        val uris = items.map { it.uri }.toSet()
        _ui.update { ui ->
            ui.copy(
                media = ui.media?.filterNot { it.uri in uris },
                folder = repo.lastFolderScan,
                duplicates = ui.duplicates?.map { g -> g.copy(files = g.files.filterNot { it.uri in uris }) }?.filter { it.files.size > 1 },
            )
        }
    }

    fun messageShown() { _messages.value = null }
}

/** Launches Android's own delete-confirmation dialog when MediaStore requires it. */
@Composable
fun DeleteConsentHandler(viewModel: StorageViewModel) {
    val sender by viewModel.consent.collectAsStateWithLifecycle()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        viewModel.onConsentResult(result.resultCode == Activity.RESULT_OK)
    }
    LaunchedEffect(sender) {
        sender?.let { launcher.launch(IntentSenderRequest.Builder(it).build()) }
    }
}

@Composable
fun ConfirmDeleteDialog(items: List<FileItem>, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val total = items.sumOf { it.sizeBytes }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete ${items.size} item${if (items.size == 1) "" else "s"}?") },
        text = {
            Text(
                "This permanently removes ${Formatters.bytes(total)} from your phone. " +
                    "Android may ask you to confirm again for files created by other apps. This cannot be undone.",
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Delete permanently", color = LocalStatusColors.current.error) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

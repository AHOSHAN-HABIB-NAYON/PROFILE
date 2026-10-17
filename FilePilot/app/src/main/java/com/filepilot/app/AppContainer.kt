package com.filepilot.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.data.LocalStore
import com.filepilot.app.data.PickedFolder
import com.filepilot.app.data.files.FileRepository
import com.filepilot.app.data.ops.OperationManager
import com.filepilot.app.data.storage.StorageRepository
import com.filepilot.app.data.tools.CleanupRepository
import com.filepilot.app.permissions.AccessState
import com.filepilot.app.permissions.StorageAccess
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Items waiting to be pasted after "Copy" or "Move". */
data class ClipboardState(val items: List<FileItem>, val move: Boolean)

/** Simple manual dependency container; one instance per process. */
class AppContainer(private val context: Context) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val store = LocalStore(context)
    val files = FileRepository(context)
    val storage = StorageRepository(context)
    val operations = OperationManager(files, store, ioScope)
    val cleanup = CleanupRepository(files)

    private val _access = MutableStateFlow(StorageAccess.current(context, 0))
    /** Current storage access, refreshed on every resume so revocations are caught. */
    val access: StateFlow<AccessState> = _access.asStateFlow()

    private val _clipboard = MutableStateFlow<ClipboardState?>(null)
    val clipboard: StateFlow<ClipboardState?> = _clipboard.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    /** One-off messages shown as snackbars. */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    /** Sibling images for swipe navigation in the image viewer. In-memory only. */
    @Volatile
    var imageSession: List<FileItem> = emptyList()

    init {
        appScope.launch {
            operations.results.collect { _messages.emit(it.message) }
        }
    }

    fun message(text: String) {
        _messages.tryEmit(text)
    }

    fun setClipboard(state: ClipboardState?) {
        _clipboard.value = state
    }

    /** Re-reads permissions and drops picked folders whose grant was revoked. */
    fun refreshAccess() {
        appScope.launch {
            val folders = store.pickedFolders.first()
            val persisted = context.contentResolver.persistedUriPermissions.map { it.uri }.toSet()
            val revoked = folders.filter { it.treeUri !in persisted }
            revoked.forEach { store.removePickedFolder(it.treeUri) }
            _access.value = StorageAccess.current(context, folders.size - revoked.size)
        }
    }

    /** Persist access to a folder chosen in the system folder picker. */
    suspend fun addPickedFolder(treeUri: Uri): PickedFolder? {
        return try {
            context.contentResolver.takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
            val root = files.saf.rootLocation(treeUri, "")
            val name = files.saf.query(treeUri, root.documentId)?.name ?: "Folder"
            val folder = PickedFolder(treeUri, name, System.currentTimeMillis())
            store.addPickedFolder(folder)
            refreshAccess()
            folder
        } catch (e: SecurityException) {
            message("Android didn't grant lasting access to that folder")
            null
        }
    }

    suspend fun removePickedFolder(treeUri: Uri) {
        runCatching {
            context.contentResolver.releasePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }
        store.removePickedFolder(treeUri)
        refreshAccess()
    }
}

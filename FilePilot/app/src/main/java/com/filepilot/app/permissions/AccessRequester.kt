package com.filepilot.app.permissions

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.AppContainer
import com.filepilot.app.data.PermissionMemory
import com.filepilot.app.ui.navigation.LocalContainer
import kotlinx.coroutines.launch

/** What happened after asking for access, so the caller can continue its flow. */
enum class AccessOutcome { GRANTED, DENIED, SENT_TO_SETTINGS, FOLDER_ADDED, CANCELLED }

/**
 * Asks for storage access only when the user chose to. Never re-prompts a permission that
 * Android reports as permanently denied; sends the user to Settings instead.
 */
@Stable
class AccessRequester internal constructor(
    private val requestFullImpl: () -> Unit,
    private val requestMediaImpl: () -> Unit,
    private val pickFolderImpl: (Uri?) -> Unit,
) {
    fun requestFullAccess() = requestFullImpl()
    fun requestMediaAccess() = requestMediaImpl()
    fun pickFolder(initial: Uri? = null) = pickFolderImpl(initial)
}

fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

@Composable
fun rememberAccessRequester(onOutcome: (AccessOutcome) -> Unit = {}): AccessRequester {
    val context = LocalContext.current
    val container: AppContainer = LocalContainer.current
    val scope = rememberCoroutineScope()
    val memory by container.store.permissionMemory.collectAsStateWithLifecycle(PermissionMemory(false, false))
    val callback by rememberUpdatedState(onOutcome)

    val allFilesLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        container.refreshAccess()
        val granted = StorageAccess.current(context, 0).fullAccess
        callback(if (granted) AccessOutcome.GRANTED else AccessOutcome.DENIED)
    }
    val legacyLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        container.refreshAccess()
        callback(if (result.values.all { it }) AccessOutcome.GRANTED else AccessOutcome.DENIED)
    }
    val mediaLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        container.refreshAccess()
        callback(if (result.values.any { it }) AccessOutcome.GRANTED else AccessOutcome.DENIED)
    }
    val folderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri == null) {
            callback(AccessOutcome.CANCELLED)
        } else {
            scope.launch {
                val added = container.addPickedFolder(uri)
                callback(if (added != null) AccessOutcome.FOLDER_ADDED else AccessOutcome.DENIED)
            }
        }
    }

    return remember(memory) {
        AccessRequester(
            requestFullImpl = {
                if (StorageAccess.usesAllFilesAccess) {
                    val intent = StorageAccess.allFilesAccessIntent(context)
                    try {
                        allFilesLauncher.launch(intent!!)
                    } catch (_: ActivityNotFoundException) {
                        StorageAccess.allFilesAccessFallbackIntent()?.let {
                            runCatching { allFilesLauncher.launch(it) }
                        }
                    }
                } else {
                    val activity = context.findActivity()
                    if (activity != null && StorageAccess.isPermanentlyDenied(activity, StorageAccess.legacyPermissions, memory.legacyRequested)) {
                        StorageAccess.openAppSettings(context)
                        callback(AccessOutcome.SENT_TO_SETTINGS)
                    } else {
                        scope.launch { container.store.markLegacyRequested() }
                        legacyLauncher.launch(StorageAccess.legacyPermissions)
                    }
                }
            },
            requestMediaImpl = {
                val activity = context.findActivity()
                if (activity != null && StorageAccess.isPermanentlyDenied(activity, StorageAccess.mediaPermissions, memory.mediaRequested)) {
                    StorageAccess.openAppSettings(context)
                    callback(AccessOutcome.SENT_TO_SETTINGS)
                } else {
                    scope.launch { container.store.markMediaRequested() }
                    mediaLauncher.launch(StorageAccess.mediaPermissions)
                }
            },
            pickFolderImpl = { initial ->
                try {
                    folderLauncher.launch(initial)
                } catch (_: ActivityNotFoundException) {
                    container.message("No system folder picker is available on this device")
                }
            },
        )
    }
}

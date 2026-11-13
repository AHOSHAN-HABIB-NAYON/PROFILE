package com.webtecit.filepilot.core.permissions

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LifecycleResumeEffect

/**
 * Asks for storage access only when the user opens something that needs it. Returns a function:
 * call it with the action to run; it runs at once when access is already granted, otherwise it
 * explains why access is needed, requests it, and runs the action after it is granted.
 */
@Composable
fun rememberAccessGate(): (() -> Unit) -> Unit {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    var dialog by remember { mutableStateOf(false) }
    var waitingForSettings by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (StorageAccess.hasFullAccess(context)) pending?.invoke()
        else Toast.makeText(context, "Storage permission is needed to open this. You can allow it in Settings.", Toast.LENGTH_LONG).show()
        pending = null
    }
    LifecycleResumeEffect(waitingForSettings) {
        if (waitingForSettings && StorageAccess.hasFullAccess(context)) {
            waitingForSettings = false
            pending?.invoke()
            pending = null
        }
        onPauseOrDispose { }
    }

    if (dialog) {
        AlertDialog(
            onDismissRequest = { dialog = false; pending = null },
            title = { Text("Allow access to your files") },
            text = {
                Text(
                    if (StorageAccess.usesAllFilesAccess) {
                        "FilePilot needs \"All files access\" to show and manage your files. Android opens a settings page: turn on \"Allow access to manage all files\" and come back. Nothing is uploaded."
                    } else {
                        "FilePilot needs the storage permission to show and manage your files. Nothing is uploaded."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    dialog = false
                    if (StorageAccess.usesAllFilesAccess) {
                        waitingForSettings = true
                        runCatching { context.startActivity(StorageAccess.allFilesAccessIntent(context)) }
                            .onFailure { context.startActivity(StorageAccess.appSettingsIntent(context)) }
                    } else {
                        launcher.launch(StorageAccess.legacyPermissions)
                    }
                }) { Text("Allow") }
            },
            dismissButton = { TextButton(onClick = { dialog = false; pending = null }) { Text("Not now") } },
        )
    }

    return remember {
        { action ->
            if (StorageAccess.hasFullAccess(context)) {
                action()
            } else {
                pending = action
                dialog = true
            }
        }
    }
}

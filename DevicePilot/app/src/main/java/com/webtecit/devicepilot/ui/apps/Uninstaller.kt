package com.webtecit.devicepilot.ui.apps

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.webtecit.devicepilot.ui.common.LocalContainer
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class UninstallOutcome { REMOVED, NOT_REMOVED, UNAVAILABLE }

/**
 * Launches Android's own uninstall confirmation and then VERIFIES the result with
 * PackageManager (the system screen itself does not reliably report back).
 */
@Composable
fun rememberUninstaller(onResult: (String, UninstallOutcome) -> Unit): (String) -> Unit {
    val c = LocalContainer.current
    val scope = rememberCoroutineScope()
    val callback by rememberUpdatedState(onResult)
    var pending by rememberSaveable { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val pkg = pending
        pending = null
        if (pkg != null) scope.launch {
            // Removal can complete a moment after the dialog closes.
            repeat(8) {
                if (!c.apps.isInstalled(pkg)) {
                    callback(pkg, UninstallOutcome.REMOVED)
                    return@launch
                }
                delay(350)
            }
            callback(pkg, UninstallOutcome.NOT_REMOVED)
        }
    }
    return { pkg ->
        pending = pkg
        try {
            launcher.launch(Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg")))
        } catch (_: ActivityNotFoundException) {
            pending = null
            callback(pkg, UninstallOutcome.UNAVAILABLE)
        }
    }
}

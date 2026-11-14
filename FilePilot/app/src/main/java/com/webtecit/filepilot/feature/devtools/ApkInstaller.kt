package com.webtecit.filepilot.feature.devtools

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
import androidx.core.content.FileProvider
import java.io.File

/** Hands an APK to Android's package installer, asking for the "install unknown apps" permission first. */
object ApkInstaller {
    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun permissionIntent(context: Context): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    /** Opens the system installer for [file]. Returns false (with a message) when that isn't possible. */
    fun install(context: Context, file: File): Boolean {
        if (!file.isFile) {
            Toast.makeText(context, "This APK no longer exists.", Toast.LENGTH_SHORT).show()
            return false
        }
        return try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
            val intent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, "No app installer was found on this phone.", Toast.LENGTH_LONG).show()
            false
        } catch (e: Exception) {
            Toast.makeText(context, "Couldn't start the installer: ${e.message}", Toast.LENGTH_LONG).show()
            false
        }
    }
}

/**
 * Returns a function that installs an APK: if FilePilot may not install apps yet, it explains why,
 * opens the system setting, and installs as soon as the user comes back with it turned on.
 */
@Composable
fun rememberApkInstall(): (File) -> Unit {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<File?>(null) }
    var explain by remember { mutableStateOf(false) }
    val settings = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val file = pending
        pending = null
        if (file != null) {
            if (ApkInstaller.canInstall(context)) ApkInstaller.install(context, file)
            else Toast.makeText(context, "Allow \"Install unknown apps\" for FilePilot to install APKs.", Toast.LENGTH_LONG).show()
        }
    }
    if (explain) {
        AlertDialog(
            onDismissRequest = { explain = false; pending = null },
            title = { Text("Allow installing apps?") },
            text = {
                Text(
                    "Android asks you to allow FilePilot to install apps. On the next screen, turn on \"Allow from this source\", " +
                        "then come back. Only install APKs you trust.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    explain = false
                    runCatching { settings.launch(ApkInstaller.permissionIntent(context)) }
                        .onFailure { Toast.makeText(context, "Open Settings › Apps › FilePilot › Install unknown apps.", Toast.LENGTH_LONG).show() }
                }) { Text("Open settings") }
            },
            dismissButton = { TextButton(onClick = { explain = false; pending = null }) { Text("Cancel") } },
        )
    }
    return { file ->
        if (ApkInstaller.canInstall(context)) {
            ApkInstaller.install(context, file)
        } else {
            pending = file
            explain = true
        }
    }
}

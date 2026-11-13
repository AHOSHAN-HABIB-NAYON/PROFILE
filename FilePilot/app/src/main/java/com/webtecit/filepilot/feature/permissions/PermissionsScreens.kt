@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.permissions

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.SdCard
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.StatusPill
import com.webtecit.filepilot.core.permissions.StorageAccess
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import com.webtecit.filepilot.data.SafRootsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

@HiltViewModel
class PermissionsViewModel @Inject constructor(
    private val preferences: PreferencesRepository,
    private val safRoots: SafRootsRepository,
) : ViewModel() {
    val roots = safRoots.roots

    fun markSetupDone(then: () -> Unit) {
        viewModelScope.launch {
            preferences.setPermissionsSetupDone()
            then()
        }
    }

    fun addRoot(uri: android.net.Uri, onAdded: (String) -> Unit) {
        viewModelScope.launch { runCatching { safRoots.add(uri) }.onSuccess { onAdded(it.label) } }
    }
}

/** Screen 3: explains why storage access is needed before anything is requested. */
@Composable
fun PermissionIntroScreen(onContinue: () -> Unit, onNotNow: () -> Unit, viewModel: PermissionsViewModel = hiltViewModel()) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Spacer(Modifier.height(16.dp))
        IconTile(Icons.Rounded.Shield, MaterialTheme.colorScheme.primary, size = 64.dp)
        Spacer(Modifier.height(20.dp))
        Text("Storage access", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            "FilePilot is a file manager. To show, copy, move and organise your files, it needs permission to access your storage.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
        Reason(Icons.Rounded.Folder, "Browse every folder", "See all files on internal storage and SD cards, including Downloads and Documents.")
        Reason(Icons.Rounded.Tune, "Manage files", "Copy, move, rename and delete only when you ask, always with confirmation for deletions.")
        Reason(Icons.Rounded.CloudOff, "Private and offline", "Nothing is uploaded. FilePilot has no account and doesn't send your files anywhere.")
        Spacer(Modifier.height(8.dp))
        Text(
            "You can change this at any time in Settings → Permission manager. Without it, you can still open folders you pick yourself.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Continue") }
        TextButton(onClick = { viewModel.markSetupDone(onNotNow) }, modifier = Modifier.fillMaxWidth()) { Text("Not now") }
    }
}

@Composable
private fun Reason(icon: ImageVector, title: String, text: String) {
    Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
        IconTile(icon, MaterialTheme.colorScheme.tertiary, size = 40.dp)
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Screen 4 (first launch) and Settings → Permission manager: shows each permission's state and
 * requests it in context. [setup] is true during first launch.
 */
@Composable
fun PermissionsScreen(setup: Boolean, onDone: () -> Unit, viewModel: PermissionsViewModel = hiltViewModel()) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(StorageAccess.hasFullAccess(context)) }
    var deniedOnce by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    LifecycleResumeEffect(Unit) {
        granted = StorageAccess.hasFullAccess(context)
        onPauseOrDispose { }
    }
    val legacyLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        granted = StorageAccess.hasFullAccess(context)
        if (!granted) deniedOnce = true
        if (result.isNotEmpty() && !granted) {
            scope.launch { snackbar.showSnackbar("Storage permission wasn't granted. You can still open folders you choose.") }
        }
    }
    val treePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) viewModel.addRoot(uri) { label -> scope.launch { snackbar.showSnackbar("\"$label\" added to Files.") } }
    }

    fun requestStorage() {
        if (StorageAccess.usesAllFilesAccess) {
            runCatching { context.startActivity(StorageAccess.allFilesAccessIntent(context)) }
                .onFailure { context.startActivity(StorageAccess.appSettingsIntent(context)) }
        } else {
            val activity = context.findActivity()
            val permanentlyDenied = deniedOnce && activity != null && StorageAccess.legacyPermissions.none {
                ActivityCompat.shouldShowRequestPermissionRationale(activity, it)
            }
            if (permanentlyDenied) context.startActivity(StorageAccess.appSettingsIntent(context))
            else legacyLauncher.launch(StorageAccess.legacyPermissions)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (setup) "Permissions" else "Permission manager") },
                navigationIcon = {
                    if (!setup) IconButton(onClick = onDone) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PermissionCard(
                icon = Icons.Rounded.Folder,
                title = if (StorageAccess.usesAllFilesAccess) "All files access" else "Storage",
                description = if (StorageAccess.usesAllFilesAccess) {
                    "Required to browse and manage every folder. Android opens a settings page: turn on \"Allow access to manage all files\" and come back."
                } else {
                    "Required to browse and manage files on your storage."
                },
                granted = granted,
                actionLabel = if (granted) null else "Allow",
                onAction = ::requestStorage,
                optional = false,
            )
            PermissionCard(
                icon = Icons.Rounded.SdCard,
                title = "SD card, USB drive or a single folder",
                description = "Optional. Pick a drive or folder in Android's picker to manage it, even without all files access.",
                granted = null,
                actionLabel = "Choose",
                onAction = { treePicker.launch(null) },
                optional = true,
            )
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconTile(Icons.Rounded.FolderOpen, MaterialTheme.colorScheme.secondary, size = 40.dp)
                    Spacer(Modifier.width(14.dp))
                    Text(
                        "FilePilot doesn't use your camera, location, contacts or the internet for file management, and it doesn't post notifications in this version.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (setup) {
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { viewModel.markSetupDone(onDone) },
                    modifier = Modifier.fillMaxWidth().height(52.dp).testTag("permissions_continue"),
                ) { Text(if (granted) "Continue" else "Continue with limited access") }
            }
        }
    }
}

@Composable
private fun PermissionCard(
    icon: ImageVector,
    title: String,
    description: String,
    granted: Boolean?,
    actionLabel: String?,
    onAction: () -> Unit,
    optional: Boolean,
) {
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconTile(icon, MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(14.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            when {
                granted == true -> StatusPill("Allowed", positive = true)
                granted == false -> StatusPill("Not allowed", positive = false)
                optional -> StatusPill("Optional", positive = false)
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actionLabel != null) {
            Spacer(Modifier.height(12.dp))
            if (optional) OutlinedButton(onClick = onAction) { Text(actionLabel) }
            else Button(onClick = onAction) { Text(actionLabel) }
        }
    }
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

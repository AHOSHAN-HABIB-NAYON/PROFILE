package com.webtecit.devicepilot.ui.install

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.InstallMobile
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.install.ApkInspection
import com.webtecit.devicepilot.data.install.InstallEvents
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.common.ConfirmDialog
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.EmptyState
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.levelColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class ApkFileItem(val uri: String, val inspection: ApkInspection?, val accessible: Boolean)

class ApkManagerViewModel(private val c: AppContainer) : ViewModel() {
    private val _items = MutableStateFlow<List<ApkFileItem>>(emptyList())
    val items = _items.asStateFlow()
    private val cache = HashMap<String, ApkFileItem>()

    init {
        viewModelScope.launch {
            c.settings.settings.collect { s ->
                val list = s.apkUris.sorted()
                _items.value = list.map { cache[it] ?: ApkFileItem(it, null, true) }
                for (u in list) if (cache[u] == null) {
                    val result = c.apkInspector.inspect(Uri.parse(u))
                    val accessible = !(result is ApkInspection.Invalid &&
                        result.reason == com.webtecit.devicepilot.data.install.InvalidReason.UNREADABLE)
                    cache[u] = ApkFileItem(u, result, accessible)
                    _items.value = _items.value.map { if (it.uri == u) cache[u]!! else it }
                }
            }
        }
    }

    fun add(context: Context, uris: List<Uri>) = viewModelScope.launch {
        uris.forEach { uri ->
            // Keep write access too when the provider allows it, so "Delete file" keeps working later.
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }.onFailure {
                runCatching { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            }
        }
        c.settings.addApkUris(uris.map { it.toString() })
    }

    fun forget(context: Context, uri: String) = viewModelScope.launch {
        context.contentResolver.persistedUriPermissions.filter { it.uri.toString() == uri }.forEach { p ->
            val flags = (if (p.isReadPermission) Intent.FLAG_GRANT_READ_URI_PERMISSION else 0) or
                (if (p.isWritePermission) Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0)
            runCatching { context.contentResolver.releasePersistableUriPermission(p.uri, flags) }
        }
        cache.remove(uri)
        c.settings.removeApkUri(uri)
    }

    /** Deletes the file through its document provider. Returns false if the provider refuses. */
    suspend fun delete(context: Context, uri: String): Boolean = withContext(Dispatchers.IO) {
        val ok = runCatching { DocumentsContract.deleteDocument(context.contentResolver, Uri.parse(uri)) }.getOrDefault(false)
        if (ok) {
            cache.remove(uri)
            c.settings.removeApkUri(uri)
        }
        ok
    }

    fun install(item: ApkFileItem) {
        val d = (item.inspection as? ApkInspection.Valid)?.details ?: return
        viewModelScope.launch { c.installer.install(d.uri, d.packageName, d.sizeBytes) }
    }

    /** Shares a copy through FileProvider so the receiving app gets a temporary read grant only. */
    suspend fun shareUri(context: Context, item: ApkFileItem): Uri? = withContext(Dispatchers.IO) {
        runCatching {
            val name = (item.inspection as? ApkInspection.Valid)?.details?.fileName ?: "app.apk"
            val dir = File(context.cacheDir, "shared").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
            val out = File(dir, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
            context.contentResolver.openInputStream(Uri.parse(item.uri))!!.use { input -> out.outputStream().use { input.copyTo(it) } }
            FileProvider.getUriForFile(context, context.packageName + ".files", out)
        }.getOrNull()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ApkManagerScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val vm: ApkManagerViewModel = viewModel { ApkManagerViewModel(c) }
    val fileItems by vm.items.collectAsStateWithLifecycle()
    val installState by InstallEvents.state.collectAsStateWithLifecycle()
    var toDelete by remember { mutableStateOf<ApkFileItem?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val shareTitle = stringResource(R.string.action_share)
    val deleteFailed = stringResource(R.string.apk_delete_failed)
    val deleted = stringResource(R.string.apk_deleted)

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) vm.add(context, uris)
    }

    ScreenList {
        item { HeroCard(R.drawable.ill_apps, stringResource(R.string.apk_manager_title), stringResource(R.string.apk_manager_text)) }
        item {
            Button(onClick = { picker.launch(arrayOf("application/vnd.android.package-archive", "application/octet-stream")) },
                modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.apk_add))
            }
        }
        item { InstallStatusCard(installState) { InstallEvents.reset() } }
        message?.let { m -> item { Text(m, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) } }
        if (fileItems.isEmpty()) item {
            EmptyState(R.drawable.ill_empty, stringResource(R.string.apk_empty_title), stringResource(R.string.apk_empty_text))
        }
        items(fileItems, key = { it.uri }) { item ->
            DpCard {
                when (val i = item.inspection) {
                    null -> Text(stringResource(R.string.install_inspecting), style = MaterialTheme.typography.bodySmall)
                    is ApkInspection.Invalid -> {
                        Text(i.fileName, style = MaterialTheme.typography.titleSmall)
                        Text(stringResource(if (item.accessible) invalidRes(i.reason) else R.string.apk_not_accessible),
                            style = MaterialTheme.typography.bodySmall, color = levelColor(Level.BAD))
                    }
                    is ApkInspection.Valid -> {
                        val d = i.details
                        Text(d.fileName, style = MaterialTheme.typography.titleSmall)
                        InfoRow(stringResource(R.string.apk_size), d.sizeBytes?.let { Formatters.bytes(it) } ?: "—")
                        InfoRow(stringResource(R.string.apk_app), d.label)
                        InfoRow(stringResource(R.string.apk_package), d.packageName)
                        InfoRow(stringResource(R.string.details_version), "${d.versionName ?: "—"} (${d.versionCode})")
                        d.location?.let { InfoRow(stringResource(R.string.apk_location), it) }
                        if (d.isUpdate) InfoRow(stringResource(R.string.apk_installed_version), d.installedVersionCode.toString())
                    }
                }
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val valid = item.inspection is ApkInspection.Valid
                    if (valid) ShortcutButton(stringResource(R.string.install_install), Icons.Outlined.InstallMobile) {
                        if (c.installer.canRequestInstalls()) vm.install(item) else SystemSettings.unknownSources(context)
                    }
                    if (item.accessible) ShortcutButton(stringResource(R.string.action_share), Icons.Outlined.Share) {
                        scope.launch {
                            val uri = vm.shareUri(context, item)
                            if (uri != null) {
                                val send = Intent(Intent.ACTION_SEND).setType("application/vnd.android.package-archive")
                                    .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                SystemSettings.open(context, Intent.createChooser(send, shareTitle))
                            }
                        }
                    }
                    if (item.accessible) ShortcutButton(stringResource(R.string.action_delete_file), Icons.Outlined.Delete) { toDelete = item }
                    ShortcutButton(stringResource(R.string.apk_forget), Icons.Outlined.RemoveCircleOutline) { vm.forget(context, item.uri) }
                }
            }
        }
        item {
            Text(stringResource(R.string.apk_delete_note), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    toDelete?.let { item ->
        ConfirmDialog(
            title = stringResource(R.string.apk_delete_title),
            text = stringResource(R.string.apk_delete_text),
            confirm = stringResource(R.string.action_delete_file),
            destructive = true,
            onConfirm = {
                toDelete = null
                scope.launch { message = if (vm.delete(context, item.uri)) deleted else deleteFailed }
            },
            onDismiss = { toDelete = null },
        )
    }
}

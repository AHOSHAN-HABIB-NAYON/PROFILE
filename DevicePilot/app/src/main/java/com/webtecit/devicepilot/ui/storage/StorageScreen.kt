package com.webtecit.devicepilot.ui.storage

import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FindInPage
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.StorageCategories
import com.webtecit.devicepilot.data.storageCategories
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.domain.StorageSnapshot
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.ConfirmDialog
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.Meter
import com.webtecit.devicepilot.ui.common.RingGauge
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.SourceNote
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor
import com.webtecit.devicepilot.ui.common.pressureLevel
import com.webtecit.devicepilot.ui.common.pressureRes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class PickedFile(val uri: Uri, val name: String, val size: Long?)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StorageScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val info by produceState<Pair<StorageSnapshot?, StorageCategories?>?>(null) {
        value = withContext(Dispatchers.IO) { c.monitor.storage() to c.monitor.storageCategories(context) }
    }
    val files = remember { mutableStateListOf<PickedFile>() }
    var toDelete by remember { mutableStateOf<PickedFile?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val deletedMsg = stringResource(R.string.storage_file_deleted)
    val failedMsg = stringResource(R.string.apk_delete_failed)

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        scope.launch {
            val picked = withContext(Dispatchers.IO) {
                uris.map { u -> c.apkInspector.queryNameAndSize(u).let { (n, s) -> PickedFile(u, n, s) } }
            }
            val merged = (files.filter { f -> picked.none { it.uri == f.uri } } + picked).sortedByDescending { it.size ?: 0 }
            files.clear()
            files.addAll(merged)
        }
    }

    ScreenList {
        val st = info?.first
        if (st != null) item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RingGauge(st.usedPercent / 100f, size = 112.dp, color = levelColor(pressureLevel(st.pressure))) {
                        Text("${st.usedPercent}%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        StatusPill(stringResource(pressureRes(st.pressure)), pressureLevel(st.pressure))
                        Spacer(Modifier.height(6.dp))
                        Text(stringResource(R.string.storage_used_of, Formatters.bytes(st.usedBytes), Formatters.bytes(st.totalBytes)),
                            style = MaterialTheme.typography.bodyMedium)
                        Text(stringResource(R.string.storage_free, Formatters.bytes(st.freeBytes)),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                SourceNote(stringResource(R.string.storage_source))
            }
        }
        item {
            val cat = info?.second
            DpCard {
                Text(stringResource(R.string.storage_categories), style = MaterialTheme.typography.titleSmall)
                if (cat == null) {
                    Text(stringResource(R.string.storage_categories_unavailable), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (info != null && android.os.Build.VERSION.SDK_INT >= 26) ShortcutButton(stringResource(R.string.perm_grant_in_settings)) {
                        SystemSettings.usageAccess(context)
                    }
                } else {
                    val total = (st?.usedBytes ?: cat.totalUser).coerceAtLeast(1)
                    listOf(
                        R.string.cat_apps to cat.apps, R.string.cat_images to cat.images,
                        R.string.cat_video to cat.video, R.string.cat_audio to cat.audio,
                    ).forEach { (label, bytes) ->
                        Column(Modifier.padding(vertical = 6.dp)) {
                            Row {
                                Text(stringResource(label), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                Text(Formatters.bytes(bytes), style = MaterialTheme.typography.bodyMedium)
                            }
                            Spacer(Modifier.height(4.dp))
                            Meter(bytes.toFloat() / total)
                        }
                    }
                }
            }
        }
        item {
            DpCard {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.action_storage_settings), Icons.Outlined.Settings) { SystemSettings.storage(context) }
                    ShortcutButton(stringResource(R.string.action_downloads), Icons.Outlined.Download) { SystemSettings.downloads(context) }
                    ShortcutButton(stringResource(R.string.apps_apk_files), Icons.Outlined.FolderZip) { navigate(Routes.APKS) }
                    ShortcutButton(stringResource(R.string.action_uninstall_unused), Icons.Outlined.Apps) { navigate(Routes.UNINSTALL) }
                }
            }
        }
        item {
            SectionTitle(stringResource(R.string.storage_large_files))
        }
        item {
            DpCard {
                Text(stringResource(R.string.storage_large_files_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                ShortcutButton(stringResource(R.string.storage_pick_files), Icons.Outlined.FindInPage) { picker.launch(arrayOf("*/*")) }
                message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
            }
        }
        items(files, key = { it.uri.toString() }) { f ->
            DpCard(contentPadding = 12.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(f.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(f.size?.let { Formatters.bytes(it) } ?: "—", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { toDelete = f }) { Icon(Icons.Outlined.Delete, stringResource(R.string.action_delete_file)) }
                }
            }
        }
    }

    toDelete?.let { f ->
        ConfirmDialog(
            title = stringResource(R.string.storage_delete_title),
            text = stringResource(R.string.storage_delete_text, f.name),
            confirm = stringResource(R.string.action_delete_file),
            destructive = true,
            onConfirm = {
                toDelete = null
                scope.launch {
                    val ok = withContext(Dispatchers.IO) {
                        runCatching { DocumentsContract.deleteDocument(context.contentResolver, f.uri) }.getOrDefault(false)
                    }
                    if (ok) files.remove(f)
                    message = if (ok) deletedMsg else failedMsg
                }
            },
            onDismiss = { toDelete = null },
        )
    }
}

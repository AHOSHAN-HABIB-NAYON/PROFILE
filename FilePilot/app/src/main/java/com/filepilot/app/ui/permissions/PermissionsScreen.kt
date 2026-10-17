package com.filepilot.app.ui.permissions

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderSpecial
import androidx.compose.material.icons.rounded.RemoveCircleOutline
import androidx.compose.material.icons.rounded.PermMedia
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.permissions.StorageAccess
import com.filepilot.app.permissions.rememberAccessRequester
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.components.SectionHeader
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import kotlinx.coroutines.launch

/** Shows exactly what FilePilot can access right now, and how to grant or revoke each part. */
@Composable
fun PermissionsScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val access by container.access.collectAsStateWithLifecycle()
    val folders by container.store.pickedFolders.collectAsStateWithLifecycle(emptyList())
    val requester = rememberAccessRequester()

    Scaffold(topBar = { BackTopBar("Storage access", onBack = navigator::back) }) { padding ->
        LazyColumn(contentPadding = padding) {
            item {
                Text(
                    "FilePilot only uses storage access. You can grant, limit or remove it at any time — features that need more access tell you when they do.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
            }
            item {
                val (label, ok) = when {
                    access.fullAccess -> "Allowed" to true
                    else -> "Not allowed" to false
                }
                StatusCard(
                    icon = Icons.Rounded.FolderSpecial,
                    title = "Full file management",
                    status = label,
                    ok = ok,
                    detail = if (StorageAccess.usesAllFilesAccess) {
                        "Android “All files access”. Needed to browse all folders and to copy, move, rename and delete files on shared storage."
                    } else {
                        "Android storage permission. Needed to browse all folders and to change files."
                    },
                    primaryLabel = if (ok) "Manage in Settings" else "Allow",
                    onPrimary = {
                        if (ok) {
                            if (StorageAccess.usesAllFilesAccess) requester.requestFullAccess() else StorageAccess.openAppSettings(context)
                        } else {
                            requester.requestFullAccess()
                        }
                    },
                )
            }
            item {
                val parts = buildList {
                    if (access.images) add("photos")
                    if (access.video) add("videos")
                    if (access.audio) add("audio")
                }
                val status = when {
                    access.limitedMedia -> "Selected items only"
                    access.allMedia -> "Allowed"
                    parts.isNotEmpty() -> "Partly allowed"
                    else -> "Not allowed"
                }
                StatusCard(
                    icon = Icons.Rounded.PermMedia,
                    title = "Photos, videos & audio",
                    status = status,
                    ok = access.allMedia && !access.limitedMedia,
                    detail = if (access.fullAccess) {
                        "Included with full file management."
                    } else if (access.limitedMedia) {
                        "You allowed only selected photos and videos. Tap Allow to choose more or to allow all."
                    } else if (parts.isNotEmpty()) {
                        "Read-only access to ${parts.joinToString(", ")}."
                    } else {
                        "Read-only access to your media library for the Images, Videos and Audio categories."
                    },
                    primaryLabel = if (access.allMedia && !access.limitedMedia) "Manage in Settings" else "Allow",
                    onPrimary = {
                        if (access.allMedia && !access.limitedMedia) StorageAccess.openAppSettings(context) else requester.requestMediaAccess()
                    },
                )
            }
            item {
                SectionHeader("Folders you picked")
            }
            if (folders.isEmpty()) {
                item {
                    Text(
                        "None yet. Picked folders work without any permission — Android grants access to just that folder.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp),
                    )
                }
            }
            items(folders, key = { it.treeUri.toString() }) { folder ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Folder, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(8.dp))
                    Text(folder.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    IconButton(onClick = { scope.launch { container.removePickedFolder(folder.treeUri) } }) {
                        Icon(Icons.Rounded.RemoveCircleOutline, "Remove access to ${folder.name}", tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
            item {
                OutlinedButton(onClick = { requester.pickFolder() }, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Icon(Icons.Rounded.CreateNewFolder, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Add a folder")
                }
            }
            item {
                SectionHeader("Good to know")
                Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Bullet("Without access, FilePilot still opens folders you pick and shows your favorites and history.")
                    Bullet("Other apps' private folders (Android/data, Android/obb) are protected by Android and can't be opened.")
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                        Bullet("On this Android version, files on an SD card can only be changed after adding the SD card as a picked folder.")
                    }
                    Bullet("If you deny a permission and choose “Don't ask again”, FilePilot won't ask again — use the button below to change it in Android Settings.")
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { StorageAccess.openAppSettings(context) },
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                ) {
                    Icon(Icons.Rounded.Settings, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Open Android app settings")
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun Bullet(text: String) {
    Row {
        Text("•", color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 8.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StatusCard(
    icon: ImageVector,
    title: String,
    status: String,
    ok: Boolean,
    detail: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }
                Spacer(Modifier.width(12.dp))
                Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                val c = if (ok) Color(0xFF16A34A) else Color(0xFFD97706)
                Icon(if (ok) Icons.Rounded.CheckCircle else Icons.Rounded.WarningAmber, null, tint = c, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text(status, style = MaterialTheme.typography.labelMedium, color = c)
            }
            Spacer(Modifier.height(8.dp))
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            if (ok) {
                OutlinedButton(onClick = onPrimary) { Text(primaryLabel) }
            } else {
                Button(onClick = onPrimary) { Text(primaryLabel) }
            }
        }
    }
}

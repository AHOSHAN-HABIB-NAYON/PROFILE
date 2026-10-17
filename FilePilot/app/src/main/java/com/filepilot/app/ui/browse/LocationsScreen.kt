package com.filepilot.app.ui.browse

import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.FolderShared
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Sd
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.files.LocalFiles
import com.filepilot.app.data.storage.VolumeInfo
import com.filepilot.app.permissions.rememberAccessRequester
import com.filepilot.app.ui.components.AccessNotice
import com.filepilot.app.ui.components.SectionHeader
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes
import java.io.File
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationsScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    val access by container.access.collectAsStateWithLifecycle()
    val folders by container.store.pickedFolders.collectAsStateWithLifecycle(emptyList())
    var volumes by remember { mutableStateOf<List<VolumeInfo>>(emptyList()) }
    val requester = rememberAccessRequester()
    var existingQuick by remember { mutableStateOf<Set<String>>(emptySet()) }
    LaunchedEffect(access) {
        volumes = container.storage.volumes()
        existingQuick = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            quickDirNames.filter { File(LocalFiles.primaryRoot, it).isDirectory }.toSet()
        }
    }

    val pathReadable = access.fullAccess || (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && access.images)

    Scaffold(topBar = { TopAppBar(title = { Text("Browse", style = MaterialTheme.typography.titleLarge) }) }) { padding ->
        LazyColumn(contentPadding = PaddingValues(top = padding.calculateTopPadding(), bottom = 24.dp)) {
            item { SectionHeader("Storage") }
            items(volumes, key = { it.id }) { v ->
                val sub = if (v.hasStats) "${Format.size(v.freeBytes)} free of ${Format.size(v.totalBytes)}" else "Capacity unavailable"
                LocationRow(
                    icon = if (v.isRemovable) Icons.Rounded.Sd else Icons.Rounded.Storage,
                    title = v.label,
                    subtitle = if (pathReadable) sub else "$sub · needs access",
                    tint = MaterialTheme.colorScheme.primary,
                    onClick = {
                        val path = v.path
                        when {
                            pathReadable && path != null -> navigator.openFolder(Location.Local(path))
                            v.isRemovable -> requester.pickFolder(
                                v.volume?.uuid?.let { DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "$it:") },
                            )
                            else -> navigator.go(Routes.PERMISSIONS)
                        }
                    },
                )
            }
            if (!pathReadable) {
                item {
                    AccessNotice(
                        title = "Browse all folders",
                        message = "Allow full file management to browse internal storage, or add specific folders below.",
                        actionLabel = "Allow access",
                        onAction = requester::requestFullAccess,
                    )
                }
            } else {
                item { SectionHeader("Quick folders") }
                val quick = listOf(
                    Triple(Environment.DIRECTORY_DOWNLOADS, Icons.Rounded.Download, Color(0xFF0EA5E9)),
                    Triple(Environment.DIRECTORY_DCIM, Icons.Rounded.CameraAlt, Color(0xFF10B981)),
                    Triple(Environment.DIRECTORY_PICTURES, Icons.Rounded.Image, Color(0xFF14B8A6)),
                    Triple(Environment.DIRECTORY_DOCUMENTS, Icons.Rounded.Description, Color(0xFF3B82F6)),
                    Triple(Environment.DIRECTORY_MUSIC, Icons.Rounded.LibraryMusic, Color(0xFFF59E0B)),
                    Triple(Environment.DIRECTORY_MOVIES, Icons.Rounded.Movie, Color(0xFFF43F5E)),
                )
                items(quick.filter { it.first in existingQuick }, key = { it.first }) { (dir, icon, color) ->
                    LocationRow(icon, dir, "", color) {
                        navigator.openFolder(Location.Local(File(LocalFiles.primaryRoot, dir).absolutePath))
                    }
                }
            }
            item { SectionHeader("Folders you picked") }
            if (folders.isEmpty()) {
                item {
                    Text(
                        "Add a folder with Android's folder picker to browse and manage it — no broad permission needed.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }
            }
            items(folders, key = { it.treeUri.toString() }) { folder ->
                var menu by remember { mutableStateOf(false) }
                LocationRow(
                    icon = Icons.Rounded.FolderShared,
                    title = folder.name,
                    subtitle = "Picked folder",
                    tint = MaterialTheme.colorScheme.secondary,
                    onClick = { navigator.openFolder(container.files.saf.rootLocation(folder.treeUri, folder.name)) },
                    trailing = {
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "Options for ${folder.name}") }
                            DropdownMenu(menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(
                                    text = { Text("Remove access") },
                                    onClick = {
                                        menu = false
                                        scope.launch { container.removePickedFolder(folder.treeUri) }
                                    },
                                )
                            }
                        }
                    },
                )
            }
            item {
                OutlinedButton(onClick = { requester.pickFolder() }, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Icon(Icons.Rounded.CreateNewFolder, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Add folder")
                }
            }
        }
    }
}

@Composable
private fun LocationRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    tint: Color,
    trailing: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp)) }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (trailing != null) trailing() else Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}


private val quickDirNames = listOf(
    Environment.DIRECTORY_DOWNLOADS,
    Environment.DIRECTORY_DCIM,
    Environment.DIRECTORY_PICTURES,
    Environment.DIRECTORY_DOCUMENTS,
    Environment.DIRECTORY_MUSIC,
    Environment.DIRECTORY_MOVIES,
)

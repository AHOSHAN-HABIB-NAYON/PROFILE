package com.webtecit.filepilot.core.designsystem

import android.os.Environment
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.io.File

/** Picks a folder on device storage, used for "Copy to", "Move to" and "Extract to". */
@Composable
fun FolderPickerDialog(title: String, confirmLabel: String, start: String? = null, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val root = remember { Environment.getExternalStorageDirectory().absolutePath }
    var dir by remember { mutableStateOf(start?.takeIf { File(it).isDirectory } ?: root) }
    var creating by remember { mutableStateOf(false) }
    val children = remember(dir, creating) {
        File(dir).listFiles().orEmpty().filter { it.isDirectory && !it.name.startsWith(".") }.sortedBy { it.name.lowercase() }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(title)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (dir != root) IconButton(onClick = { dir = File(dir).parent ?: root }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Up") }
                    Text(
                        if (dir == root) "Internal storage" else "…/" + dir.removePrefix(root).trim('/'),
                        style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { creating = true }) { Icon(Icons.Rounded.CreateNewFolder, "New folder") }
                }
            }
        },
        text = {
            LazyColumn(Modifier.heightIn(max = 360.dp)) {
                if (children.isEmpty()) item { Text("No folders here.", style = MaterialTheme.typography.bodyMedium) }
                items(children) { f ->
                    Row(
                        Modifier.fillMaxWidth().clickable { dir = f.absolutePath }.padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.Folder, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Text(f.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onPick(dir) }) { Text(confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
    if (creating) {
        NameDialog(
            title = "New folder", initial = "", confirmLabel = "Create",
            validate = { n -> com.webtecit.filepilot.core.storage.NameRules.validate(n) ?: if (File(dir, n).exists()) "Already exists" else null },
            onConfirm = { n -> File(dir, n).mkdirs(); dir = File(dir, n).absolutePath; creating = false },
            onDismiss = { creating = false },
        )
    }
}

package com.appfix.studio.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.DataObject
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.appfix.core.util.formatBytes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

data class TreeEntry(val path: String, val name: String, val isDir: Boolean, val size: Long)

/** Supplies directory listings for [FileTree]. Paths are relative and use '/'. */
fun interface TreeSource {
    fun children(path: String): List<TreeEntry>
}

class WorkspaceTreeSource(private val root: File, private val showHidden: Boolean = false) : TreeSource {
    override fun children(path: String): List<TreeEntry> {
        val dir = if (path.isEmpty()) root else File(root, path)
        return dir.listFiles().orEmpty()
            .filter { showHidden || !it.name.startsWith(".") || it.name == ".github" || it.name == ".gitignore" }
            .filter { it.name != "build" || !it.isDirectory }
            .map { TreeEntry(if (path.isEmpty()) it.name else "$path/${it.name}", it.name, it.isDirectory, if (it.isFile) it.length() else 0) }
            .sortedWith(compareBy({ !it.isDir }, { it.name.lowercase() }))
    }
}

/** Builds a virtual tree from flat archive entry names (e.g. APK contents). */
class ArchiveTreeSource(entries: List<Pair<String, Long>>) : TreeSource {
    private val children = HashMap<String, MutableMap<String, TreeEntry>>()

    init {
        for ((name, size) in entries) {
            if (name.endsWith("/")) continue
            val parts = name.split('/').filter { it.isNotEmpty() }
            var parent = ""
            parts.forEachIndexed { i, part ->
                val path = if (parent.isEmpty()) part else "$parent/$part"
                val isDir = i < parts.lastIndex
                children.getOrPut(parent) { linkedMapOf() }.putIfAbsent(path, TreeEntry(path, part, isDir, if (isDir) 0 else size))
                parent = path
            }
        }
    }

    override fun children(path: String): List<TreeEntry> =
        children[path]?.values.orEmpty().sortedWith(compareBy({ !it.isDir }, { it.name.lowercase() }))
}

private data class TreeRow(val entry: TreeEntry, val depth: Int)

@Composable
fun FileTree(
    source: TreeSource,
    onOpenFile: (TreeEntry) -> Unit,
    modifier: Modifier = Modifier,
    refreshKey: Any? = null,
    contentPadding: PaddingValues = PaddingValues(vertical = 8.dp),
    header: (@Composable () -> Unit)? = null,
) {
    var expanded by remember(source) { mutableStateOf(setOf<String>()) }
    val rows by produceState(emptyList<TreeRow>(), source, expanded, refreshKey) {
        value = withContext(Dispatchers.IO) {
            val out = mutableListOf<TreeRow>()
            fun add(path: String, depth: Int) {
                for (e in source.children(path)) {
                    out += TreeRow(e, depth)
                    if (e.isDir && e.path in expanded && out.size < 20_000) add(e.path, depth + 1)
                }
            }
            add("", 0)
            out
        }
    }
    LazyColumn(modifier.fillMaxSize(), contentPadding = contentPadding) {
        if (header != null) item { header() }
        items(rows, key = { it.entry.path }) { row ->
            val e = row.entry
            val isOpen = e.path in expanded
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .clickable(onClickLabel = if (e.isDir) (if (isOpen) "Collapse" else "Expand") else "Open") {
                        if (e.isDir) expanded = if (isOpen) expanded - e.path else expanded + e.path else onOpenFile(e)
                    }
                    .padding(start = (12 + row.depth * 16).dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (e.isDir) {
                    Icon(if (isOpen) Icons.Outlined.KeyboardArrowDown else Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Spacer(Modifier.width(20.dp))
                }
                Spacer(Modifier.width(4.dp))
                Icon(iconFor(e), contentDescription = null, modifier = Modifier.size(20.dp), tint = if (e.isDir) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(10.dp))
                Text(e.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (!e.isDir) Text(formatBytes(e.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun iconFor(e: TreeEntry): ImageVector = when {
    e.isDir -> Icons.Outlined.Folder
    e.name.substringAfterLast('.').lowercase() in setOf("png", "jpg", "jpeg", "webp", "gif") -> Icons.Outlined.Image
    e.name.substringAfterLast('.').lowercase() in setOf("kt", "kts", "java", "xml", "gradle", "dart", "js", "ts", "smali") -> Icons.Outlined.Code
    e.name.substringAfterLast('.').lowercase() in setOf("json", "toml", "yaml", "yml", "properties") -> Icons.Outlined.DataObject
    else -> Icons.AutoMirrored.Outlined.InsertDriveFile
}

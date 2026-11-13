package com.webtecit.filepilot.feature.tools

import com.webtecit.filepilot.core.designsystem.EqualGrid
import com.webtecit.filepilot.core.designsystem.GridBox
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.designsystem.enterAnimation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.layout.Column

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.FindInPage
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.SectionHeader

/** Every tool in the app. Only finished tools are listed here. */
enum class Tool(val label: String, val description: String, val icon: ImageVector, val tint: Long, val group: String) {
    FOLDER_SIZE("Folder size", "Which folders take your space", Icons.Rounded.FolderOpen, 0xFF2F6BFF, "Storage"),
    ANALYZER("Storage Analyzer", "Folders and types using your space", Icons.Rounded.DonutLarge, 0xFFEA580C, "Storage"),
    CLEANER("Cleaner", "Junk, duplicates and leftovers", Icons.Rounded.CleaningServices, 0xFF0369A1, "Storage"),
    RECYCLE_BIN("Recycle Bin", "Restore deleted files", Icons.Rounded.DeleteSweep, 0xFF64748B, "Storage"),
    SECURE_FOLDER("Secure Folder", "Encrypted, PIN-protected files", Icons.Rounded.Lock, 0xFFDB2777, "Security"),
    CODE_STUDIO("Code Studio", "Edit code with tabs and highlighting", Icons.Rounded.Code, 0xFF0D9488, "Developer"),
    TERMINAL("Terminal", "Shell commands, root when available", Icons.Rounded.Terminal, 0xFF111827, "Developer"),
    TEXT_SEARCH("Search in files", "Find text inside documents and code", Icons.Rounded.FindInPage, 0xFF7C3AED, "Developer"),
    HTML_PROJECTS("HTML Projects", "Build and run websites offline", Icons.Rounded.Language, 0xFF2563EB, "Developer"),
}

/** Short name and colour for each tool's box. */
private val Tool.short: String
    get() = when (this) {
        Tool.FOLDER_SIZE -> "Folder size"
        Tool.ANALYZER -> "Analyzer"
        Tool.CLEANER -> "Cleaner"
        Tool.RECYCLE_BIN -> "Recycle Bin"
        Tool.SECURE_FOLDER -> "Secure Folder"
        Tool.CODE_STUDIO -> "Code Studio"
        Tool.TERMINAL -> "Terminal"
        Tool.TEXT_SEARCH -> "Text Search"
        Tool.HTML_PROJECTS -> "Web Projects"
    }

private val Tool.color: Color
    get() = when (this) {
        Tool.FOLDER_SIZE -> Palette.Blue
        Tool.ANALYZER -> Palette.Purple
        Tool.CLEANER -> Palette.Green
        Tool.RECYCLE_BIN -> Palette.Pink
        Tool.SECURE_FOLDER -> Palette.Purple
        Tool.CODE_STUDIO -> Palette.Orange
        Tool.TERMINAL -> Palette.Slate
        Tool.TEXT_SEARCH -> Palette.Green
        Tool.HTML_PROJECTS -> Palette.Cyan
    }

/** Tools in equal boxes: the same width and height for every box, whatever the label. */
@Composable
fun ToolGrid(tools: List<Tool>, onTool: (Tool) -> Unit, columns: Int = 3) {
    EqualGrid(tools, columns) { tool, m ->
        GridBox(tool.short, tool.icon, tool.color, m, height = 92.dp) { onTool(tool) }
    }
}

@Composable
fun ToolsScreen(onTool: (Tool) -> Unit) {
    Scaffold { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 100.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item(key = "title") {
                Column(Modifier.padding(start = 4.dp, top = 8.dp, bottom = 4.dp).enterAnimation(0)) {
                    Text("Tools", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Everything works offline", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Tool.entries.groupBy { it.group }.forEach { (group, tools) ->
                item(key = group) {
                    Column {
                        Text(
                            group, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(start = 6.dp, top = 10.dp, bottom = 8.dp),
                        )
                        ToolGrid(tools, onTool)
                    }
                }
            }
        }
    }
}

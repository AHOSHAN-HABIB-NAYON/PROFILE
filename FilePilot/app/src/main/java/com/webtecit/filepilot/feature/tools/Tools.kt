package com.webtecit.filepilot.feature.tools

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Code
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
    ANALYZER("Storage Analyzer", "Folders and types using your space", Icons.Rounded.DonutLarge, 0xFFEA580C, "Storage"),
    CLEANER("Cleaner", "Junk, duplicates and leftovers", Icons.Rounded.CleaningServices, 0xFF0369A1, "Storage"),
    RECYCLE_BIN("Recycle Bin", "Restore deleted files", Icons.Rounded.DeleteSweep, 0xFF64748B, "Storage"),
    CODE_STUDIO("Code Studio", "Edit code with tabs and highlighting", Icons.Rounded.Code, 0xFF0D9488, "Developer"),
    HTML_PROJECTS("HTML Projects", "Build and run websites offline", Icons.Rounded.Language, 0xFF2563EB, "Developer"),
}

@Composable
fun ToolGrid(tools: List<Tool>, onTool: (Tool) -> Unit, columns: Int = 3) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        tools.chunked(columns).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { tool ->
                    AppCard(onClick = { onTool(tool) }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            IconTile(tool.icon, Color(tool.tint), size = 44.dp)
                            Spacer(Modifier.height(8.dp))
                            Text(
                                tool.label, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center,
                                maxLines = 2, overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolsScreen(onTool: (Tool) -> Unit) {
    Scaffold(topBar = { TopAppBar(title = { Text("Tools") }) }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Tool.entries.groupBy { it.group }.forEach { (group, tools) ->
                item(key = group) {
                    SectionHeader(group)
                    ToolGrid(tools, onTool)
                }
            }
        }
    }
}

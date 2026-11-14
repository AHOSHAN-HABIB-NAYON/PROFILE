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
import androidx.compose.material.icons.rounded.LocationOff
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.ViewDay
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Password
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Screenshot
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.PhotoSizeSelectLarge
import androidx.compose.material.icons.rounded.Compress
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.automirrored.rounded.CallMerge
import androidx.compose.material.icons.automirrored.rounded.TextSnippet
import androidx.compose.material.icons.rounded.PictureAsPdf
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
    ORGANIZE("Smart organize", "Sort Download into folders by type", Icons.Rounded.AutoFixHigh, 0xFF7C4DFF, "Storage"),
    LARGE_FILES("Large files", "Files over 50 MB, biggest first", Icons.Rounded.Inventory2, 0xFFE88A12, "Storage"),
    SCREENSHOTS("Screenshots", "Review and clear old screenshots", Icons.Rounded.Screenshot, 0xFF0E93B0, "Storage"),
    WHATSAPP_MEDIA("WhatsApp media", "See what chats' photos and videos take", Icons.Rounded.Forum, 0xFF1A9D6B, "Storage"),
    IMAGE_TO_PDF("Image to PDF", "Photos into one PDF", Icons.Rounded.PictureAsPdf, 0xFFE0457B, "PDF & Images"),
    TEXT_TO_PDF("Text to PDF", "Type or paste text, save as PDF", Icons.AutoMirrored.Rounded.TextSnippet, 0xFF2F6BFF, "PDF & Images"),
    MERGE_PDF("Merge PDF", "Join PDFs in any order", Icons.AutoMirrored.Rounded.CallMerge, 0xFFE88A12, "PDF & Images"),
    SPLIT_PDF("Split PDF", "Pick, split or rotate pages", Icons.Rounded.ContentCut, 0xFF0E93B0, "PDF & Images"),
    PDF_TO_IMAGES("PDF to Images", "Every page as a picture", Icons.Rounded.PhotoLibrary, 0xFF7C4DFF, "PDF & Images"),
    COMPRESS_IMAGE("Compress", "Smaller photos, same look", Icons.Rounded.Compress, 0xFF1A9D6B, "PDF & Images"),
    RESIZE_IMAGE("Resize", "Change photo size", Icons.Rounded.PhotoSizeSelectLarge, 0xFF0E93B0, "PDF & Images"),
    CONVERT_IMAGE("JPG⇄PNG", "JPG, PNG or WEBP", Icons.Rounded.SwapHoriz, 0xFF4B5470, "PDF & Images"),
    STITCH("Long screenshot", "Join screenshots into one tall image", Icons.Rounded.ViewDay, 0xFF2F6BFF, "PDF & Images"),
    COLLAGE("Collage", "Photos in a neat grid", Icons.Rounded.GridView, 0xFFE0457B, "PDF & Images"),
    REMOVE_LOCATION("No location", "Remove GPS location from photos", Icons.Rounded.LocationOff, 0xFF1A9D6B, "PDF & Images"),
    QR_SCAN("QR scan", "Scan QR codes and barcodes", Icons.Rounded.QrCodeScanner, 0xFF7C4DFF, "QR"),
    QR_CREATE("QR maker", "Links, WiFi, contacts, text", Icons.Rounded.QrCode2, 0xFFE0457B, "QR"),
    PASSWORD("Password", "Strong passwords, made offline", Icons.Rounded.Password, 0xFF7C4DFF, "Security"),
    SECURE_FOLDER("Secure Folder", "Encrypted, PIN-protected files", Icons.Rounded.Lock, 0xFFDB2777, "Security"),
    CODE_STUDIO("Code Studio", "Edit code with tabs and highlighting", Icons.Rounded.Code, 0xFF0D9488, "Developer"),
    TERMINAL("Terminal", "Shell commands, root when available", Icons.Rounded.Terminal, 0xFF111827, "Developer"),
    DEV_UTILS("Dev utilities", "JSON, Base64, hash, regex, colours…", Icons.Rounded.DataObject, 0xFFE88A12, "Developer"),
    TEXT_SEARCH("Search in files", "Find text inside documents and code", Icons.Rounded.FindInPage, 0xFF7C3AED, "Developer"),
    HTML_PROJECTS("HTML Projects", "Build and run websites offline", Icons.Rounded.Language, 0xFF2563EB, "Developer"),
}

/** Short name and colour for each tool's box. */
private val Tool.short: String
    get() = when (this) {
        Tool.FOLDER_SIZE -> "Folder size"
        Tool.LARGE_FILES -> "Large files"
        Tool.ORGANIZE -> "Organize"
        Tool.SCREENSHOTS -> "Screenshots"
        Tool.WHATSAPP_MEDIA -> "WhatsApp"
        Tool.PASSWORD -> "Password"
        Tool.DEV_UTILS -> "Dev utilities"
        Tool.IMAGE_TO_PDF -> "Image→PDF"
        Tool.TEXT_TO_PDF -> "Text→PDF"
        Tool.MERGE_PDF -> "Merge PDF"
        Tool.SPLIT_PDF -> "Split PDF"
        Tool.PDF_TO_IMAGES -> "PDF→Images"
        Tool.COMPRESS_IMAGE -> "Compress"
        Tool.RESIZE_IMAGE -> "Resize"
        Tool.CONVERT_IMAGE -> "JPG⇄PNG"
        Tool.QR_SCAN -> "QR scan"
        Tool.STITCH -> "Long shot"
        Tool.COLLAGE -> "Collage"
        Tool.REMOVE_LOCATION -> "No location"
        Tool.QR_CREATE -> "QR maker"
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
        Tool.LARGE_FILES -> Palette.Orange
        Tool.ORGANIZE -> Palette.Purple
        Tool.SCREENSHOTS -> Palette.Cyan
        Tool.WHATSAPP_MEDIA -> Palette.Green
        Tool.PASSWORD -> Palette.Purple
        Tool.DEV_UTILS -> Palette.Orange
        Tool.IMAGE_TO_PDF -> Palette.Pink
        Tool.TEXT_TO_PDF -> Palette.Blue
        Tool.MERGE_PDF -> Palette.Orange
        Tool.SPLIT_PDF -> Palette.Cyan
        Tool.PDF_TO_IMAGES -> Palette.Purple
        Tool.COMPRESS_IMAGE -> Palette.Green
        Tool.RESIZE_IMAGE -> Palette.Cyan
        Tool.CONVERT_IMAGE -> Palette.Slate
        Tool.QR_SCAN -> Palette.Purple
        Tool.STITCH -> Palette.Blue
        Tool.COLLAGE -> Palette.Pink
        Tool.REMOVE_LOCATION -> Palette.Green
        Tool.QR_CREATE -> Palette.Pink
        Tool.ANALYZER -> Palette.Purple
        Tool.CLEANER -> Palette.Green
        Tool.RECYCLE_BIN -> Palette.Pink
        Tool.SECURE_FOLDER -> Palette.Purple
        Tool.CODE_STUDIO -> Palette.Orange
        Tool.TERMINAL -> Palette.Slate
        Tool.TEXT_SEARCH -> Palette.Green
        Tool.HTML_PROJECTS -> Palette.Cyan
    }

/** Illustrated icon for the tools that have one. */
val Tool.iconRes: Int?
    get() = when (this) {
        Tool.CLEANER -> com.webtecit.filepilot.R.drawable.ic_tool_cleaner
        Tool.CODE_STUDIO -> com.webtecit.filepilot.R.drawable.ic_tool_code
        Tool.WHATSAPP_MEDIA -> com.webtecit.filepilot.R.drawable.ic_tool_chat
        Tool.LARGE_FILES -> com.webtecit.filepilot.R.drawable.ic_tool_large
        Tool.RECYCLE_BIN -> com.webtecit.filepilot.R.drawable.ic_tool_bin
        Tool.SECURE_FOLDER -> com.webtecit.filepilot.R.drawable.ic_tool_secure
        Tool.QR_SCAN -> com.webtecit.filepilot.R.drawable.ic_tool_qr
        Tool.STITCH -> com.webtecit.filepilot.R.drawable.ic_tool_long
        Tool.FOLDER_SIZE -> com.webtecit.filepilot.R.drawable.ic_tool_folder_size
        else -> null
    }

/** Tools in equal boxes: the same width and height for every box, whatever the label. */
@Composable
fun ToolGrid(tools: List<Tool>, onTool: (Tool) -> Unit, columns: Int = 3) {
    EqualGrid(tools, columns) { tool, m ->
        GridBox(tool.short, tool.icon, tool.color, m, height = 96.dp, iconRes = tool.iconRes) { onTool(tool) }
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
                        ToolGrid(tools, onTool, columns = 4)
                    }
                }
            }
        }
    }
}

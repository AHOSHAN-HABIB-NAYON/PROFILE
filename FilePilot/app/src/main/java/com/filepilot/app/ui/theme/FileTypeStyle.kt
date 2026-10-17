package com.filepilot.app.ui.theme

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.TextSnippet
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Slideshow
import androidx.compose.material.icons.rounded.TableChart
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.filepilot.app.core.model.FileType

data class TypeStyle(val icon: ImageVector, val color: Color, val label: String)

@Suppress("DEPRECATION")
/** One consistent icon + color per file type, used everywhere files appear. */
fun FileType.style(): TypeStyle = when (this) {
    FileType.FOLDER -> TypeStyle(Icons.Rounded.Folder, Color(0xFF5B5FF2), "Folder")
    FileType.IMAGE -> TypeStyle(Icons.Rounded.Image, Color(0xFF10B981), "Image")
    FileType.VIDEO -> TypeStyle(Icons.Rounded.Movie, Color(0xFFF43F5E), "Video")
    FileType.AUDIO -> TypeStyle(Icons.Rounded.MusicNote, Color(0xFFF59E0B), "Audio")
    FileType.PDF -> TypeStyle(Icons.Rounded.PictureAsPdf, Color(0xFFE11D48), "PDF")
    FileType.TEXT -> TypeStyle(Icons.Rounded.TextSnippet, Color(0xFF64748B), "Text")
    FileType.CODE -> TypeStyle(Icons.Rounded.Code, Color(0xFF0EA5E9), "Code")
    FileType.DOCUMENT -> TypeStyle(Icons.Rounded.Description, Color(0xFF3B82F6), "Document")
    FileType.SPREADSHEET -> TypeStyle(Icons.Rounded.TableChart, Color(0xFF16A34A), "Spreadsheet")
    FileType.PRESENTATION -> TypeStyle(Icons.Rounded.Slideshow, Color(0xFFEA580C), "Presentation")
    FileType.ARCHIVE -> TypeStyle(Icons.Rounded.FolderZip, Color(0xFF8B5CF6), "Archive")
    FileType.APK -> TypeStyle(Icons.Rounded.Android, Color(0xFF65A30D), "APK")
    FileType.OTHER -> TypeStyle(Icons.Rounded.InsertDriveFile, Color(0xFF94A3B8), "File")
}

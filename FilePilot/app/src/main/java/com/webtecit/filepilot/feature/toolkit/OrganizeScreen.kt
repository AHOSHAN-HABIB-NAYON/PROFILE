@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.toolkit

import android.os.Environment
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.Feedback
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Folder each kind of file goes into. */
enum class OrganizeGroup(val folder: String, val icon: ImageVector, val tint: Color) {
    IMAGES("Images", Icons.Rounded.Image, Palette.Blue),
    VIDEOS("Videos", Icons.Rounded.Movie, Palette.Pink),
    AUDIO("Audio", Icons.Rounded.MusicNote, Palette.Orange),
    PDFS("PDFs", Icons.Rounded.PictureAsPdf, Palette.Red),
    DOCUMENTS("Documents", Icons.Rounded.Description, Palette.Green),
    ARCHIVES("Archives", Icons.Rounded.FolderZip, Palette.Cyan),
    APKS("APKs", Icons.Rounded.Android, Palette.Purple),
    CODE("Code", Icons.Rounded.Code, Palette.Slate),
    OTHERS("Others", Icons.AutoMirrored.Rounded.InsertDriveFile, Palette.Slate),
}

object Organizer {
    fun groupOf(name: String): OrganizeGroup = when (FileTypes.kindOf(name, false)) {
        FileKind.IMAGE -> OrganizeGroup.IMAGES
        FileKind.VIDEO -> OrganizeGroup.VIDEOS
        FileKind.AUDIO -> OrganizeGroup.AUDIO
        FileKind.PDF -> OrganizeGroup.PDFS
        FileKind.DOCUMENT, FileKind.SPREADSHEET, FileKind.PRESENTATION, FileKind.TEXT -> OrganizeGroup.DOCUMENTS
        FileKind.ARCHIVE -> OrganizeGroup.ARCHIVES
        FileKind.APK -> OrganizeGroup.APKS
        FileKind.CODE -> OrganizeGroup.CODE
        else -> OrganizeGroup.OTHERS
    }

    /** Loose files directly in [dir] (not in sub-folders, not hidden), by the folder they would go to. */
    fun plan(dir: File): Map<OrganizeGroup, List<File>> =
        dir.listFiles().orEmpty()
            .filter { it.isFile && !it.name.startsWith(".") }
            .groupBy { groupOf(it.name) }
            .toSortedMap(compareBy { it.ordinal })

    /** Moves the files; returns (from, to) pairs so the move can be undone. Existing names get "(1)". */
    fun apply(dir: File, groups: Map<OrganizeGroup, List<File>>): List<Pair<File, File>> {
        val moves = ArrayList<Pair<File, File>>()
        for ((group, files) in groups) {
            val target = File(dir, group.folder).apply { mkdirs() }
            for (f in files) {
                val dest = MediaTools.uniqueFile(target, f.nameWithoutExtension, f.extension).let { if (f.extension.isEmpty()) File(target, uniqueBare(target, f.name)) else it }
                if (f.renameTo(dest)) moves += f to dest
            }
        }
        return moves
    }

    private fun uniqueBare(dir: File, name: String): String {
        var n = name
        var i = 1
        while (File(dir, n).exists()) n = "$name (${i++})"
        return n
    }

    fun undo(moves: List<Pair<File, File>>) {
        for ((from, to) in moves.reversed()) {
            if (to.exists() && !from.exists()) to.renameTo(from)
        }
        // remove folders the organiser created that are now empty
        moves.map { it.second.parentFile }.distinct().forEach { d -> if (d != null && d.list()?.isEmpty() == true) d.delete() }
    }
}

@Composable
fun OrganizeScreen(startPath: String?, onBack: () -> Unit, onOpenFolder: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val dir = remember(startPath) {
        File(startPath?.takeIf { it.isNotBlank() } ?: Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath)
    }
    var plan by remember { mutableStateOf<Map<OrganizeGroup, List<File>>?>(null) }
    var chosen by remember { mutableStateOf(OrganizeGroup.entries.toSet() - OrganizeGroup.OTHERS) }
    var working by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(dir, reload) { plan = withContext(Dispatchers.IO) { Organizer.plan(dir) } }
    val current = plan
    val selectedCount = current?.filterKeys { it in chosen }?.values?.sumOf { it.size } ?: 0

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Smart organize") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Button(
                    onClick = {
                        val groups = current?.filterKeys { it in chosen } ?: return@Button
                        working = true
                        scope.launch {
                            val moves = withContext(Dispatchers.IO) { Organizer.apply(dir, groups) }
                            working = false
                            reload++
                            if (moves.isNotEmpty()) {
                                Feedback.show(
                                    com.webtecit.filepilot.core.designsystem.FeedbackEvent(
                                        com.webtecit.filepilot.core.designsystem.FeedbackKind.SAVED,
                                        "Organized", "${moves.size} files sorted into folders",
                                        undo = { withContext(Dispatchers.IO) { Organizer.undo(moves) }; reload++ },
                                    ),
                                )
                            }
                        }
                    },
                    enabled = selectedCount > 0 && !working,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).height(52.dp).testTag("organize"),
                ) {
                    Icon(Icons.Rounded.AutoFixHigh, null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (working) "Sorting…" else "Organize $selectedCount files", fontWeight = FontWeight.SemiBold)
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OptionCard("Folder") {
                Text(dir.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(dir.absolutePath, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                androidx.compose.material3.TextButton(onClick = { onOpenFolder(dir.absolutePath) }) { Text("Open folder") }
            }
            when {
                current == null -> Text("Looking at the files…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                current.isEmpty() -> Text("This folder has no loose files to sort. Everything is already in folders.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> {
                    Text("Files will move into these folders inside ${dir.name}. You can undo right after.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Surface(
                        shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                    ) {
                        Column(Modifier.padding(vertical = 4.dp)) {
                            current.forEach { (group, files) ->
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(checked = group in chosen, onCheckedChange = { chosen = if (it) chosen + group else chosen - group })
                                    Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(group.tint.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
                                        Icon(group.icon, null, tint = group.tint, modifier = Modifier.size(20.dp))
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text("${group.folder}/", fontWeight = FontWeight.SemiBold)
                                        Text(
                                            "${Formatters.count(files.size, "file")} · ${Formatters.size(files.sumOf { it.length() })}",
                                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

package com.webtecit.filepilot.feature.editor

import android.os.Environment
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.RocketLaunch
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webtecit.filepilot.core.designsystem.FolderPickerDialog
import com.webtecit.filepilot.core.designsystem.GradientIcon
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.data.LibraryEntry
import java.io.File

/** A language the start screen can create a file in, with starter text. */
private data class Language(val label: String, val symbol: String, val color: Color, val fileName: String, val template: String)

private val languages = listOf(
    Language("HTML", "</>", Color(0xFFE34F26), "index.html", """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>My page</title>
        </head>
        <body>
          <h1>Hello!</h1>

        </body>
        </html>
    """.trimIndent() + "\n"),
    Language("CSS", "#", Color(0xFF1572B6), "style.css", "body {\n  font-family: system-ui, sans-serif;\n  margin: 0;\n}\n"),
    Language("JavaScript", "JS", Color(0xFFD4A60A), "app.js", "// Your JavaScript\nconsole.log(\"Hello!\");\n"),
    Language("Kotlin", "Kt", Color(0xFF7F52FF), "Main.kt", "fun main() {\n    println(\"Hello!\")\n}\n"),
    Language("Python", "Py", Color(0xFF3776AB), "main.py", "def main():\n    print(\"Hello!\")\n\n\nif __name__ == \"__main__\":\n    main()\n"),
    Language("PHP", "php", Color(0xFF777BB3), "index.php", "<?php\necho \"Hello!\";\n"),
    Language("JSON", "{ }", Color(0xFF555B6E), "data.json", "{\n  \"name\": \"value\"\n}\n"),
    Language("Text", "Aa", Color(0xFF4B5470), "notes.txt", ""),
)

private val websiteFiles = listOf(
    "index.html" to """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>My website</title>
          <link rel="stylesheet" href="style.css">
        </head>
        <body>
          <header>
            <h1>My website</h1>
            <p>Edit index.html, style.css and app.js, then tap Preview.</p>
          </header>
          <main>
            <button id="hello">Say hello</button>
          </main>
          <script src="app.js"></script>
        </body>
        </html>
    """.trimIndent() + "\n",
    "style.css" to """
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, sans-serif; color: #151A2D; background: #F4F6FB; }
        header { padding: 48px 24px; background: linear-gradient(135deg, #3B7BFF, #7C4DFF); color: #fff; }
        main { padding: 24px; }
        button { padding: 12px 20px; border: 0; border-radius: 12px; background: #2F6BFF; color: #fff; font-size: 16px; }
    """.trimIndent() + "\n",
    "app.js" to "document.getElementById(\"hello\").addEventListener(\"click\", () => alert(\"Hello!\"));\n",
)

private val landingFiles = listOf(
    "index.html" to """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Landing page</title>
          <link rel="stylesheet" href="style.css">
        </head>
        <body>
          <section class="hero">
            <h1>Build something great</h1>
            <p>A short sentence that explains what you offer.</p>
            <a class="btn" href="#contact">Get started</a>
          </section>
          <section class="features">
            <div class="card"><h3>Fast</h3><p>Loads in a blink.</p></div>
            <div class="card"><h3>Simple</h3><p>Easy to use.</p></div>
            <div class="card"><h3>Secure</h3><p>Your data stays yours.</p></div>
          </section>
          <section id="contact" class="contact">
            <h2>Contact</h2>
            <form><input placeholder="Your email"><button>Send</button></form>
          </section>
        </body>
        </html>
    """.trimIndent() + "\n",
    "style.css" to """
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, sans-serif; color: #151A2D; }
        .hero { padding: 72px 24px; text-align: center; background: linear-gradient(135deg, #3B7BFF, #1A45C9); color: #fff; }
        .btn { display: inline-block; margin-top: 16px; padding: 12px 22px; border-radius: 12px; background: #fff; color: #1A45C9; text-decoration: none; font-weight: 600; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; padding: 32px 24px; }
        .card { padding: 20px; border-radius: 16px; background: #F4F6FB; }
        .contact { padding: 32px 24px; text-align: center; }
        input { padding: 12px; border: 1px solid #CBD2E1; border-radius: 10px; margin-right: 8px; }
        button { padding: 12px 18px; border: 0; border-radius: 10px; background: #2F6BFF; color: #fff; }
    """.trimIndent() + "\n",
)

private fun defaultCodeDir(): String = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "Code").absolutePath

private sealed interface NewThing {
    data class FileOf(val language: Language) : NewThing
    data class Project(val title: String, val files: List<Pair<String, String>>) : NewThing
}

/** Shown when no file is open: start a new file or project, open one, or reopen a recent file. */
@Composable
fun CodeStart(
    recent: List<LibraryEntry>,
    onCreateFile: (dir: String, name: String, text: String) -> Unit,
    onCreateProject: (dir: String, name: String, files: List<Pair<String, String>>) -> Unit,
    onBrowse: () -> Unit,
    onOpenRecent: (String) -> Unit,
) {
    var creating by remember { mutableStateOf<NewThing?>(null) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).testTag("code_start"),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Surface(
            onClick = { creating = NewThing.FileOf(languages[0]) },
            shape = RoundedCornerShape(22.dp),
            color = Color.Transparent,
            modifier = Modifier.fillMaxWidth().testTag("new_file"),
        ) {
            Row(
                Modifier.background(Brush.linearGradient(listOf(Color(0xFF1E2440), Color(0xFF11162A)))).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GradientIcon(Icons.Rounded.Add, Palette.Blue, size = 48.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("New file", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Start writing code right away", color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Color.White.copy(alpha = 0.7f))
            }
        }
        Section("Choose a language")
        languages.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { lang ->
                    Surface(
                        onClick = { creating = NewThing.FileOf(lang) },
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                        modifier = Modifier.weight(1f).height(80.dp),
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Text(lang.symbol, color = lang.color, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Spacer(Modifier.height(6.dp))
                            Text(lang.label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        }
                    }
                }
            }
        }
        Section("Start a project")
        Card {
            StartRow(Icons.Rounded.Language, Palette.Orange, "Website", "index.html, style.css, app.js") { creating = NewThing.Project("My website", websiteFiles) }
            StartRow(Icons.Rounded.RocketLaunch, Palette.Purple, "Landing page", "Hero, features, contact") { creating = NewThing.Project("Landing page", landingFiles) }
            StartRow(Icons.Rounded.FolderOpen, Palette.Cyan, "Open a file or folder", "From your phone", onBrowse)
        }
        if (recent.isNotEmpty()) {
            Section("Recent")
            Card {
                recent.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onOpenRecent(r.id) }.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val lang = languages.firstOrNull { it.fileName.substringAfterLast('.') == r.name.substringAfterLast('.', "") }
                        Text(
                            lang?.symbol ?: "Aa", color = lang?.color ?: Palette.Slate, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(40.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(r.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(File(r.id).parentFile?.name.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }

    creating?.let { thing ->
        CreateDialog(
            thing = thing,
            onDismiss = { creating = null },
            onCreate = { dir, name, language ->
                creating = null
                when (thing) {
                    is NewThing.FileOf -> onCreateFile(dir, name, (language ?: thing.language).template)
                    is NewThing.Project -> onCreateProject(dir, name, thing.files)
                }
            },
        )
    }
}

@Composable
private fun Section(title: String) {
    Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp, top = 8.dp))
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
    ) { Column(Modifier.padding(vertical = 4.dp)) { content() } }
}

@Composable
private fun StartRow(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        GradientIcon(icon, tint, size = 40.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.outline)
    }
}

/** Asks for a name and a folder, then creates the file or project. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun CreateDialog(thing: NewThing, onDismiss: () -> Unit, onCreate: (dir: String, name: String, language: Language?) -> Unit) {
    val isFile = thing is NewThing.FileOf
    val ext = (thing as? NewThing.FileOf)?.language?.fileName?.substringAfterLast('.', "") ?: ""
    var language by remember { mutableStateOf((thing as? NewThing.FileOf)?.language) }
    var name by remember {
        mutableStateOf(
            when (thing) {
                is NewThing.FileOf -> thing.language.fileName.substringBeforeLast('.')
                is NewThing.Project -> thing.title
            },
        )
    }
    var dir by remember { mutableStateOf(defaultCodeDir()) }
    var picking by remember { mutableStateOf(false) }
    val currentExt = language?.fileName?.substringAfterLast('.', "") ?: ext
    val error = com.webtecit.filepilot.core.storage.NameRules.validate(name.trim())
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isFile) "New ${language?.label ?: ""} file" else "New project") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (isFile) {
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        languages.forEach { l ->
                            androidx.compose.material3.FilterChip(
                                selected = language == l,
                                onClick = {
                                    if (name == language?.fileName?.substringBeforeLast('.')) name = l.fileName.substringBeforeLast('.')
                                    language = l
                                },
                                label = { Text(l.label) },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, singleLine = true,
                    label = { Text(if (isFile) "File name" else "Folder name") },
                    suffix = if (isFile && currentExt.isNotEmpty()) ({ Text(".$currentExt") }) else null,
                    isError = error != null, supportingText = error?.let { { Text(it) } },
                    modifier = Modifier.fillMaxWidth().testTag("new_name"),
                )
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { picking = true }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Palette.Orange.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.Folder, null, tint = Palette.Orange, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(dir.removePrefix(Environment.getExternalStorageDirectory().absolutePath).trimStart('/').ifEmpty { "Internal storage" }, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f), maxLines = 2)
                    Text("Change", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val n = name.trim()
                    onCreate(dir, if (isFile && currentExt.isNotEmpty() && !n.endsWith(".$currentExt")) "$n.$currentExt" else n, language)
                },
                enabled = error == null,
                modifier = Modifier.testTag("create"),
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
    if (picking) {
        FolderPickerDialog("Save in", "Choose this folder", start = dir, onPick = { dir = it; picking = false }, onDismiss = { picking = false })
    }
}

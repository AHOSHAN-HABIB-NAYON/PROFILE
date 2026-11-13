@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.devtools

import android.database.sqlite.SQLiteDatabase
import android.graphics.Typeface
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import com.webtecit.filepilot.core.archive.ArchiveEntry
import com.webtecit.filepilot.core.archive.TarTools
import com.webtecit.filepilot.core.archive.ZipTools
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.designsystem.MonoStyle
import com.webtecit.filepilot.core.designsystem.SectionHeader
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.userMessage
import java.io.File
import java.io.RandomAccessFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
private fun ToolScaffold(title: String, subtitle: String? = null, onBack: () -> Unit, content: @Composable (PaddingValues) -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
        content = content,
    )
}

@Composable
private fun Kv(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(120.dp))
        SelectionContainer(Modifier.weight(1f)) { Text(value, style = MaterialTheme.typography.bodyMedium) }
    }
}

// ---------------------------------------------------------------------------------------------

@Composable
fun ApkInfoScreen(path: String, onBack: () -> Unit) {
    val context = LocalContext.current
    var report by remember { mutableStateOf<ApkReport?>(null) }
    var bundle by remember { mutableStateOf<List<Pair<String, Long>>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val ext = FileTypes.extensionOf(path)
    LaunchedEffect(path) {
        withContext(Dispatchers.IO) {
            runCatching {
                if (ext == "apk") report = ApkInspector.inspect(context, path) else bundle = ApkInspector.bundleContents(path)
            }.onFailure { error = it.userMessage() }
        }
    }
    ToolScaffold(if (ext == "apk") "APK information" else "App bundle contents", File(path).name, onBack) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            if (report == null && bundle == null && error == null) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            report?.let { r ->
                item {
                    AppCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            r.icon?.let { Image(it.toBitmap(96, 96).asImageBitmap(), null, Modifier.size(56.dp)) }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(r.label, style = MaterialTheme.typography.titleLarge)
                                Text(r.packageName, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Kv("Version", "${r.versionName} (${r.versionCode})")
                        Kv("Minimum SDK", "API ${r.minSdk}")
                        Kv("Target SDK", "API ${r.targetSdk}")
                        Kv("Size", Formatters.size(File(path).length()))
                        Kv("DEX files", "${r.dexFiles}")
                        Kv("Entries", "${r.entries}")
                        Kv("Native code", if (r.nativeAbis.isEmpty()) "None" else r.nativeAbis.entries.joinToString { "${it.key} (${it.value})" })
                    }
                }
                item {
                    var manifest by remember { mutableStateOf<String?>(null) }
                    TextButton(onClick = {
                        manifest = runCatching {
                            java.util.zip.ZipFile(path).use { z -> z.getInputStream(z.getEntry("AndroidManifest.xml")).use { AxmlDecoder.decode(it.readBytes()) } }
                        }.getOrElse { "The manifest couldn't be decoded: ${it.message}" }
                    }) { Text("View AndroidManifest.xml") }
                    manifest?.let { m ->
                        AlertDialog(
                            onDismissRequest = { manifest = null },
                            title = { Text("AndroidManifest.xml") },
                            text = {
                                Box(Modifier.height(420.dp).horizontalScroll(rememberScrollState())) {
                                    SelectionContainer { Text(m, style = MonoStyle, modifier = Modifier.verticalScrollCompat()) }
                                }
                            },
                            confirmButton = { TextButton(onClick = { manifest = null }) { Text("Close") } },
                        )
                    }
                }
                item { SectionHeader("Signing certificates") }
                items(r.certificates) { c -> AppCard { SelectionContainer { Text(c, style = MonoStyle) } } }
                if (r.certificates.isEmpty()) item { Text("No signature found. Android won't install an unsigned APK.") }
                item { SectionHeader("Permissions (${r.permissions.size})") }
                items(r.permissions) { p -> Text(p.removePrefix("android.permission."), style = MonoStyle, modifier = Modifier.padding(vertical = 2.dp)) }
            }
            bundle?.let { b ->
                item { Text("${b.size} files. Split APKs and expansion files are listed below; install bundles with a dedicated installer.") }
                items(b) { (name, size) -> Kv(name, Formatters.size(size)) }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------

/** Pages through a file 16 bytes per row; bytes can be edited in place (local files). */
@Composable
fun HexScreen(path: String, onBack: () -> Unit) {
    val file = remember { File(path) }
    val size = remember { file.length() }
    val rows = ((size + 15) / 16).toInt().coerceAtMost(Int.MAX_VALUE - 1)
    var editRow by remember { mutableStateOf<Long?>(null) }
    var version by remember { mutableIntStateOf(0) }
    val cache = remember { HashMap<Long, ByteArray>() }
    val scope = rememberCoroutineScope()
    var gotoOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    fun block(offset: Long): ByteArray = cache.getOrPut(offset / 65536) {
        RandomAccessFile(file, "r").use { raf ->
            val start = offset / 65536 * 65536
            raf.seek(start)
            val buf = ByteArray(minOf(65536L, size - start).toInt())
            raf.readFully(buf)
            buf
        }
    }
    ToolScaffold("HEX editor", "${file.name} · ${Formatters.size(size)}", onBack) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(Modifier.padding(horizontal = 12.dp)) { TextButton(onClick = { gotoOpen = true }) { Text("Go to offset") } }
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
                items(rows) { r ->
                    val offset = r * 16L
                    val bytes = remember(r, version) {
                        runCatching {
                            val b = block(offset)
                            val inBlock = (offset % 65536).toInt()
                            b.copyOfRange(inBlock, minOf(inBlock + 16, b.size))
                        }.getOrDefault(ByteArray(0))
                    }
                    val hex = bytes.joinToString(" ") { "%02X".format(it) }.padEnd(47)
                    val ascii = bytes.map { val c = it.toInt() and 0xFF; if (c in 32..126) c.toChar() else '.' }.joinToString("")
                    Text(
                        "%08X  %s  %s".format(offset, hex, ascii),
                        style = MonoStyle,
                        modifier = Modifier.clickable { editRow = offset }.padding(horizontal = 12.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
    if (gotoOpen) {
        var text by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { gotoOpen = false },
            title = { Text("Go to offset") },
            text = { OutlinedTextField(text, { text = it }, label = { Text("Hex offset, e.g. 1A0") }, singleLine = true) },
            confirmButton = { TextButton(onClick = {
                gotoOpen = false
                text.trim().removePrefix("0x").toLongOrNull(16)?.let { scope.launch { listState.scrollToItem((it / 16).toInt().coerceIn(0, (rows - 1).coerceAtLeast(0))) } }
            }) { Text("Go") } },
            dismissButton = { TextButton(onClick = { gotoOpen = false }) { Text("Cancel") } },
        )
    }
    editRow?.let { offset ->
        val original = remember(offset) { runCatching { block(offset).let { b -> val i = (offset % 65536).toInt(); b.copyOfRange(i, minOf(i + 16, b.size)) } }.getOrDefault(ByteArray(0)) }
        var text by remember(offset) { mutableStateOf(original.joinToString(" ") { "%02X".format(it) }) }
        var error by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { editRow = null },
            title = { Text("Edit bytes at %08X".format(offset)) },
            text = {
                Column {
                    OutlinedTextField(text, { text = it.uppercase() }, singleLine = false, textStyle = MonoStyle, isError = error != null,
                        supportingText = { Text(error ?: "Change hex values; the number of bytes must stay ${original.size}.") })
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val parts = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
                    val bytes = parts.mapNotNull { it.toIntOrNull(16)?.takeIf { v -> v in 0..255 }?.toByte() }
                    if (bytes.size != original.size || parts.size != original.size) { error = "Enter exactly ${original.size} hex bytes (00–FF)."; return@TextButton }
                    val ok = runCatching { RandomAccessFile(file, "rw").use { it.seek(offset); it.write(bytes.toByteArray()) } }.isSuccess
                    if (ok) { cache.clear(); version++; editRow = null } else error = "This file can't be changed here."
                }) { Text("Write") }
            },
            dismissButton = { TextButton(onClick = { editRow = null }) { Text("Cancel") } },
        )
    }
}

// ---------------------------------------------------------------------------------------------

@Composable
fun SqliteScreen(path: String, onBack: () -> Unit) {
    var tables by remember { mutableStateOf<List<String>>(emptyList()) }
    var table by remember { mutableStateOf<String?>(null) }
    var columns by remember { mutableStateOf<List<String>>(emptyList()) }
    var rows by remember { mutableStateOf<List<List<String>>>(emptyList()) }
    var page by remember { mutableIntStateOf(0) }
    var sql by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmWrite by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun query(statement: String, args: Array<String>? = null) = withContext(Dispatchers.IO) {
        runCatching {
            SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(statement, args).use { c ->
                    columns = c.columnNames.toList()
                    val out = ArrayList<List<String>>()
                    while (c.moveToNext() && out.size < 500) out += (0 until c.columnCount).map { i ->
                        when (c.getType(i)) {
                            android.database.Cursor.FIELD_TYPE_NULL -> "NULL"
                            android.database.Cursor.FIELD_TYPE_BLOB -> "BLOB(${c.getBlob(i).size} bytes)"
                            else -> c.getString(i).take(200)
                        }
                    }
                    rows = out
                    message = "${out.size} rows" + if (out.size == 500) " (first 500)" else ""
                }
            }
        }.onFailure { message = it.message ?: "Query failed." }
    }
    LaunchedEffect(path) {
        withContext(Dispatchers.IO) {
            runCatching {
                SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                    db.rawQuery("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name", null).use { c ->
                        tables = buildList { while (c.moveToNext()) add(c.getString(0)) }
                    }
                }
            }.onFailure { message = "This file can't be opened as an SQLite database." }
        }
    }
    LaunchedEffect(table, page) { table?.let { t -> query("SELECT * FROM \"${t.replace("\"", "\"\"")}\" LIMIT 100 OFFSET ${page * 100}") } }

    ToolScaffold("SQLite", File(path).name, onBack) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                tables.forEach { t -> FilterChip(selected = t == table, onClick = { table = t; page = 0 }, label = { Text(t) }) }
            }
            Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(sql, { sql = it }, label = { Text("SQL") }, modifier = Modifier.weight(1f), textStyle = MonoStyle,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { if (sql.isNotBlank()) { if (isWrite(sql)) confirmWrite = true else scope.launch { table = null; query(sql) } } }))
                TextButton(onClick = { if (sql.isNotBlank()) { if (isWrite(sql)) confirmWrite = true else scope.launch { table = null; query(sql) } } }) { Text("Run") }
            }
            message?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 12.dp)) }
            if (table != null) Row(Modifier.padding(horizontal = 8.dp)) {
                TextButton(onClick = { if (page > 0) page-- }, enabled = page > 0) { Text("Previous") }
                Text("Page ${page + 1}", Modifier.align(Alignment.CenterVertically))
                TextButton(onClick = { page++ }, enabled = rows.size == 100) { Text("Next") }
            }
            HorizontalDivider()
            Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
                LazyColumn {
                    item {
                        Row(Modifier.background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                            columns.forEach { Text(it, style = MonoStyle, modifier = Modifier.width(140.dp).padding(6.dp), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                    items(rows) { r ->
                        Row { r.forEach { Text(it, style = MonoStyle, modifier = Modifier.width(140.dp).padding(6.dp), maxLines = 2, overflow = TextOverflow.Ellipsis) } }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
    if (confirmWrite) {
        AlertDialog(
            onDismissRequest = { confirmWrite = false },
            title = { Text("Change the database?") },
            text = { Text("This statement modifies \"${File(path).name}\". Make a copy first if the data matters.\n\n$sql") },
            confirmButton = {
                TextButton(onClick = {
                    confirmWrite = false
                    scope.launch {
                        message = withContext(Dispatchers.IO) {
                            runCatching {
                                SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE).use { it.execSQL(sql) }
                                "Statement executed."
                            }.getOrElse { it.message ?: "Statement failed." }
                        }
                    }
                }) { Text("Run statement", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmWrite = false }) { Text("Cancel") } },
        )
    }
}

private fun isWrite(sql: String): Boolean =
    sql.trim().substringBefore(' ').uppercase() !in setOf("SELECT", "PRAGMA", "EXPLAIN", "WITH")

// ---------------------------------------------------------------------------------------------

@Composable
fun ArchiveScreen(path: String, onBack: () -> Unit, onOpenFolder: (String) -> Unit) {
    val file = remember { File(path) }
    val ext = FileTypes.fullExtensionOf(file.name).lowercase()
    var entries by remember { mutableStateOf<List<ArchiveEntry>?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val isZip = ext in setOf("zip", "jar", "apk", "xapk", "apks", "aar", "epub")
    val isTar = ext in setOf("tar", "tar.gz", "tgz")
    LaunchedEffect(path) {
        withContext(Dispatchers.IO) {
            runCatching {
                entries = when {
                    isZip -> file.inputStream().use { ZipTools.list(it) }
                    isTar -> buildList {
                        file.inputStream().use { input ->
                            TarTools.read(TarTools.open(input, ext != "tar")) { name, size, dir, _ -> add(ArchiveEntry(name, size, size, dir, 0)) }
                        }
                    }
                    ext == "gz" -> listOf(ArchiveEntry(file.name.removeSuffix(".gz"), -1, file.length(), false, file.lastModified()))
                    else -> throw IllegalArgumentException("${ext.uppercase()} archives can't be opened in FilePilot. Use Open with to choose another app.")
                }
            }.onFailure { status = it.userMessage() }
        }
    }
    ToolScaffold("Archive", file.name, onBack) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(enabled = entries != null && !busy, onClick = {
                    busy = true
                    scope.launch {
                        val target = File(file.parentFile, file.name.substringBefore('.').ifBlank { "extracted" }).let { base ->
                            var t = base; var n = 1
                            while (t.exists()) t = File(file.parentFile, "${base.name} (${n++})")
                            t
                        }
                        status = withContext(Dispatchers.IO) {
                            runCatching {
                                val count = when {
                                    isZip -> file.inputStream().use { ZipTools.extract(it, target) }
                                    isTar -> file.inputStream().use { TarTools.extract(TarTools.open(it, ext != "tar"), target) }
                                    else -> {
                                        target.mkdirs()
                                        java.util.zip.GZIPInputStream(file.inputStream().buffered()).use { gz ->
                                            File(target, file.name.removeSuffix(".gz")).outputStream().use { gz.copyTo(it) }
                                        }
                                        1
                                    }
                                }
                                "Extracted $count files to ${target.name}"
                            }.getOrElse { target.deleteRecursively(); "Extraction failed: ${it.userMessage()}" }
                        }
                        busy = false
                        if (target.exists()) onOpenFolder(target.absolutePath)
                    }
                }) { Text("Extract here") }
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            status?.let { Text(it, Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.bodyMedium) }
            val list = entries
            if (list == null && status == null) CircularProgressIndicator(Modifier.padding(24.dp))
            if (list != null) {
                Text("${list.count { !it.isDirectory }} files · ${Formatters.size(list.filter { it.size > 0 }.sumOf { it.size })} uncompressed",
                    Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.bodySmall)
                LazyColumn(contentPadding = PaddingValues(12.dp)) {
                    items(list) { e ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Text(e.path, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                            if (!e.isDirectory && e.size >= 0) Text(Formatters.size(e.size), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------

/** Runs shell commands in the app's own sandbox, or through "su" when the device is rooted and the user allows it. */
@Composable
fun TerminalScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val lines = remember { mutableStateListOf<Pair<Boolean, String>>() }
    val history = remember { mutableStateListOf<String>() }
    var input by remember { mutableStateOf("") }
    var cwd by remember { mutableStateOf(context.filesDir.absolutePath) }
    val rooted = remember { listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su", "/system/sbin/su").any { File(it).exists() } }
    var useRoot by remember { mutableStateOf(false) }
    var running by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) {
        if (lines.isEmpty()) {
            lines += false to "FilePilot terminal · Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT}) · ${android.os.Build.SUPPORTED_ABIS.firstOrNull()}"
            lines += false to "Commands run with the app's own permissions. Root: ${if (rooted) "su found on this device" else "not available (device isn't rooted)"}."
            lines += false to "Try: ls, pwd, cd, cat, echo, id, uname -a, df, ps, getprop ro.product.model, clear"
        }
    }
    LaunchedEffect(lines.size) { if (lines.isNotEmpty()) listState.scrollToItem(lines.lastIndex) }
    fun run(cmd: String) {
        if (cmd.isBlank()) return
        history.remove(cmd); history.add(cmd)
        lines += true to "${if (useRoot) "#" else "$"} $cmd"
        input = ""
        when {
            cmd.trim() == "clear" -> { lines.clear(); return }
            cmd.trim().startsWith("cd") -> {
                val arg = cmd.trim().removePrefix("cd").trim().ifEmpty { context.filesDir.absolutePath }
                val target = (if (arg.startsWith("/")) File(arg) else File(cwd, arg)).canonicalFile
                if (target.isDirectory) cwd = target.absolutePath else lines += false to "cd: $arg: No such directory"
                return
            }
        }
        running = true
        scope.launch {
            val output = withContext(Dispatchers.IO) {
                runCatching {
                    val command = if (useRoot) listOf("su", "-c", "cd '${cwd.replace("'", "'\\''")}' && $cmd") else listOf("sh", "-c", cmd)
                    val process = ProcessBuilder(command).directory(File(cwd)).redirectErrorStream(true).start()
                    val text = process.inputStream.bufferedReader().readText()
                    val exited = process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS)
                    if (!exited) { process.destroy(); text + "\n[stopped after 30 seconds]" } else text
                }.getOrElse { "Error: ${it.message}" }
            }
            output.trimEnd().lines().takeLast(2000).forEach { lines += false to it }
            running = false
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Column { Text("Terminal"); Text(cwd, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis) } },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = {
                    if (rooted) Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Root", style = MaterialTheme.typography.labelLarge)
                        Switch(checked = useRoot, onCheckedChange = { useRoot = it })
                        Spacer(Modifier.width(8.dp))
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().background(Color(0xFF0B1020))) {
            LazyColumn(state = listState, modifier = Modifier.weight(1f).fillMaxWidth().padding(8.dp)) {
                items(lines) { (isCmd, text) ->
                    Text(text, style = MonoStyle, color = if (isCmd) Color(0xFF5EEAD4) else Color(0xFFE5E7EB))
                }
            }
            if (running) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (history.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp)) {
                history.takeLast(8).reversed().forEach { h -> TextButton(onClick = { input = h }) { Text(h, color = Color(0xFF93C5FD), maxLines = 1) } }
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(8.dp)) {
                OutlinedTextField(input, { input = it }, modifier = Modifier.weight(1f), singleLine = true, textStyle = MonoStyle.copy(color = Color.White),
                    placeholder = { Text("Command", color = Color.Gray) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { run(input) }))
                TextButton(onClick = { run(input) }, enabled = !running) { Text("Run") }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------

@Composable
fun TextSearchScreen(rootPath: String, onBack: () -> Unit, onOpenFile: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var replacement by remember { mutableStateOf("") }
    var regex by remember { mutableStateOf(false) }
    var matchCase by remember { mutableStateOf(false) }
    var wholeWord by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<FileToolsLogic.Match>?>(null) }
    var scanned by remember { mutableIntStateOf(0) }
    var running by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun pattern() = runCatching { FileToolsLogic.pattern(query, regex, !matchCase, wholeWord) }.getOrNull()
    fun search() {
        val p = pattern() ?: run { info = "Invalid regular expression."; return }
        running = true; results = null; info = null
        scope.launch {
            results = withContext(Dispatchers.IO) { FileToolsLogic.searchPattern(File(rootPath), p) { scanned = it } }
            running = false
        }
    }
    ToolScaffold("Find & replace in files", rootPath.substringAfterLast('/'), onBack) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(query, { query = it }, label = { Text("Find") }, singleLine = true, modifier = Modifier.weight(1f), textStyle = MonoStyle,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { if (query.isNotBlank()) search() }))
                TextButton(enabled = query.isNotBlank() && !running, onClick = ::search) { Text("Search") }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(replacement, { replacement = it }, label = { Text(if (regex) "Replace with ($1 = group)" else "Replace with") }, singleLine = true,
                    modifier = Modifier.weight(1f), textStyle = MonoStyle)
                TextButton(enabled = !results.isNullOrEmpty() && !running, onClick = { confirm = true }) { Text("Replace all") }
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = matchCase, onClick = { matchCase = !matchCase }, label = { Text("Match case") })
                FilterChip(selected = wholeWord, onClick = { wholeWord = !wholeWord }, label = { Text("Whole word") })
                FilterChip(selected = regex, onClick = { regex = !regex }, label = { Text("Regex") })
            }
            if (running) { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("$scanned files checked", style = MaterialTheme.typography.bodySmall) }
            info?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary) }
            results?.let { r ->
                val files = r.map { it.path }.distinct().size
                Text("${r.size} matches in $files files", style = MaterialTheme.typography.bodySmall)
                if (r.isEmpty()) EmptyState(Icons.Rounded.SearchOff, "No matches", "No text files here contain that text.")
                LazyColumn {
                    items(r) { m ->
                        Column(Modifier.fillMaxWidth().clickable { onOpenFile(m.path) }.padding(vertical = 8.dp)) {
                            Text("${m.path.removePrefix(rootPath).trimStart('/')}:${m.line}", style = MaterialTheme.typography.titleSmall)
                            Text(m.text, style = MonoStyle, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Replace in all files?") },
            text = { Text("Every match in ${results?.map { it.path }?.distinct()?.size ?: 0} files will be replaced and saved. Close these files in Code Studio first if they are open.") },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    val p = pattern() ?: return@TextButton
                    running = true
                    scope.launch {
                        val (files, n) = withContext(Dispatchers.IO) { FileToolsLogic.replaceInFiles(File(rootPath), p, if (regex) replacement else Regex.escapeReplacement(replacement)) }
                        running = false
                        info = "Replaced $n matches in $files files."
                        results = null
                    }
                }) { Text("Replace all", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } },
        )
    }
}

// ---------------------------------------------------------------------------------------------

@Composable
fun FontPreviewScreen(path: String, onBack: () -> Unit) {
    val family = remember(path) { runCatching { FontFamily(Typeface.createFromFile(path)) }.getOrNull() }
    var sample by remember { mutableStateOf("The quick brown fox jumps over the lazy dog 0123456789") }
    ToolScaffold("Font preview", File(path).name, onBack) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (family == null) item { Text("This font file can't be read.", color = MaterialTheme.colorScheme.error) }
            else {
                item { OutlinedTextField(sample, { sample = it }, label = { Text("Sample text") }, modifier = Modifier.fillMaxWidth()) }
                items(listOf(12, 16, 20, 28, 40, 56)) { size -> Text(sample, fontFamily = family, fontSize = size.sp) }
                item { Text("ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n!@#\$%^&*()[]{}<>?/", fontFamily = family, fontSize = 22.sp) }
            }
        }
    }
}

@Composable
private fun Modifier.verticalScrollCompat(): Modifier = this.then(Modifier.verticalScroll(rememberScrollState()))

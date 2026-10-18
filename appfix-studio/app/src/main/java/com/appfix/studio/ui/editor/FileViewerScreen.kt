@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.editor

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.WrapText
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.appfix.core.apk.AxmlParser
import com.appfix.core.apk.BinaryFormatException
import com.appfix.core.apk.ResourceTable
import com.appfix.core.util.Hashing
import com.appfix.core.util.PathSafety
import com.appfix.core.util.formatBytes
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.CodeBlock
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.theme.CodeTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.zip.ZipFile

sealed interface ViewerContent {
    data class Text(val text: String, val note: String? = null) : ViewerContent
    data class Picture(val bitmap: ImageBitmap, val size: Long) : ViewerContent
    data class Binary(val size: Long, val sha256: String, val hex: String) : ViewerContent
    data class Failure(val message: String) : ViewerContent
}

private const val MAX_VIEW_BYTES = 8L * 1024 * 1024

/** Loads a workspace file (source projects) or an entry of the original APK (APK projects). */
suspend fun loadViewerContent(container: com.appfix.studio.AppContainer, projectId: String, path: String): ViewerContent = withContext(Dispatchers.IO) {
    try {
        val project = container.projects.get(projectId) ?: return@withContext ViewerContent.Failure("Project not found")
        val bytes: ByteArray = if (project.kind == ProjectKind.APK) {
            val apk = container.storage.originalApk(projectId) ?: return@withContext ViewerContent.Failure("Original APK is missing")
            ZipFile(apk).use { z ->
                val e = z.getEntry(path) ?: return@withContext ViewerContent.Failure("Entry not found in APK")
                if (e.size > MAX_VIEW_BYTES) return@withContext ViewerContent.Failure("This entry is ${formatBytes(e.size)}; files over ${formatBytes(MAX_VIEW_BYTES)} are not previewed.")
                z.getInputStream(e).use { it.readBytes() }
            }
        } else {
            val f = PathSafety.resolveInside(container.storage.workspace(projectId), path) ?: return@withContext ViewerContent.Failure("Invalid path")
            if (!f.isFile) return@withContext ViewerContent.Failure("File not found")
            if (f.length() > MAX_VIEW_BYTES) return@withContext ViewerContent.Failure("This file is ${formatBytes(f.length())}; files over ${formatBytes(MAX_VIEW_BYTES)} are not previewed.")
            f.readBytes()
        }
        val ext = path.substringAfterLast('.', "").lowercase()
        when {
            path == "resources.arsc" -> {
                val t = ResourceTable.parse(bytes)
                val text = t.namesByType().entries.sortedBy { it.key }.joinToString("\n\n") { (type, names) ->
                    "[$type] ${names.size}\n" + names.take(200).joinToString("\n") { "  @$type/$it" } + if (names.size > 200) "\n  …" else ""
                }
                ViewerContent.Text(text, "Decoded resource table (names only)")
            }
            AxmlParser.isBinaryXml(bytes) -> ViewerContent.Text(AxmlParser.parse(bytes).toXmlString(), "Decoded from compiled binary XML. References are shown as resource IDs.")
            ext in setOf("png", "jpg", "jpeg", "webp", "gif", "bmp") -> {
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp != null) ViewerContent.Picture(bmp.asImageBitmap(), bytes.size.toLong()) else binary(bytes)
            }
            bytes.take(8000).none { it == 0.toByte() } -> ViewerContent.Text(bytes.decodeToString())
            else -> binary(bytes)
        }
    } catch (e: BinaryFormatException) {
        ViewerContent.Failure("Could not decode this file: ${e.message}")
    } catch (e: Exception) {
        ViewerContent.Failure(e.message ?: e.javaClass.simpleName)
    }
}

private fun binary(bytes: ByteArray): ViewerContent.Binary {
    val hex = bytes.take(256).chunked(16).joinToString("\n") { row -> row.joinToString(" ") { "%02x".format(it) } }
    return ViewerContent.Binary(bytes.size.toLong(), Hashing.sha256(bytes), hex)
}

@Composable
fun FileViewerScreen(projectId: String, path: String, line: Int?, onBack: () -> Unit) {
    val container = appContainer()
    val content by produceState<ViewerContent?>(null, projectId, path) { value = loadViewerContent(container, projectId, path) }
    var wrap by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(path.substringAfterLast('/'), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(path, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
                actions = {
                    if (content is ViewerContent.Text) {
                        IconButton(onClick = { wrap = !wrap }) { Icon(Icons.AutoMirrored.Outlined.WrapText, contentDescription = if (wrap) "Disable line wrap" else "Wrap lines") }
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val c = content) {
                null -> Text("Loading…", Modifier.padding(16.dp))
                is ViewerContent.Failure -> ErrorCard(c.message, Modifier.padding(16.dp))
                is ViewerContent.Picture -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Image(c.bitmap, contentDescription = path.substringAfterLast('/'), modifier = Modifier.sizeIn(maxWidth = 320.dp, maxHeight = 320.dp).background(MaterialTheme.colorScheme.surfaceContainer))
                    Text("${c.bitmap.width} × ${c.bitmap.height} px · ${formatBytes(c.size)}", style = MaterialTheme.typography.bodyMedium)
                }
                is ViewerContent.Binary -> Column(Modifier.padding(16.dp)) {
                    SectionCard("Binary file") {
                        InfoRow("Size", formatBytes(c.size))
                        InfoRow("SHA-256", c.sha256, mono = true)
                        Spacer(Modifier.width(8.dp))
                        CodeBlock(c.hex)
                    }
                }
                is ViewerContent.Text -> TextLines(c, line, wrap)
            }
        }
    }
}

@Composable
private fun TextLines(c: ViewerContent.Text, targetLine: Int?, wrap: Boolean) {
    val lines = androidx.compose.runtime.remember(c.text) { c.text.split("\n") }
    val state = rememberLazyListState()
    LaunchedEffect(targetLine, lines.size) {
        if (targetLine != null && targetLine in 1..lines.size) state.scrollToItem((targetLine - 3).coerceAtLeast(0))
    }
    val gutter = lines.size.toString().length
    val longest = androidx.compose.runtime.remember(lines) { lines.maxOfOrNull { it.length } ?: 0 }
    val contentWidth = ((longest + gutter + 3) * 7.4f + 32f).coerceIn(360f, 12_000f).dp
    val highlight = MaterialTheme.colorScheme.primaryContainer
    Column(Modifier.fillMaxSize()) {
        c.note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) }
        Box(Modifier.fillMaxSize().then(if (wrap) Modifier else Modifier.horizontalScroll(rememberScrollState()))) {
            LazyColumn(state = state, modifier = if (wrap) Modifier.fillMaxSize() else Modifier.width(contentWidth)) {
                itemsIndexed(lines) { i, text ->
                    Row(Modifier.fillMaxWidth().then(if (targetLine == i + 1) Modifier.background(highlight) else Modifier).padding(horizontal = 8.dp)) {
                        Text((i + 1).toString().padStart(gutter), style = CodeTextStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(10.dp))
                        Text(text, style = CodeTextStyle, softWrap = wrap)
                    }
                }
            }
        }
    }
}

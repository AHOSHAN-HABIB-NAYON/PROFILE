package com.filepilot.app.ui.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FormatListNumbered
import androidx.compose.material.icons.automirrored.rounded.WrapText
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.util.Format
import com.filepilot.app.data.files.userMessage
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.ErrorState
import com.filepilot.app.ui.components.LoadingState
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.theme.MonoStyle
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private sealed interface TextLoad {
    data object Loading : TextLoad
    data class Ready(val lines: List<String>, val longest: Int, val truncated: Boolean) : TextLoad
    data object Binary : TextLoad
    data class Failed(val message: String) : TextLoad
}

@Composable
fun TextViewerScreen(item: FileItem) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    var load by remember { mutableStateOf<TextLoad>(TextLoad.Loading) }
    var wrap by rememberSaveable { mutableStateOf(true) }
    var numbers by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(item.uri) {
        load = withContext(Dispatchers.IO) {
            try {
                val bytes = container.files.openInput(item).use { input ->
                    val limit = com.filepilot.app.core.model.MAX_TEXT_PREVIEW_BYTES.toInt()
                    val buf = java.io.ByteArrayOutputStream(minOf(limit, item.size.coerceAtLeast(16_384L).toInt()))
                    val chunk = ByteArray(64 * 1024)
                    while (buf.size() < limit) {
                        val r = input.read(chunk)
                        if (r < 0) break
                        buf.write(chunk, 0, minOf(r, limit - buf.size()))
                    }
                    buf.toByteArray()
                }
                val truncated = item.size > bytes.size || bytes.size >= com.filepilot.app.core.model.MAX_TEXT_PREVIEW_BYTES
                val head = bytes.take(8192)
                if (head.any { it == 0.toByte() }) {
                    TextLoad.Binary
                } else {
                    val decoder = Charsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPLACE)
                        .onUnmappableCharacter(CodingErrorAction.REPLACE)
                    val text = decoder.decode(ByteBuffer.wrap(bytes)).toString().removePrefix(BYTE_ORDER_MARK)
                    val lines = text.replace("\r\n", "\n").split('\n')
                    TextLoad.Ready(lines, lines.maxOfOrNull { it.length } ?: 0, truncated)
                }
            } catch (e: Exception) {
                TextLoad.Failed(e.userMessage())
            }
        }
    }

    val ready = load as? TextLoad.Ready
    Scaffold(
        topBar = {
            PreviewTopBar(
                item,
                subtitle = ready?.let { "${it.lines.size} lines · ${Format.size(item.size)}" },
                extraMenu = { close ->
                    DropdownMenuItem(
                        text = { Text(if (wrap) "Don't wrap lines" else "Wrap lines") },
                        leadingIcon = { Icon(Icons.AutoMirrored.Rounded.WrapText, null) },
                        onClick = {
                            wrap = !wrap
                            close()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(if (numbers) "Hide line numbers" else "Show line numbers") },
                        leadingIcon = { Icon(Icons.Rounded.FormatListNumbered, null) },
                        onClick = {
                            numbers = !numbers
                            close()
                        },
                    )
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val l = load) {
                TextLoad.Loading -> LoadingState()
                TextLoad.Binary -> EmptyState(
                    Icons.Rounded.Description, "Not a text file",
                    "This file contains binary data and can't be shown as text.",
                    actionLabel = "Open in another app", onAction = { navigator.openExternal(item, chooser = true) },
                )
                is TextLoad.Failed -> ErrorState(l.message, onRetry = null, extraLabel = "Open in another app", onExtra = { navigator.openExternal(item, chooser = true) })
                is TextLoad.Ready -> androidx.compose.foundation.layout.Column {
                    if (l.truncated) {
                        androidx.compose.material3.Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
                            androidx.compose.foundation.layout.Row(
                                Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                            ) {
                                Text(
                                    "Large file: showing the first ${Format.size(com.filepilot.app.core.model.MAX_TEXT_PREVIEW_BYTES)} of ${Format.size(item.size)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                                    modifier = Modifier.weight(1f),
                                )
                                androidx.compose.material3.TextButton(onClick = { navigator.openExternal(item, chooser = true) }) { Text("Open full") }
                            }
                        }
                    }
                    TextBody(l, wrap, numbers)
                }
            }
        }
    }
}

@Composable
private fun TextBody(text: TextLoad.Ready, wrap: Boolean, numbers: Boolean) {
    val gutterChars = text.lines.size.toString().length
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val charWidthPx = remember(measurer) { measurer.measure("M", MonoStyle).size.width.coerceAtLeast(1) }
    val content = @Composable { modifier: Modifier ->
        LazyColumn(modifier, contentPadding = PaddingValues(vertical = 8.dp)) {
            itemsIndexed(text.lines) { i, line ->
                Row(Modifier.fillMaxWidth()) {
                    if (numbers) {
                        Text(
                            (i + 1).toString().padStart(gutterChars),
                            style = MonoStyle,
                            color = MaterialTheme.colorScheme.outline,
                            textAlign = TextAlign.End,
                            modifier = Modifier
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .padding(start = 8.dp, end = 8.dp),
                        )
                    }
                    Text(
                        line.ifEmpty { " " },
                        style = MonoStyle,
                        softWrap = wrap,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(horizontal = 12.dp),
                    )
                }
            }
        }
    }
    if (wrap) {
        content(Modifier.fillMaxSize())
    } else {
        // Fixed-width list inside one horizontal scroller, so all lines scroll together.
        val widthPx = ((text.longest + gutterChars + 6) * charWidthPx).coerceAtMost(60_000)
        val width = with(density) { widthPx.toDp() }
        Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
            content(Modifier.width(width).fillMaxHeight())
        }
    }
}

/** UTF-8 files sometimes start with a byte-order mark; it is not part of the text. */
private const val BYTE_ORDER_MARK = "\uFEFF"

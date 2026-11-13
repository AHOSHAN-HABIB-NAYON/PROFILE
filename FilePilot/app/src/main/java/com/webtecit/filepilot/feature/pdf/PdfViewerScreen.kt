@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.pdf

import android.graphics.Bitmap
import android.graphics.Color as AColor
import android.graphics.pdf.PdfRenderer
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.EmptyState
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

@HiltViewModel
class PdfViewModel @Inject constructor(val tools: PdfTools, val fileSystems: FileSystems) : ViewModel()

/** Shows a PDF page by page; pages are rendered when they scroll into view. */
@Composable
fun PdfViewerScreen(fileId: String, onBack: () -> Unit, viewModel: PdfViewModel = hiltViewModel()) {
    var renderer by remember { mutableStateOf<PdfRenderer?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf(false) }
    val name = remember(fileId) { runCatching { viewModel.fileSystems.of(fileId).nameOf(fileId) }.getOrDefault("PDF") }
    val mutex = remember { Mutex() }
    LaunchedEffect(fileId) {
        withContext(Dispatchers.IO) {
            runCatching { viewModel.tools.renderer(fileId) }.onSuccess { renderer = it }.onFailure { error = it.userMessage() }
        }
    }
    DisposableEffect(Unit) { onDispose { runCatching { renderer?.close() } } }
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val listState = rememberLazyListState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(name, maxLines = 1)
                        renderer?.let { r ->
                            Text("Page ${listState.firstVisibleItemIndex + 1} of ${r.pageCount}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { IconButton(onClick = { info = true }) { Icon(Icons.Rounded.Info, "Document information") } },
            )
        },
    ) { padding ->
        val r = renderer
        when {
            error != null -> EmptyState(Icons.Rounded.PictureAsPdf, "Can't show this PDF", error!!, modifier = Modifier.padding(padding))
            r == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else -> BoxWithConstraints(
                Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.surfaceContainer)
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, 5f)
                            offset = if (scale == 1f) Offset.Zero else offset + pan
                        }
                    },
            ) {
                val widthPx = with(LocalDensity.current) { maxWidth.roundToPx() }
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize().graphicsLayer {
                        scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y
                    },
                ) {
                    items(r.pageCount) { index ->
                        var bitmap by remember(index) { mutableStateOf<Bitmap?>(null) }
                        var ratio by remember(index) { mutableFloatStateOf(1.414f) }
                        LaunchedEffect(index, widthPx) {
                            bitmap = withContext(Dispatchers.IO) {
                                mutex.withLock {
                                    runCatching {
                                        r.openPage(index).use { p ->
                                            ratio = p.height.toFloat() / p.width
                                            val w = (widthPx * 1.5f).toInt().coerceAtMost(2400)
                                            Bitmap.createBitmap(w, (w * ratio).toInt(), Bitmap.Config.ARGB_8888).also { b ->
                                                b.eraseColor(AColor.WHITE)
                                                p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                            }
                                        }
                                    }.getOrNull()
                                }
                            }
                        }
                        Box(Modifier.fillMaxWidth().aspectRatio(1f / ratio).background(Color.White), contentAlignment = Alignment.Center) {
                            bitmap?.let { Image(it.asImageBitmap(), contentDescription = "Page ${index + 1}", modifier = Modifier.fillMaxSize()) }
                                ?: CircularProgressIndicator()
                        }
                    }
                }
            }
        }
    }
    if (info) {
        val item = remember(fileId) { kotlinx.coroutines.runBlocking { runCatching { viewModel.fileSystems.of(fileId).stat(fileId) }.getOrNull() } }
        AlertDialog(
            onDismissRequest = { info = false },
            title = { Text("Document information") },
            text = {
                Column {
                    Text("Name: $name")
                    item?.let { Text("Size: ${Formatters.size(it.size)}"); Text("Modified: ${Formatters.date(it.lastModified)}") }
                    renderer?.let { rr ->
                        Text("Pages: ${rr.pageCount}")
                        runCatching { rr.openPage(0).use { p -> Text("Page size: ${p.width} × ${p.height} pt (${"%.1f".format(p.width / 72f * 2.54f)} × ${"%.1f".format(p.height / 72f * 2.54f)} cm)") } }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { info = false }) { Text("Close") } },
        )
    }
}

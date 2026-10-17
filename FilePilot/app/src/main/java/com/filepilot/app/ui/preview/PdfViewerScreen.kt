package com.filepilot.app.ui.preview

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.ui.components.EmptyState
import com.filepilot.app.ui.components.ErrorState
import com.filepilot.app.ui.components.LoadingState
import com.filepilot.app.ui.navigation.LocalNavigator
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Thin wrapper around Android's built-in PdfRenderer. Rendering is serialized; the renderer isn't thread-safe. */
private class PdfDocument(private val pfd: ParcelFileDescriptor) {
    private val renderer = PdfRenderer(pfd)
    private val mutex = Mutex()
    val pageCount: Int = renderer.pageCount
    val aspect: List<Float> = (0 until pageCount).map { i ->
        renderer.openPage(i).use { p -> if (p.height > 0) p.width.toFloat() / p.height else 0.707f }
    }

    suspend fun render(index: Int, widthPx: Int): ImageBitmap? = mutex.withLock {
        withContext(Dispatchers.IO) {
            runCatching {
                renderer.openPage(index).use { page ->
                    val w = widthPx.coerceIn(200, 2400)
                    val h = (w.toFloat() * page.height / page.width).toInt().coerceAtLeast(1)
                    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(android.graphics.Color.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp.asImageBitmap()
                }
            }.getOrNull()
        }
    }

    fun close() {
        runCatching { renderer.close() }
        runCatching { pfd.close() }
    }
}

private sealed interface PdfLoad {
    data object Loading : PdfLoad
    data class Ready(val doc: PdfDocument) : PdfLoad
    data object Protected : PdfLoad
    data class Failed(val message: String) : PdfLoad
}

@Composable
fun PdfViewerScreen(item: FileItem) {
    val context = LocalContext.current
    val navigator = LocalNavigator.current
    var load by remember { mutableStateOf<PdfLoad>(PdfLoad.Loading) }

    LaunchedEffect(item.uri) {
        load = withContext(Dispatchers.IO) {
            try {
                val pfd = if (item.source == SourceKind.LOCAL && item.path != null) {
                    ParcelFileDescriptor.open(File(item.path), ParcelFileDescriptor.MODE_READ_ONLY)
                } else {
                    context.contentResolver.openFileDescriptor(item.uri, "r")
                } ?: return@withContext PdfLoad.Failed("The PDF can't be opened")
                try {
                    PdfLoad.Ready(PdfDocument(pfd))
                } catch (e: SecurityException) {
                    pfd.close()
                    PdfLoad.Protected
                }
            } catch (e: Exception) {
                PdfLoad.Failed("This PDF is damaged or uses features the built-in viewer doesn't support.")
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose { (load as? PdfLoad.Ready)?.doc?.close() }
    }

    val ready = load as? PdfLoad.Ready
    val listState = rememberLazyListState()
    val page by remember { derivedStateOf { listState.firstVisibleItemIndex + 1 } }

    Scaffold(
        topBar = {
            PreviewTopBar(item, subtitle = ready?.let { "Page $page of ${it.doc.pageCount}" })
        },
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val l = load) {
                PdfLoad.Loading -> LoadingState()
                PdfLoad.Protected -> EmptyState(
                    Icons.Rounded.Lock, "Password-protected PDF",
                    "The built-in viewer can't open protected PDFs. Open it in another app to enter the password.",
                    actionLabel = "Open in another app", onAction = { navigator.openExternal(item, chooser = true) },
                )
                is PdfLoad.Failed -> ErrorState(l.message, onRetry = null, extraLabel = "Open in another app", onExtra = { navigator.openExternal(item, chooser = true) })
                is PdfLoad.Ready -> PdfPages(l.doc, listState)
            }
        }
    }
}

@Composable
private fun PdfPages(doc: PdfDocument, listState: androidx.compose.foundation.lazy.LazyListState) {
    var scale by remember { mutableFloatStateOf(1f) }
    var panX by remember { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                // Two-finger pinch zooms; one finger keeps scrolling the page list.
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val fingers = event.changes.count { it.pressed }
                        if (fingers > 1) {
                            scale = (scale * event.calculateZoom()).coerceIn(1f, 4f)
                            val maxPan = size.width * (scale - 1f) / 2f
                            panX = (panX + event.calculatePan().x).coerceIn(-maxPan, maxPan)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        } else if (scale > 1f) {
                            val maxPan = size.width * (scale - 1f) / 2f
                            panX = (panX + event.calculatePan().x).coerceIn(-maxPan, maxPan)
                        }
                    } while (event.changes.any { it.pressed })
                }
            },
    ) {
        val widthPx = with(density) { maxWidth.roundToPx() }
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize().graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = panX
            },
        ) {
            items(doc.pageCount) { index ->
                var bitmap by remember(index) { mutableStateOf<ImageBitmap?>(null) }
                LaunchedEffect(index, widthPx) { bitmap = doc.render(index, (widthPx * 1.5f).toInt()) }
                Surface(
                    modifier = Modifier.fillMaxWidth().aspectRatio(doc.aspect[index].coerceIn(0.2f, 5f)).shadow(2.dp),
                    color = Color.White,
                ) {
                    val b = bitmap
                    if (b != null) {
                        Image(b, contentDescription = "Page ${index + 1}", contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxSize())
                    } else {
                        Box(Modifier.fillMaxSize().background(Color.White), contentAlignment = Alignment.Center) {
                            Text("${index + 1}", color = Color.LightGray, style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }
            }
        }
    }
}

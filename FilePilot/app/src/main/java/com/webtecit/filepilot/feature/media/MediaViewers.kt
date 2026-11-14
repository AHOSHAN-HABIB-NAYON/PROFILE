@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.media

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.testTag
import kotlinx.coroutines.launch
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import coil3.compose.AsyncImage
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.storage.FileIntents
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import java.io.File

@dagger.hilt.android.lifecycle.HiltViewModel
class ImageViewerViewModel @javax.inject.Inject constructor(
    private val recycleBin: com.webtecit.filepilot.core.cleaning.RecycleBin,
) : androidx.lifecycle.ViewModel() {
    /** Moves a photo to the Recycle Bin (or deletes it when the bin can't take it). Returns true when it is gone. */
    suspend fun delete(file: File, onUndone: () -> Unit): Boolean {
        val item = com.webtecit.filepilot.core.storage.FileItem(file.absolutePath, file.name, false, file.length(), file.lastModified(), FileTypes.mimeOf(file.name))
        return if (recycleBin.supports(item)) {
            runCatching {
                val entries = recycleBin.trashEntries(listOf(item))
                com.webtecit.filepilot.core.designsystem.Feedback.deleted("Moved to Recycle Bin", file.name, undo = {
                    recycleBin.undo(entries)
                    onUndone()
                })
            }.isSuccess
        } else {
            val ok = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { file.delete() }
            if (ok) com.webtecit.filepilot.core.designsystem.Feedback.deletedPermanently("Deleted permanently", file.name)
            ok
        }
    }
}

/** Full-screen photos: swipe left and right through the folder, pinch or double-tap to zoom, thumbnails, details. */
@Composable
fun ImageViewerScreen(path: String, onBack: () -> Unit, viewModel: ImageViewerViewModel = androidx.hilt.navigation.compose.hiltViewModel()) {
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var reload by remember { mutableStateOf(0) }
    val images = remember(path, reload) {
        val f = File(path)
        f.parentFile?.listFiles().orEmpty().filter { it.isFile && FileTypes.kindOf(it.name, false) == FileKind.IMAGE && !it.name.startsWith(".") }
            .sortedBy { it.name.lowercase() }.ifEmpty { if (f.exists()) listOf(f) else emptyList() }
    }
    if (images.isEmpty()) {
        androidx.compose.runtime.LaunchedEffect(Unit) { onBack() }
        return
    }
    val start = remember(path) { images.indexOfFirst { it.absolutePath == path }.coerceAtLeast(0) }
    val pager = rememberPagerState(initialPage = start) { images.size }
    var chrome by remember { mutableStateOf(true) }
    var info by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val current = images[pager.currentPage.coerceIn(0, images.lastIndex)]
    val strip = androidx.compose.foundation.lazy.rememberLazyListState()
    androidx.compose.runtime.LaunchedEffect(pager.currentPage) {
        strip.animateScrollToItem((pager.currentPage - 3).coerceAtLeast(0))
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = pager, beyondViewportPageCount = 1, modifier = Modifier.fillMaxSize().testTag("image_pager")) { i ->
            ZoomableImage(images[i]) { chrome = !chrome }
        }
        AnimatedVisibility(chrome, enter = fadeIn(), exit = fadeOut()) {
            Row(
                Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).statusBarsPadding().padding(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Color.White) }
                Column(Modifier.weight(1f)) {
                    Text(current.name, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${pager.currentPage + 1} of ${images.size} · ${Formatters.size(current.length())}", color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick = { info = true }) { Icon(Icons.Rounded.Info, "Photo details", tint = Color.White) }
            }
        }
        AnimatedVisibility(chrome, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.align(Alignment.BottomCenter)) {
            Column(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).navigationBarsPadding().padding(vertical = 8.dp)) {
                if (images.size > 1) {
                    androidx.compose.foundation.lazy.LazyRow(
                        state = strip,
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp),
                    ) {
                        items(images.size, key = { images[it].absolutePath }) { i ->
                            val selected = i == pager.currentPage
                            AsyncImage(
                                model = images[i], contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.size(48.dp)
                                    .border(if (selected) 2.dp else 0.dp, if (selected) Color.White else Color.Transparent, androidx.compose.foundation.shape.RoundedCornerShape(10.dp))
                                    .padding(if (selected) 2.dp else 0.dp)
                                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                    .graphicsLayer { alpha = if (selected) 1f else 0.6f }
                                    .clickable { scope.launch { pager.animateScrollToPage(i) } },
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceEvenly) {
                    ViewerAction(Icons.Rounded.Share, "Share") {
                        FileIntents.share(context, listOf(FileProvider.getUriForFile(context, "${context.packageName}.files", current)), listOf(FileTypes.mimeOf(current.name)))
                    }
                    ViewerAction(Icons.AutoMirrored.Rounded.OpenInNew, "Open with") {
                        runCatching {
                            FileIntents.open(context, FileProvider.getUriForFile(context, "${context.packageName}.files", current), FileTypes.mimeOf(current.name), forceChooser = true)
                        }
                    }
                    ViewerAction(Icons.Rounded.Info, "Details") { info = true }
                    ViewerAction(Icons.Rounded.Delete, "Delete", tint = Color(0xFFFF8A9A)) { confirmDelete = true }
                }
            }
        }
    }
    if (confirmDelete) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete \"${current.name}\"?") },
            text = { Text("The photo goes to the Recycle Bin when it can, so you can undo.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirmDelete = false
                    val target = current
                    scope.launch { if (viewModel.delete(target) { reload++ }) reload++ }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
    if (info) {
        ModalBottomSheet(onDismissRequest = { info = false }) {
            val rows = remember(current) { exifRows(current) }
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 8.dp)) {
                Text(current.name, style = MaterialTheme.typography.titleMedium)
                rows.forEach { (k, v) ->
                    Row(Modifier.padding(vertical = 6.dp)) {
                        Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(130.dp))
                        Text(v)
                    }
                }
                if (rows.size <= 3) Text("This photo has no camera details (EXIF).", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 12.dp))
            }
        }
    }
}

@Composable
private fun ViewerAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color = Color.White, onClick: () -> Unit) {
    Column(
        Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = tint)
        Spacer(Modifier.height(2.dp))
        Text(label, color = tint, style = MaterialTheme.typography.labelSmall)
    }
}

private fun exifRows(file: File): List<Pair<String, String>> {
    val out = ArrayList<Pair<String, String>>()
    out += "Size" to Formatters.size(file.length())
    out += "Modified" to Formatters.date(file.lastModified())
    runCatching {
        val e = ExifInterface(file)
        val w = e.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0)
        val h = e.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0)
        if (w > 0) out += "Dimensions" to "$w × $h"
        fun add(label: String, tag: String, fmt: (String) -> String = { it }) { e.getAttribute(tag)?.takeIf { it.isNotBlank() }?.let { out += label to fmt(it) } }
        add("Camera", ExifInterface.TAG_MAKE)
        add("Model", ExifInterface.TAG_MODEL)
        add("Taken", ExifInterface.TAG_DATETIME_ORIGINAL)
        add("Aperture", ExifInterface.TAG_F_NUMBER) { "f/$it" }
        add("Exposure", ExifInterface.TAG_EXPOSURE_TIME) { v -> v.toDoubleOrNull()?.let { if (it < 1) "1/${(1 / it).toInt()} s" else "$it s" } ?: v }
        add("ISO", ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY)
        add("Focal length", ExifInterface.TAG_FOCAL_LENGTH) { v -> v.split('/').let { p -> if (p.size == 2) "${(p[0].toDouble() / p[1].toDouble()).toInt()} mm" else v } }
        add("Flash", ExifInterface.TAG_FLASH) { if ((it.toIntOrNull() ?: 0) and 1 == 1) "Fired" else "Off" }
        add("Software", ExifInterface.TAG_SOFTWARE)
        e.latLong?.let { (lat, lon) -> out += "Location" to "%.5f, %.5f".format(lat, lon) }
    }
    return out
}

@Composable
private fun ZoomableImage(file: File, onTap: () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Box(
        Modifier.fillMaxSize()
            .pointerInput(file) {
                detectTapGestures(
                    onTap = { onTap() },
                    onDoubleTap = { if (scale > 1f) { scale = 1f; offset = Offset.Zero } else scale = 2.5f },
                )
            }
            .pointerInput(file) {
                // Pinch and pan only while zoomed or with two fingers, so a one-finger swipe still
                // moves to the next photo.
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val fingers = event.changes.count { it.pressed }
                        if (fingers > 1 || scale > 1f) {
                            val zoom = event.calculateZoom()
                            val pan = event.calculatePan()
                            scale = (scale * zoom).coerceIn(1f, 6f)
                            offset = if (scale == 1f) Offset.Zero else offset + pan
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = file,
            contentDescription = file.name,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize().graphicsLayer {
                scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y
            },
        )
    }
}

/** Plays a video or audio file with standard controls. */

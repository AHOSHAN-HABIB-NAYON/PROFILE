@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.media

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

/** Full-screen photos: swipe between images in the folder, pinch or double-tap to zoom, EXIF details. */
@Composable
fun ImageViewerScreen(path: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val images = remember(path) {
        val f = File(path)
        f.parentFile?.listFiles().orEmpty().filter { it.isFile && FileTypes.kindOf(it.name, false) == FileKind.IMAGE && !it.name.startsWith(".") }
            .sortedBy { it.name.lowercase() }.ifEmpty { listOf(f) }
    }
    val pager = rememberPagerState(initialPage = images.indexOfFirst { it.absolutePath == path }.coerceAtLeast(0)) { images.size }
    var chrome by remember { mutableStateOf(true) }
    var info by remember { mutableStateOf(false) }
    val current = images[pager.currentPage.coerceIn(0, images.lastIndex)]
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { i -> ZoomableImage(images[i]) { chrome = !chrome } }
        AnimatedVisibility(chrome) {
            Row(
                Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).statusBarsPadding().padding(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Color.White) }
                Column(Modifier.weight(1f)) {
                    Text(current.name, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${pager.currentPage + 1} of ${images.size} · ${Formatters.size(current.length())}", color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick = {
                    FileIntents.share(context, listOf(FileProvider.getUriForFile(context, "${context.packageName}.files", current)), listOf(FileTypes.mimeOf(current.name)))
                }) { Icon(Icons.Rounded.Share, "Share", tint = Color.White) }
                IconButton(onClick = { info = true }) { Icon(Icons.Rounded.Info, "Photo details", tint = Color.White) }
            }
        }
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
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 6f)
                    offset = if (scale == 1f) Offset.Zero else offset + pan
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
@Composable
fun VideoPlayerScreen(path: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val video = remember { VideoView(context) }
    DisposableEffect(path) {
        val controller = MediaController(context).apply { setAnchorView(video) }
        video.setMediaController(controller)
        video.setVideoPath(path)
        video.setOnPreparedListener { it.isLooping = false; video.start() }
        onDispose { video.stopPlayback() }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { video }, modifier = Modifier.fillMaxSize().align(Alignment.Center))
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Color.White) }
            Text(File(path).name, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

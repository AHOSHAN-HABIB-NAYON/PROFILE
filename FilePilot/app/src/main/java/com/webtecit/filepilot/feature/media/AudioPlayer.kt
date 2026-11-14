@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.media

import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** Plays one audio file with MediaPlayer and exposes its state to Compose. */
class AudioHandle {
    var playing by mutableStateOf(false)
        private set
    var position by mutableLongStateOf(0L)
    var duration by mutableLongStateOf(0L)
        internal set
    var error by mutableStateOf<String?>(null)
        internal set
    var speed by mutableFloatStateOf(1f)
        private set
    var looping by mutableStateOf(false)
        private set
    internal var player: MediaPlayer? = null
    internal var prepared = false

    fun toggle() {
        val p = player ?: return
        if (!prepared) return
        runCatching {
            if (p.isPlaying) { p.pause(); playing = false } else { p.start(); applySpeed(p); playing = true }
        }
    }

    fun pause() {
        runCatching { player?.takeIf { it.isPlaying }?.pause() }
        playing = false
    }

    internal fun started() { playing = true }
    internal fun stopped() { playing = false }

    fun seekTo(ms: Long) {
        val target = ms.coerceIn(0L, duration.coerceAtLeast(0L))
        runCatching { if (prepared) player?.seekTo(target.toInt()) }
        position = target
    }

    fun skip(ms: Long) = seekTo(position + ms)

    fun setPlaybackSpeed(value: Float) {
        speed = value
        player?.let { p -> runCatching { if (p.isPlaying) applySpeed(p) } }
    }

    fun setLoop(value: Boolean) {
        looping = value
        runCatching { player?.isLooping = value }
    }

    internal fun applySpeed(p: MediaPlayer) {
        runCatching { p.playbackParams = p.playbackParams.setSpeed(speed) }
    }
}

/** A player for [file]; it is released when [file] changes or the caller leaves. */
@Composable
fun rememberAudio(file: File, autoPlay: Boolean, speed: Float = 1f, loop: Boolean = false, onComplete: () -> Unit = {}): AudioHandle {
    val handle = remember(file) { AudioHandle() }
    val complete by rememberUpdatedState(onComplete)
    DisposableEffect(file) {
        val p = MediaPlayer()
        handle.player = p
        handle.setPlaybackSpeed(speed)
        handle.setLoop(loop)
        try {
            p.setDataSource(file.absolutePath)
            p.setOnPreparedListener {
                handle.prepared = true
                handle.duration = it.duration.toLong().coerceAtLeast(0L)
                it.isLooping = handle.looping
                if (autoPlay) { it.start(); handle.applySpeed(it); handle.started() }
            }
            p.setOnCompletionListener {
                handle.stopped()
                handle.position = handle.duration
                complete()
            }
            p.setOnErrorListener { _, _, _ -> handle.error = "This file can't be played."; handle.stopped(); true }
            p.prepareAsync()
        } catch (e: Exception) {
            handle.error = "This file can't be played."
        }
        onDispose {
            handle.player = null
            handle.prepared = false
            runCatching { p.release() }
        }
    }
    LaunchedEffect(handle, handle.playing) {
        while (handle.playing) {
            handle.player?.let { p -> runCatching { handle.position = p.currentPosition.toLong() } }
            delay(250)
        }
    }
    return handle
}

/** Title, artist and cover picture read from the file's tags. */
data class AudioTags(val title: String, val artist: String?, val album: String?, val cover: ImageBitmap?)

@Composable
fun rememberAudioTags(file: File): AudioTags {
    val fallback = AudioTags(file.nameWithoutExtension, null, null, null)
    val tags by produceState(fallback, file) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val r = MediaMetadataRetriever()
                try {
                    r.setDataSource(file.absolutePath)
                    val cover = r.embeddedPicture?.let { bytes ->
                        val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
                    }
                    AudioTags(
                        title = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.takeIf { it.isNotBlank() } ?: file.nameWithoutExtension,
                        artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.takeIf { it.isNotBlank() },
                        album = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.takeIf { it.isNotBlank() },
                        cover = cover,
                    )
                } finally {
                    r.release()
                }
            }.getOrDefault(fallback)
        }
    }
    return tags
}

fun formatTime(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private val coverColors = listOf(
    listOf(Color(0xFF7C4DFF), Color(0xFF3B1FA8)),
    listOf(Color(0xFFFF6B8B), Color(0xFFB0216B)),
    listOf(Color(0xFF29B6F6), Color(0xFF1A45C9)),
    listOf(Color(0xFFFFB74D), Color(0xFFE0455A)),
    listOf(Color(0xFF26D7A5), Color(0xFF0E7C86)),
)

fun coverBrush(name: String): Brush = Brush.linearGradient(coverColors[(name.hashCode() and 0x7fffffff) % coverColors.size])

/** Album art, or a coloured cover with a note when the file has none. */
@Composable
fun AudioCover(tags: AudioTags, name: String, modifier: Modifier = Modifier, corner: Int = 28) {
    Box(
        modifier.clip(RoundedCornerShape(corner.dp)).background(coverBrush(name)),
        contentAlignment = Alignment.Center,
    ) {
        if (tags.cover != null) {
            Image(tags.cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Icon(Icons.Rounded.MusicNote, null, tint = Color.White.copy(alpha = 0.92f), modifier = Modifier.fillMaxSize(0.42f))
        }
    }
}

private enum class RepeatMode { OFF, ALL, ONE }

private val speeds = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)

private fun audioSiblings(path: String): List<File> {
    val file = File(path)
    val list = file.parentFile?.listFiles()
        ?.filter { it.isFile && !it.name.startsWith(".") && FileTypes.kindOf(it.name, false) == FileKind.AUDIO }
        ?.sortedBy { it.name.lowercase() }
        .orEmpty()
    return if (list.any { it.absolutePath == file.absolutePath }) list else listOf(file)
}

/** The full-screen music player: cover, seek bar, controls and the other songs in the folder. */
@Composable
fun AudioPlayerScreen(path: String, onBack: () -> Unit) {
    val queue = remember(path) { audioSiblings(path) }
    var index by rememberSaveable(path) { mutableIntStateOf(queue.indexOfFirst { it.absolutePath == File(path).absolutePath }.coerceAtLeast(0)) }
    var shuffle by rememberSaveable { mutableStateOf(false) }
    var repeat by rememberSaveable { mutableStateOf(RepeatMode.OFF) }
    var speed by rememberSaveable { mutableFloatStateOf(1f) }
    var showQueue by remember { mutableStateOf(false) }
    val file = queue[index.coerceIn(0, queue.lastIndex)]

    fun next(auto: Boolean) {
        if (queue.size <= 1) return
        index = when {
            shuffle -> (queue.indices - index).random()
            index < queue.lastIndex -> index + 1
            auto && repeat != RepeatMode.ALL -> return
            else -> 0
        }
    }

    val audio = rememberAudio(file, autoPlay = true, speed = speed, loop = repeat == RepeatMode.ONE, onComplete = { next(auto = true) })
    val tags = rememberAudioTags(file)
    BackHandler { audio.pause(); onBack() }

    val coverScale by animateFloatAsState(if (audio.playing) 1f else 0.9f, tween(450), label = "cover")
    var dragging by remember { mutableStateOf<Float?>(null) }

    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF2A1D5C), Color(0xFF161A3A), Color(0xFF0D0F22)))),
    ) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { audio.pause(); onBack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Color.White) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("NOW PLAYING", color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    Text(
                        "${index + 1} of ${queue.size} · ${file.parentFile?.name.orEmpty()}",
                        color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = { showQueue = true }) { Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Songs in this folder", tint = Color.White) }
            }

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                AudioCover(
                    tags, file.name,
                    Modifier.fillMaxWidth(0.86f).aspectRatio(1f)
                        .graphicsLayer { scaleX = coverScale; scaleY = coverScale }
                        .shadow(28.dp, RoundedCornerShape(28.dp), ambientColor = Color(0xFF7C4DFF), spotColor = Color(0xFF7C4DFF)),
                )
            }

            Text(
                tags.title, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.fillMaxWidth().testTag("audio_title"),
            )
            Text(
                listOfNotNull(tags.artist, tags.album).joinToString(" · ").ifEmpty { "Unknown artist" },
                color = Color.White.copy(alpha = 0.65f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            audio.error?.let { Text(it, color = Color(0xFFFF8A9A), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }

            Spacer(Modifier.height(14.dp))
            val dur = audio.duration.coerceAtLeast(1L)
            Slider(
                value = dragging ?: (audio.position.toFloat() / dur).coerceIn(0f, 1f),
                onValueChange = { dragging = it },
                onValueChangeFinished = { dragging?.let { audio.seekTo((it * dur).toLong()) }; dragging = null },
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.White.copy(alpha = 0.22f)),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth()) {
                val shown = dragging?.let { (it * dur).toLong() } ?: audio.position
                Text(formatTime(shown), color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.weight(1f))
                Text(formatTime(audio.duration), color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
            }

            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                ToggleIcon(Icons.Rounded.Shuffle, "Shuffle", shuffle) { shuffle = !shuffle }
                IconButton(onClick = {
                    if (audio.position > 3000 || queue.size <= 1) audio.seekTo(0) else index = if (index > 0) index - 1 else queue.lastIndex
                }, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Rounded.SkipPrevious, "Previous", tint = Color.White, modifier = Modifier.size(36.dp))
                }
                Surface(onClick = audio::toggle, shape = CircleShape, color = Color.White, shadowElevation = 8.dp, modifier = Modifier.size(78.dp).testTag("play_pause")) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (audio.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            if (audio.playing) "Pause" else "Play", tint = Color(0xFF1C1F3D), modifier = Modifier.size(42.dp),
                        )
                    }
                }
                IconButton(onClick = { next(auto = false) }, enabled = queue.size > 1, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Rounded.SkipNext, "Next", tint = Color.White.copy(alpha = if (queue.size > 1) 1f else 0.35f), modifier = Modifier.size(36.dp))
                }
                ToggleIcon(
                    if (repeat == RepeatMode.ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                    when (repeat) { RepeatMode.OFF -> "Repeat off"; RepeatMode.ALL -> "Repeat all"; RepeatMode.ONE -> "Repeat one" },
                    repeat != RepeatMode.OFF,
                ) {
                    repeat = RepeatMode.entries[(repeat.ordinal + 1) % RepeatMode.entries.size]
                    audio.setLoop(repeat == RepeatMode.ONE)
                }
            }

            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth().padding(bottom = 18.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { audio.skip(-10_000) }) { Icon(Icons.Rounded.Replay10, "Back 10 seconds", tint = Color.White.copy(alpha = 0.85f)) }
                Surface(
                    onClick = {
                        speed = speeds[(speeds.indexOf(speed).coerceAtLeast(0) + 1) % speeds.size]
                        audio.setPlaybackSpeed(speed)
                    },
                    shape = RoundedCornerShape(50),
                    color = Color.White.copy(alpha = 0.12f),
                ) {
                    Text(
                        (if (speed % 1f == 0f) "${speed.toInt()}" else "$speed") + "×",
                        color = Color.White, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                IconButton(onClick = { audio.skip(10_000) }) { Icon(Icons.Rounded.Forward10, "Forward 10 seconds", tint = Color.White.copy(alpha = 0.85f)) }
            }
        }
    }

    if (showQueue) {
        ModalBottomSheet(onDismissRequest = { showQueue = false }) {
            Text(
                "Songs in ${file.parentFile?.name.orEmpty()}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            LazyColumn(Modifier.fillMaxWidth().height(420.dp)) {
                itemsIndexed(queue, key = { _, f -> f.absolutePath }) { i, f ->
                    val current = i == index
                    Row(
                        Modifier.fillMaxWidth().clickable { index = i; showQueue = false }.padding(horizontal = 20.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(coverBrush(f.name)), contentAlignment = Alignment.Center) {
                            Icon(if (current) Icons.Rounded.GraphicEq else Icons.Rounded.MusicNote, null, tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                        Spacer(Modifier.width(14.dp))
                        Text(
                            f.nameWithoutExtension, style = MaterialTheme.typography.bodyLarge,
                            fontWeight = if (current) FontWeight.Bold else FontWeight.Normal,
                            color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ToggleIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, on: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, label, tint = if (on) Color(0xFFB39DFF) else Color.White.copy(alpha = 0.6f))
            if (on) Box(Modifier.padding(top = 30.dp).size(4.dp).clip(CircleShape).background(Color(0xFFB39DFF)))
        }
    }
}

/** A small player card: cover, title, play button and seek bar. Used by previews such as the Recycle Bin. */
@Composable
fun CompactAudioPlayer(file: File, displayName: String, modifier: Modifier = Modifier) {
    val audio = rememberAudio(file, autoPlay = false)
    val tags = rememberAudioTags(file)
    var dragging by remember { mutableStateOf<Float?>(null) }
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        AudioCover(tags, displayName, Modifier.size(200.dp).shadow(18.dp, RoundedCornerShape(28.dp)))
        Spacer(Modifier.height(18.dp))
        Text(
            if (tags.title == file.nameWithoutExtension) displayName.substringBeforeLast('.') else tags.title,
            color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
        tags.artist?.let { Text(it, color = Color.White.copy(alpha = 0.65f), style = MaterialTheme.typography.bodyMedium) }
        audio.error?.let { Text(it, color = Color(0xFFFF8A9A), style = MaterialTheme.typography.bodySmall) }
        Spacer(Modifier.height(10.dp))
        val dur = audio.duration.coerceAtLeast(1L)
        Slider(
            value = dragging ?: (audio.position.toFloat() / dur).coerceIn(0f, 1f),
            onValueChange = { dragging = it },
            onValueChangeFinished = { dragging?.let { audio.seekTo((it * dur).toLong()) }; dragging = null },
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.White.copy(alpha = 0.22f)),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(Modifier.fillMaxWidth()) {
            Text(formatTime(audio.position), color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.weight(1f))
            Text(formatTime(audio.duration), color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { audio.skip(-10_000) }) { Icon(Icons.Rounded.Replay10, "Back 10 seconds", tint = Color.White) }
            Spacer(Modifier.width(12.dp))
            Surface(onClick = audio::toggle, shape = CircleShape, color = Color.White, modifier = Modifier.size(64.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(if (audio.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (audio.playing) "Pause" else "Play", tint = Color(0xFF1C1F3D), modifier = Modifier.size(36.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            IconButton(onClick = { audio.skip(10_000) }) { Icon(Icons.Rounded.Forward10, "Forward 10 seconds", tint = Color.White) }
        }
    }
}

package com.filepilot.app.ui.preview

import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import androidx.annotation.OptIn
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.Format
import com.filepilot.app.ui.components.ErrorState
import com.filepilot.app.ui.details.formatDuration
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.theme.Brand
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** One ExoPlayer per screen, paused when the app goes to the background and released on exit. */
@Composable
private fun rememberPlayer(item: FileItem, onError: (String) -> Unit): ExoPlayer {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val player = remember(item.uri) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(item.uri))
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                onError("This file can't be played here. It may be damaged or use an unsupported format.")
            }
        }
        player.addListener(listener)
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) player.pause()
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            player.removeListener(listener)
            player.release()
        }
    }
    return player
}

@OptIn(UnstableApi::class)
@Composable
fun VideoPlayerScreen(item: FileItem) {
    val navigator = LocalNavigator.current
    var error by remember { mutableStateOf<String?>(null) }
    val player = rememberPlayer(item) { error = it }
    Scaffold(
        topBar = { PreviewTopBar(item, dark = true, containerColor = Color.Black) },
        containerColor = Color.Black,
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
            val e = error
            if (e != null) {
                ErrorState(e, onRetry = null, extraLabel = "Open in another app", onExtra = { navigator.openExternal(item, chooser = true) })
            } else {
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            this.player = player
                            useController = true
                            setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                            setBackgroundColor(android.graphics.Color.BLACK)
                            keepScreenOn = true
                        }
                    },
                    modifier = Modifier.fillMaxSize().navigationBarsPadding(),
                )
            }
        }
    }
}

private data class AudioMeta(val title: String?, val artist: String?, val album: String?, val art: ImageBitmap?)

@Composable
fun AudioPlayerScreen(item: FileItem) {
    val context = LocalContext.current
    val navigator = LocalNavigator.current
    var error by remember { mutableStateOf<String?>(null) }
    val player = rememberPlayer(item) { error = it }
    var playing by remember { mutableStateOf(true) }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }
    var meta by remember { mutableStateOf(AudioMeta(null, null, null, null)) }

    LaunchedEffect(item.uri) {
        meta = withContext(Dispatchers.IO) {
            val r = MediaMetadataRetriever()
            try {
                if (item.source == SourceKind.LOCAL) r.setDataSource(item.path) else r.setDataSource(context, item.uri)
                val art = r.embeddedPicture?.let { bytes ->
                    val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
                }
                AudioMeta(
                    r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE),
                    r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST),
                    r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM),
                    art,
                )
            } catch (_: Exception) {
                AudioMeta(null, null, null, null)
            } finally {
                runCatching { r.release() }
            }
        }
    }
    LaunchedEffect(player) {
        while (true) {
            playing = player.isPlaying || (player.playWhenReady && player.playbackState == Player.STATE_BUFFERING)
            if (!dragging) position = player.currentPosition.coerceAtLeast(0)
            val d = player.duration
            if (d > 0) duration = d
            delay(250)
        }
    }

    Scaffold(topBar = { PreviewTopBar(item) }) { padding ->
        val e = error
        if (e != null) {
            ErrorState(e, onRetry = null, modifier = Modifier.padding(padding), extraLabel = "Open in another app", onExtra = { navigator.openExternal(item, chooser = true) })
            return@Scaffold
        }
        Column(
            Modifier.padding(padding).fillMaxSize().padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                Modifier
                    .widthIn(max = 280.dp)
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(28.dp))
                    .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Brand.IndigoBright, Brand.Violet))),
                contentAlignment = Alignment.Center,
            ) {
                val art = meta.art
                if (art != null) {
                    Image(art, contentDescription = "Album art", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(Icons.Rounded.MusicNote, null, tint = Color.White, modifier = Modifier.size(88.dp))
                }
            }
            Spacer(Modifier.height(28.dp))
            Text(
                meta.title ?: item.name.substringBeforeLast('.'),
                style = MaterialTheme.typography.titleLarge,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val sub = listOfNotNull(meta.artist, meta.album).joinToString(" · ").ifEmpty { "${Format.size(item.size)} · ${item.extension.uppercase()}" }
            Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            Spacer(Modifier.height(20.dp))
            Slider(
                value = if (dragging) dragValue else if (duration > 0) position.toFloat() / duration else 0f,
                onValueChange = {
                    dragging = true
                    dragValue = it
                },
                onValueChangeFinished = {
                    if (duration > 0) player.seekTo((dragValue * duration).toLong())
                    position = (dragValue * duration).toLong()
                    dragging = false
                },
                enabled = duration > 0,
            )
            Row(Modifier.fillMaxWidth()) {
                Text(formatDuration(if (dragging) (dragValue * duration).toLong() else position), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                Text(if (duration > 0) formatDuration(duration) else "--:--", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                IconButton(onClick = { player.seekTo((player.currentPosition - 10_000).coerceAtLeast(0)) }) {
                    Icon(Icons.Rounded.Replay10, "Back 10 seconds", modifier = Modifier.size(28.dp))
                }
                FilledIconButton(
                    onClick = { if (player.isPlaying) player.pause() else { if (player.playbackState == Player.STATE_ENDED) player.seekTo(0); player.play() } },
                    modifier = Modifier.size(68.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = MaterialTheme.colorScheme.primary),
                ) {
                    Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Pause" else "Play", modifier = Modifier.size(36.dp))
                }
                IconButton(onClick = { player.seekTo(player.currentPosition + 10_000) }) {
                    Icon(Icons.Rounded.Forward10, "Forward 10 seconds", modifier = Modifier.size(28.dp))
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

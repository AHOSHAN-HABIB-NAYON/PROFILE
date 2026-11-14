package com.webtecit.filepilot.feature.media

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.media.MediaPlayer
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.AspectRatio
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.ScreenRotation
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileTypes
import java.io.File
import kotlinx.coroutines.delay

private val videoSpeeds = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)

private fun videoSiblings(path: String): List<File> {
    val file = File(path)
    val list = file.parentFile?.listFiles()
        ?.filter { it.isFile && !it.name.startsWith(".") && FileTypes.kindOf(it.name, false) == FileKind.VIDEO }
        ?.sortedBy { it.name.lowercase() }
        .orEmpty()
    return if (list.any { it.absolutePath == file.absolutePath }) list else listOf(file)
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is android.content.ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/**
 * Full-screen video player with its own controls (the platform MediaController swallowed the back
 * button). Tap shows/hides controls; double-tap a side skips 10 s; drag the left side for
 * brightness and the right side for volume.
 */
@Composable
fun VideoPlayerScreen(path: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val activity = remember { context.findActivity() }
    val queue = remember(path) { videoSiblings(path) }
    var index by rememberSaveable(path) { mutableIntStateOf(queue.indexOfFirst { it.absolutePath == File(path).absolutePath }.coerceAtLeast(0)) }
    val file = queue[index.coerceIn(0, queue.lastIndex)]

    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var videoW by remember { mutableIntStateOf(0) }
    var videoH by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var controls by remember { mutableStateOf(true) }
    var locked by remember { mutableStateOf(false) }
    var fill by rememberSaveable { mutableStateOf(false) }
    var speed by rememberSaveable { mutableFloatStateOf(1f) }
    var dragging by remember { mutableStateOf<Float?>(null) }
    var skipFlash by remember { mutableStateOf<String?>(null) }
    var gestureLabel by remember { mutableStateOf<Pair<ImageVector, Float>?>(null) }
    var interaction by remember { mutableIntStateOf(0) }

    val video = remember { VideoView(context) }

    fun applySpeed(mp: MediaPlayer?) {
        mp ?: return
        runCatching { if (mp.isPlaying) mp.playbackParams = mp.playbackParams.setSpeed(speed) }
    }
    fun togglePlay() {
        if (video.isPlaying) { video.pause(); playing = false } else { video.start(); applySpeed(player); playing = true }
        interaction++
    }
    fun seekBy(ms: Long) {
        val target = (video.currentPosition + ms).coerceIn(0L, duration.coerceAtLeast(0L))
        video.seekTo(target.toInt())
        position = target
    }

    DisposableEffect(file) {
        error = null
        position = 0L
        duration = 0L
        video.setOnPreparedListener { mp ->
            player = mp
            duration = mp.duration.toLong().coerceAtLeast(0L)
            videoW = mp.videoWidth
            videoH = mp.videoHeight
            video.start()
            applySpeed(mp)
            playing = true
        }
        video.setOnCompletionListener {
            playing = false
            controls = true
            position = duration
        }
        video.setOnErrorListener { _, _, _ -> error = "This video can't be played here. Try \"Open with\" another app."; playing = false; true }
        video.setVideoPath(file.absolutePath)
        onDispose { video.stopPlayback(); player = null }
    }

    // Keep the screen on and use the whole screen while watching; restore everything on leaving.
    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = activity?.window
        val insets = window?.let { WindowCompat.getInsetsController(it, view) }
        val orientation = activity?.requestedOrientation
        val brightness = window?.attributes?.screenBrightness
        view.keepScreenOn = true
        insets?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        onDispose {
            view.keepScreenOn = false
            insets?.show(WindowInsetsCompat.Type.systemBars())
            if (orientation != null) activity?.requestedOrientation = orientation
            if (window != null && brightness != null) window.attributes = window.attributes.apply { screenBrightness = brightness }
        }
    }
    LaunchedEffect(controls, locked) {
        val insets = activity?.window?.let { WindowCompat.getInsetsController(it, view) }
        if (controls && !locked) insets?.show(WindowInsetsCompat.Type.systemBars()) else insets?.hide(WindowInsetsCompat.Type.systemBars())
    }

    LaunchedEffect(playing) {
        while (playing) {
            runCatching { position = video.currentPosition.toLong() }
            delay(250)
        }
    }
    // Controls fade away 3 s after the last touch while the video plays.
    LaunchedEffect(controls, playing, interaction) {
        if (controls && playing) { delay(3000); controls = false }
    }
    LaunchedEffect(skipFlash) { if (skipFlash != null) { delay(650); skipFlash = null } }
    LaunchedEffect(gestureLabel) { if (gestureLabel != null) { delay(900); gestureLabel = null } }

    BackHandler { onBack() }

    val audio = remember { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }

    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black).testTag("video_player")) {
        val boxW = constraints.maxWidth.toFloat()
        val boxH = constraints.maxHeight.toFloat()
        val zoom = if (fill && videoW > 0 && videoH > 0) {
            val fit = minOf(boxW / videoW, boxH / videoH)
            val cover = maxOf(boxW / videoW, boxH / videoH)
            (cover / fit).coerceAtMost(4f)
        } else 1f

        AndroidView(
            factory = { video },
            modifier = Modifier.align(Alignment.Center).graphicsLayer { scaleX = zoom; scaleY = zoom },
        )

        // Gesture layer.
        Box(
            Modifier.fillMaxSize()
                .pointerInput(locked) {
                    detectTapGestures(
                        onTap = { controls = !controls; interaction++ },
                        onDoubleTap = { o ->
                            if (locked) return@detectTapGestures
                            if (o.x < size.width / 3f) { seekBy(-10_000); skipFlash = "« 10 s" }
                            else if (o.x > size.width * 2f / 3f) { seekBy(10_000); skipFlash = "10 s »" }
                            else togglePlay()
                        },
                    )
                }
                .pointerInput(locked) {
                    if (locked) return@pointerInput
                    var leftSide = true
                    detectVerticalDragGestures(
                        onDragStart = { o -> leftSide = o.x < size.width / 2f },
                        onVerticalDrag = { change, dy ->
                            change.consume()
                            val delta = -dy / size.height
                            if (leftSide) {
                                val window = activity?.window ?: return@detectVerticalDragGestures
                                val current = window.attributes.screenBrightness.let { if (it < 0f) 0.5f else it }
                                val next = (current + delta).coerceIn(0.02f, 1f)
                                window.attributes = window.attributes.apply { screenBrightness = next }
                                gestureLabel = Icons.Rounded.LightMode to next
                            } else {
                                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                                val now = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
                                val wanted = (now + delta * max * 1.6f)
                                val step = when {
                                    wanted >= now + 1 -> now + 1
                                    wanted <= now - 1 -> now - 1
                                    else -> now
                                }.coerceIn(0, max)
                                if (step != now) audio.setStreamVolume(AudioManager.STREAM_MUSIC, step, 0)
                                gestureLabel = Icons.AutoMirrored.Rounded.VolumeUp to (step.toFloat() / max.coerceAtLeast(1))
                            }
                        },
                    )
                },
        )

        skipFlash?.let {
            Text(
                it, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.Center).clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 18.dp, vertical = 10.dp),
            )
        }
        gestureLabel?.let { (icon, value) ->
            Row(
                Modifier.align(Alignment.TopCenter).padding(top = 90.dp).clip(RoundedCornerShape(20.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(icon, null, tint = Color.White)
                Spacer(Modifier.width(10.dp))
                Box(Modifier.width(120.dp).height(5.dp).clip(RoundedCornerShape(3.dp)).background(Color.White.copy(alpha = 0.25f))) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth(value.coerceIn(0f, 1f)).background(Color.White))
                }
            }
        }
        error?.let {
            Text(it, color = Color.White, modifier = Modifier.align(Alignment.Center).padding(32.dp))
        }

        if (locked) {
            AnimatedVisibility(controls, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.align(Alignment.CenterStart)) {
                Surface(onClick = { locked = false; controls = true }, shape = CircleShape, color = Color.White.copy(alpha = 0.18f), modifier = Modifier.padding(start = 20.dp).size(54.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.LockOpen, "Unlock", tint = Color.White) }
                }
            }
        } else {
            AnimatedVisibility(controls, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxWidth().height(140.dp).background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent))))
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(200.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f)))))

                    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Color.White) }
                        Column(Modifier.weight(1f)) {
                            Text(file.name, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                listOfNotNull(if (videoW > 0) "${videoW}×$videoH" else null, Formatters.size(file.length()), if (queue.size > 1) "${index + 1} of ${queue.size}" else null).joinToString(" · "),
                                color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }

                    Row(Modifier.align(Alignment.Center), horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
                        RoundControl(Icons.Rounded.Replay10, "Back 10 seconds") { seekBy(-10_000); interaction++ }
                        Surface(onClick = ::togglePlay, shape = CircleShape, color = Color.White, modifier = Modifier.size(74.dp).testTag("video_play_pause")) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Pause" else "Play", tint = Color(0xFF151A2D), modifier = Modifier.size(40.dp))
                            }
                        }
                        RoundControl(Icons.Rounded.Forward10, "Forward 10 seconds") { seekBy(10_000); interaction++ }
                    }

                    Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp)) {
                        val dur = duration.coerceAtLeast(1L)
                        Row(Modifier.fillMaxWidth()) {
                            Text(formatTime(dragging?.let { (it * dur).toLong() } ?: position), color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text(formatTime(duration), color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.labelMedium)
                        }
                        Slider(
                            value = dragging ?: (position.toFloat() / dur).coerceIn(0f, 1f),
                            onValueChange = { dragging = it; interaction++ },
                            onValueChangeFinished = { dragging?.let { v -> video.seekTo((v * dur).toInt()); position = (v * dur).toLong() }; dragging = null },
                            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.White.copy(alpha = 0.25f)),
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            ToolButton(Icons.Rounded.Lock, "Lock") { locked = true }
                            Column(
                                Modifier.clip(RoundedCornerShape(12.dp)).pointerInput(Unit) {
                                    detectTapGestures {
                                        speed = videoSpeeds[(videoSpeeds.indexOf(speed).coerceAtLeast(0) + 1) % videoSpeeds.size]
                                        applySpeed(player)
                                        interaction++
                                    }
                                }.padding(horizontal = 8.dp, vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text(
                                    (if (speed % 1f == 0f) "${speed.toInt()}" else "$speed") + "×", color = Color.White, fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.16f)).padding(horizontal = 10.dp, vertical = 3.dp),
                                )
                                Text("Speed", color = Color.White, style = MaterialTheme.typography.labelSmall)
                            }
                            ToolButton(Icons.Rounded.AspectRatio, if (fill) "Fill" else "Fit") { fill = !fill; interaction++ }
                            ToolButton(Icons.Rounded.ScreenRotation, "Rotate") {
                                activity?.requestedOrientation =
                                    if (activity?.requestedOrientation == ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE) ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                                    else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                                interaction++
                            }
                            ToolButton(Icons.Rounded.SkipNext, "Next", enabled = queue.size > 1) { index = (index + 1) % queue.size }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoundControl(icon: ImageVector, label: String, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = CircleShape, color = Color.White.copy(alpha = 0.16f), modifier = Modifier.size(50.dp)) {
        Box(contentAlignment = Alignment.Center) { Icon(icon, label, tint = Color.White, modifier = Modifier.size(28.dp)) }
    }
}

@Composable
private fun ToolButton(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(12.dp)).pointerInput(enabled) { if (enabled) detectTapGestures { onClick() } }.padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, label, tint = Color.White.copy(alpha = if (enabled) 1f else 0.35f))
        Text(label, color = Color.White.copy(alpha = if (enabled) 1f else 0.35f), style = MaterialTheme.typography.labelSmall)
    }
}

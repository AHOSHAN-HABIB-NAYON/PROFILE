package com.webtecit.devicepilot.feature.diagnostics

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brightness5
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.FlashlightOn
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.ScreenRotation
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.BulletText
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LocalStatusColors
import com.webtecit.devicepilot.core.designsystem.MessageState
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.navigation.Routes
import com.webtecit.devicepilot.core.permissions.findActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

enum class DiagTest(val title: String, val icon: ImageVector, val instructions: String) {
    TOUCH("Touch Screen", Icons.Default.TouchApp, "Drag your finger across the screen until every square turns green. Untouched squares show dead touch areas."),
    DISPLAY("Display", Icons.Default.Palette, "Shows colour gradients and grey steps. Look for banding, tint or uneven brightness. Tap to go to the next pattern."),
    DEAD_PIXEL("Dead Pixel", Icons.Default.GridOn, "Fills the screen with solid colours. Look closely for dots that stay black, white or a different colour. Tap to change colour."),
    SPEAKER("Speaker", Icons.AutoMirrored.Filled.VolumeUp, "Plays a test tone through the speaker. Turn the media volume up first."),
    VIBRATION("Vibration", Icons.Default.Vibration, "Runs short and long vibration patterns."),
    FLASHLIGHT("Flashlight", Icons.Default.FlashlightOn, "Turns the camera flash on and off. Don't look directly into it."),
    ACCELEROMETER("Accelerometer", Icons.Default.ScreenRotation, "Tilt the phone; the bubble should move smoothly and the values should change."),
    GYROSCOPE("Gyroscope", Icons.Default.RotateRight, "Rotate the phone in different directions; each axis value should react."),
    PROXIMITY("Proximity Sensor", Icons.Default.Sensors, "Cover the top of the screen near the earpiece with your hand; the state should change to Near."),
    LIGHT("Light Sensor", Icons.Default.Brightness5, "Move between light and shade; the lux value should rise and fall."),
    COMPASS("Compass", Icons.Default.Explore, "Hold the phone flat and turn around. If the heading jumps, move the phone in a figure-8 to calibrate."),
}

/** Pass/fail results for this session, shown on the Hardware Test Center list. */
object DiagnosticResults {
    val results = MutableStateFlow<Map<DiagTest, Boolean>>(emptyMap())
    fun set(test: DiagTest, passed: Boolean) = results.update { it + (test to passed) }
}

fun DiagTest.isSupported(context: Context): Boolean {
    val pm = context.packageManager
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    return when (this) {
        DiagTest.TOUCH -> pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)
        DiagTest.DISPLAY, DiagTest.DEAD_PIXEL -> true
        DiagTest.SPEAKER -> pm.hasSystemFeature(PackageManager.FEATURE_AUDIO_OUTPUT)
        DiagTest.VIBRATION -> vibrator(context)?.hasVibrator() == true
        DiagTest.FLASHLIGHT -> pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH) && flashCameraId(context) != null
        DiagTest.ACCELEROMETER -> sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null
        DiagTest.GYROSCOPE -> sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null
        DiagTest.PROXIMITY -> sm.getDefaultSensor(Sensor.TYPE_PROXIMITY) != null
        DiagTest.LIGHT -> sm.getDefaultSensor(Sensor.TYPE_LIGHT) != null
        DiagTest.COMPASS -> sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null && sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null
    }
}

private fun vibrator(context: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= 31) (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    else @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

private fun flashCameraId(context: Context): String? = runCatching {
    val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
}.getOrNull()

// -------------------------------------------------------------------------------------------- list

@Composable
fun DiagnosticsScreen(onBack: () -> Unit, navigate: (String) -> Unit) {
    val context = LocalContext.current
    val results by DiagnosticResults.results.collectAsStateWithLifecycle()
    DpScaffold("Hardware Test Center", onBack) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item {
                NoteText("Each test uses the real hardware. Unsupported tests are disabled. Results are kept until you close the app.")
            }
            items(DiagTest.entries, key = { it.name }) { test ->
                val supported = remember(test) { test.isSupported(context) }
                DpCard(onClick = if (supported) ({ navigate(Routes.diagnosticTest(test.name)) }) else null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(test.icon, if (supported) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(Spacing.md))
                        Text(test.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        val result = results[test]
                        when {
                            !supported -> StatusChip("Not Supported", Tone.NEUTRAL)
                            result == true -> StatusChip("Passed", Tone.GOOD)
                            result == false -> StatusChip("Failed", Tone.BAD)
                            else -> StatusChip("Supported", Tone.INFO)
                        }
                    }
                }
            }
        }
    }
}

// -------------------------------------------------------------------------------------------- test host

@Composable
fun DiagnosticTestScreen(testName: String, onBack: () -> Unit) {
    val test = DiagTest.entries.firstOrNull { it.name == testName }
    if (test == null) {
        DpScaffold("Test", onBack) { MessageState(Icons.Default.Sensors, "Unknown test", "This test does not exist.", Modifier.padding(it)) }
        return
    }
    val context = LocalContext.current
    if (!test.isSupported(context)) {
        DpScaffold(test.title, onBack) {
            MessageState(test.icon, "Not supported", "This phone does not have the hardware needed for the ${test.title.lowercase()} test.", Modifier.padding(it))
        }
        return
    }
    when (test) {
        DiagTest.TOUCH -> TouchTest(onDone = { passed -> DiagnosticResults.set(test, passed); onBack() })
        DiagTest.DISPLAY -> PatternTest(displayPatterns(), test, onBack)
        DiagTest.DEAD_PIXEL -> PatternTest(solidPatterns(), test, onBack)
        else -> DpScaffold(test.title, onBack) { padding ->
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = padding.calculateTopPadding()).padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                DpCard {
                    Text("How to test", style = MaterialTheme.typography.titleSmall)
                    NoteText(test.instructions)
                }
                when (test) {
                    DiagTest.SPEAKER -> SpeakerTest()
                    DiagTest.VIBRATION -> VibrationTest()
                    DiagTest.FLASHLIGHT -> FlashlightTest()
                    DiagTest.ACCELEROMETER -> AccelerometerTest()
                    DiagTest.GYROSCOPE -> AxisSensorTest(Sensor.TYPE_GYROSCOPE, "rad/s")
                    DiagTest.PROXIMITY -> ProximityTest()
                    DiagTest.LIGHT -> LightTest()
                    DiagTest.COMPASS -> CompassTest()
                    else -> Unit
                }
                ResultButtons { passed -> DiagnosticResults.set(test, passed); onBack() }
            }
        }
    }
}

@Composable
private fun ResultButtons(onResult: (Boolean) -> Unit) {
    Text("Did it work as expected?", style = MaterialTheme.typography.titleSmall)
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        OutlinedButton(onClick = { onResult(false) }, modifier = Modifier.weight(1f)) { Text("No, it failed") }
        Button(onClick = { onResult(true) }, modifier = Modifier.weight(1f)) { Text("Yes, it works") }
    }
}

/** Hides the status and navigation bars while a full-screen test is shown. */
@Composable
private fun ImmersiveMode() {
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val activity = context.findActivity() as? Activity
        val controller = activity?.let { WindowCompat.getInsetsController(it.window, it.window.decorView) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose { controller?.show(WindowInsetsCompat.Type.systemBars()) }
    }
}

// -------------------------------------------------------------------------------------------- touch

@Composable
private fun TouchTest(onDone: (Boolean) -> Unit) {
    ImmersiveMode()
    val cols = 8
    val rows = 14
    val touched = remember { mutableStateListOf<Int>() }
    val success = LocalStatusColors.current.success
    val grid = MaterialTheme.colorScheme.outline
    val bg = MaterialTheme.colorScheme.background
    Box(Modifier.fillMaxSize().background(bg)) {
        Canvas(
            Modifier.fillMaxSize().pointerInput(Unit) {
                fun mark(o: Offset) {
                    val c = (o.x / size.width * cols).toInt().coerceIn(0, cols - 1)
                    val r = (o.y / size.height * rows).toInt().coerceIn(0, rows - 1)
                    val idx = r * cols + c
                    if (idx !in touched) touched.add(idx)
                }
                detectDragGestures(onDragStart = { mark(it) }) { change, _ -> mark(change.position) }
            }.pointerInput(Unit) {
                detectTapGestures { o ->
                    val c = (o.x / size.width * cols).toInt().coerceIn(0, cols - 1)
                    val r = (o.y / size.height * rows).toInt().coerceIn(0, rows - 1)
                    if (r * cols + c !in touched) touched.add(r * cols + c)
                }
            },
        ) {
            val w = size.width / cols
            val h = size.height / rows
            for (r in 0 until rows) for (c in 0 until cols) {
                val tl = Offset(c * w, r * h)
                if (r * cols + c in touched) drawRect(success.copy(alpha = 0.55f), tl, Size(w, h))
                drawRect(grid, tl, Size(w, h), style = Stroke(1f))
            }
        }
        Column(Modifier.align(Alignment.Center).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f), MaterialTheme.shapes.large).padding(Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("${touched.size} / ${cols * rows}", style = MaterialTheme.typography.titleLarge)
            NoteText("Fill every square")
            Spacer(Modifier.height(Spacing.sm))
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedButton(onClick = { onDone(false) }) { Text("Failed") }
                Button(onClick = { onDone(true) }, enabled = touched.size == cols * rows) { Text("Passed") }
            }
        }
    }
}

// -------------------------------------------------------------------------------------------- display / dead pixel

private sealed interface Pattern {
    data class Solid(val color: Color, val name: String) : Pattern
    data class Gradient(val brush: Brush, val name: String) : Pattern
    data object GreySteps : Pattern
}

private fun solidPatterns() = listOf(
    Pattern.Solid(Color.Red, "Red"), Pattern.Solid(Color.Green, "Green"), Pattern.Solid(Color.Blue, "Blue"),
    Pattern.Solid(Color.White, "White"), Pattern.Solid(Color.Black, "Black"), Pattern.Solid(Color(0xFF808080), "Grey"),
)

private fun displayPatterns() = listOf(
    Pattern.Gradient(Brush.horizontalGradient(listOf(Color.Black, Color.White)), "Black → White"),
    Pattern.Gradient(Brush.horizontalGradient(listOf(Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Magenta, Color.Red)), "Colour spectrum"),
    Pattern.Gradient(Brush.verticalGradient(listOf(Color.Black, Color.Red)), "Red ramp"),
    Pattern.Gradient(Brush.verticalGradient(listOf(Color.Black, Color.Green)), "Green ramp"),
    Pattern.Gradient(Brush.verticalGradient(listOf(Color.Black, Color.Blue)), "Blue ramp"),
    Pattern.GreySteps,
)

@Composable
private fun PatternTest(patterns: List<Pattern>, test: DiagTest, onBack: () -> Unit) {
    var index by remember { mutableIntStateOf(-1) }
    if (index == -1) {
        DpScaffold(test.title, onBack) { padding ->
            Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding()).padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                DpCard {
                    Text("How to test", style = MaterialTheme.typography.titleSmall)
                    NoteText(test.instructions)
                    BulletText("Turn brightness up for the best result.")
                    BulletText("${patterns.size} patterns. After the last one you can record the result.")
                }
                Button(onClick = { index = 0 }, modifier = Modifier.fillMaxWidth()) { Text("Start test") }
            }
        }
        return
    }
    if (index >= patterns.size) {
        DpScaffold(test.title, onBack) { padding ->
            Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding()).padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                OutlinedButton(onClick = { index = 0 }, modifier = Modifier.fillMaxWidth()) { Text("Run again") }
                ResultButtons { passed -> DiagnosticResults.set(test, passed); onBack() }
            }
        }
        return
    }
    ImmersiveMode()
    val p = patterns[index]
    Box(
        Modifier.fillMaxSize().clickable { index++ },
        contentAlignment = Alignment.BottomCenter,
    ) {
        when (p) {
            is Pattern.Solid -> Box(Modifier.fillMaxSize().background(p.color))
            is Pattern.Gradient -> Box(Modifier.fillMaxSize().background(p.brush))
            Pattern.GreySteps -> Row(Modifier.fillMaxSize()) {
                repeat(16) { i -> Box(Modifier.weight(1f).fillMaxSize().background(Color(i * 17, i * 17, i * 17))) }
            }
        }
        val label = when (p) { is Pattern.Solid -> p.name; is Pattern.Gradient -> p.name; Pattern.GreySteps -> "16 grey steps" }
        Text(
            "$label · ${index + 1}/${patterns.size} · tap for next",
            color = Color.White,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(bottom = 28.dp).background(Color.Black.copy(alpha = 0.45f), MaterialTheme.shapes.small).padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

// -------------------------------------------------------------------------------------------- speaker

@Composable
private fun SpeakerTest() {
    val scope = rememberCoroutineScope()
    var playing by remember { mutableStateOf<String?>(null) }
    var track by remember { mutableStateOf<AudioTrack?>(null) }
    DisposableEffect(Unit) { onDispose { track?.let { runCatching { it.stop() }; it.release() } } }

    fun play(freq: Int, label: String) {
        scope.launch {
            track?.let { runCatching { it.stop() }; it.release() }
            playing = label
            track = withContext(Dispatchers.Default) { buildTone(freq, 2.0) }
            track?.play()
            kotlinx.coroutines.delay(2100)
            playing = null
        }
    }
    DpCard {
        Text(playing?.let { "Playing $it…" } ?: "Choose a tone", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(Spacing.sm))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            OutlinedButton(onClick = { play(250, "low tone") }, enabled = playing == null) { Text("Low") }
            OutlinedButton(onClick = { play(1000, "mid tone") }, enabled = playing == null) { Text("Mid") }
            OutlinedButton(onClick = { play(4000, "high tone") }, enabled = playing == null) { Text("High") }
        }
    }
}

private fun buildTone(freq: Int, seconds: Double): AudioTrack {
    val rate = 44_100
    val n = (rate * seconds).toInt()
    val samples = ShortArray(n) { i ->
        val fade = minOf(1.0, i / 2000.0, (n - i) / 2000.0)
        (sin(2 * PI * freq * i / rate) * Short.MAX_VALUE * 0.6 * fade).toInt().toShort()
    }
    val track = AudioTrack.Builder()
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
        .setBufferSizeInBytes(n * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()
    track.write(samples, 0, n)
    return track
}

// -------------------------------------------------------------------------------------------- vibration

@Composable
private fun VibrationTest() {
    val context = LocalContext.current
    val vib = remember { vibrator(context) }
    DisposableEffect(Unit) { onDispose { vib?.cancel() } }
    fun run(pattern: LongArray) {
        val v = vib ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(pattern, -1))
        else @Suppress("DEPRECATION") v.vibrate(pattern, -1)
    }
    DpCard {
        Text("Patterns", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(Spacing.sm))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            OutlinedButton(onClick = { run(longArrayOf(0, 80)) }) { Text("Short") }
            OutlinedButton(onClick = { run(longArrayOf(0, 800)) }) { Text("Long") }
            OutlinedButton(onClick = { run(longArrayOf(0, 120, 120, 120, 120, 400)) }) { Text("Pattern") }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            InfoRow("Amplitude control", if (vib?.hasAmplitudeControl() == true) "Supported" else "Not Supported")
        }
    }
}

// -------------------------------------------------------------------------------------------- flashlight

@Composable
private fun FlashlightTest() {
    val context = LocalContext.current
    val cm = remember { context.getSystemService(Context.CAMERA_SERVICE) as CameraManager }
    val id = remember { flashCameraId(context) }
    var on by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    DisposableEffect(id) {
        val cb = object : CameraManager.TorchCallback() {
            override fun onTorchModeChanged(cameraId: String, enabled: Boolean) { if (cameraId == id) on = enabled }
            override fun onTorchModeUnavailable(cameraId: String) { if (cameraId == id) error = "The flash is in use by another app" }
        }
        cm.registerTorchCallback(cb, null)
        onDispose {
            if (id != null && on) runCatching { cm.setTorchMode(id, false) }
            cm.unregisterTorchCallback(cb)
        }
    }
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (on) "Flash is ON" else "Flash is off", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Button(
                onClick = {
                    error = null
                    try { id?.let { cm.setTorchMode(it, !on) } } catch (e: Exception) { error = "Could not control the flash: ${e.message}" }
                },
                colors = if (on) ButtonDefaults.buttonColors(containerColor = Brand.Amber) else ButtonDefaults.buttonColors(),
            ) { Text(if (on) "Turn off" else "Turn on") }
        }
        error?.let { NoteText(it) }
    }
}

// -------------------------------------------------------------------------------------------- sensors

@Composable
private fun rememberSensorValues(type: Int, delay: Int = SensorManager.SENSOR_DELAY_UI): FloatArray? {
    val context = LocalContext.current
    var values by remember { mutableStateOf<FloatArray?>(null) }
    DisposableEffect(type) {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val sensor = sm.getDefaultSensor(type)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) { values = event.values.copyOf() }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        sensor?.let { sm.registerListener(listener, it, delay) }
        onDispose { sm.unregisterListener(listener) }
    }
    return values
}

@Composable
private fun SensorInfo(type: Int) {
    val context = LocalContext.current
    val s = remember(type) { (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getDefaultSensor(type) }
    if (s != null) {
        DpCard {
            InfoRow("Sensor", s.name)
            InfoRow("Vendor", s.vendor)
            InfoRow("Range", String.format(Locale.US, "%.2f", s.maximumRange))
            InfoRow("Resolution", String.format(Locale.US, "%.4f", s.resolution))
        }
    }
}

@Composable
private fun AxisValues(v: FloatArray?, unit: String) {
    DpCard {
        listOf("X", "Y", "Z").forEachIndexed { i, axis ->
            InfoRow(axis, v?.getOrNull(i)?.let { String.format(Locale.US, "%+.3f %s", it, unit) } ?: "Waiting…")
        }
    }
}

@Composable
private fun AccelerometerTest() {
    val v = rememberSensorValues(Sensor.TYPE_ACCELEROMETER)
    val primary = MaterialTheme.colorScheme.primary
    val outline = MaterialTheme.colorScheme.outline
    DpCard {
        Canvas(Modifier.fillMaxWidth().aspectRatio(1f)) {
            val r = size.minDimension / 2
            val c = center
            drawCircle(outline, r - 4, c, style = Stroke(2f))
            drawCircle(outline, r / 2, c, style = Stroke(1f))
            val x = (-(v?.get(0) ?: 0f) / SensorManager.GRAVITY_EARTH).coerceIn(-1f, 1f)
            val y = ((v?.get(1) ?: 0f) / SensorManager.GRAVITY_EARTH).coerceIn(-1f, 1f)
            drawCircle(primary, 22.dp.toPx(), Offset(c.x + x * (r - 30), c.y + y * (r - 30)))
        }
    }
    AxisValues(v, "m/s²")
    SensorInfo(Sensor.TYPE_ACCELEROMETER)
}

@Composable
private fun AxisSensorTest(type: Int, unit: String) {
    val v = rememberSensorValues(type)
    AxisValues(v, unit)
    SensorInfo(type)
}

@Composable
private fun ProximityTest() {
    val context = LocalContext.current
    val v = rememberSensorValues(Sensor.TYPE_PROXIMITY, SensorManager.SENSOR_DELAY_NORMAL)
    val max = remember { (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getDefaultSensor(Sensor.TYPE_PROXIMITY)?.maximumRange ?: 5f }
    val near = v != null && v[0] < max
    DpCard {
        Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
            Text(if (v == null) "Waiting…" else if (near) "NEAR" else "FAR", style = MaterialTheme.typography.displaySmall,
                color = if (near) LocalStatusColors.current.success else MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        InfoRow("Distance", v?.let { String.format(Locale.US, "%.1f cm", it[0]) } ?: "—")
    }
    SensorInfo(Sensor.TYPE_PROXIMITY)
}

@Composable
private fun LightTest() {
    val v = rememberSensorValues(Sensor.TYPE_LIGHT)
    DpCard {
        Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
            Text(v?.let { "${it[0].roundToInt()} lx" } ?: "Waiting…", style = MaterialTheme.typography.displaySmall)
        }
    }
    SensorInfo(Sensor.TYPE_LIGHT)
}

@Composable
private fun CompassTest() {
    val accel = rememberSensorValues(Sensor.TYPE_ACCELEROMETER, SensorManager.SENSOR_DELAY_GAME)
    val mag = rememberSensorValues(Sensor.TYPE_MAGNETIC_FIELD, SensorManager.SENSOR_DELAY_GAME)
    val heading: Float? = if (accel != null && mag != null) {
        val r = FloatArray(9)
        if (SensorManager.getRotationMatrix(r, null, accel, mag)) {
            val o = FloatArray(3)
            SensorManager.getOrientation(r, o)
            ((Math.toDegrees(o[0].toDouble()).toFloat() + 360f) % 360f)
        } else null
    } else null
    val red = LocalStatusColors.current.error
    val ring = MaterialTheme.colorScheme.outline
    val text = MaterialTheme.colorScheme.onSurface
    DpCard {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(240.dp)) {
                val c = center
                val r = size.minDimension / 2 - 8
                drawCircle(ring, r, c, style = Stroke(3f))
                rotate(-(heading ?: 0f), c) {
                    for (i in 0 until 72) {
                        val long = i % 18 == 0
                        val a = Math.toRadians(i * 5.0)
                        val inner = if (long) r - 22 else r - 10
                        drawLine(ring, Offset(c.x + (inner * sin(a)).toFloat(), c.y - (inner * kotlin.math.cos(a)).toFloat()),
                            Offset(c.x + (r * sin(a)).toFloat(), c.y - (r * kotlin.math.cos(a)).toFloat()), strokeWidth = if (long) 4f else 2f)
                    }
                    drawLine(red, c, Offset(c.x, c.y - r + 30), strokeWidth = 10f)
                    drawLine(text, c, Offset(c.x, c.y + r - 30), strokeWidth = 10f)
                }
                drawCircle(text, 8f, c)
            }
        }
        Spacer(Modifier.height(Spacing.sm))
        Text(
            heading?.let { "${it.roundToInt()}° ${direction(it)}" } ?: "Waiting for sensors…",
            style = MaterialTheme.typography.headlineSmall, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
        )
        NoteText("Heading is magnetic north. Metal objects and magnets nearby affect the reading.")
    }
    SensorInfo(Sensor.TYPE_MAGNETIC_FIELD)
}

private fun direction(deg: Float): String {
    val dirs = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    return dirs[((deg + 22.5f) / 45f).toInt() % 8]
}

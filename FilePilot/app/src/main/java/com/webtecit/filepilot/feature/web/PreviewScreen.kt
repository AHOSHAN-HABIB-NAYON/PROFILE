@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.web

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.ScreenRotation
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.webtecit.filepilot.core.designsystem.MonoStyle
import com.webtecit.filepilot.core.preferences.PreviewDevice
import java.io.File
import java.io.FileOutputStream

data class DevicePreset(val group: PreviewDevice, val width: Int, val height: Int) {
    val label: String get() = "$width"
}

val devicePresets = listOf(
    320 to 568, 360 to 780, 375 to 812, 390 to 844, 414 to 896, 430 to 932,
).map { DevicePreset(PreviewDevice.MOBILE, it.first, it.second) } + listOf(
    600 to 960, 768 to 1024, 820 to 1180, 1024 to 1366,
).map { DevicePreset(PreviewDevice.TABLET, it.first, it.second) } + listOf(
    1280 to 800, 1366 to 768, 1440 to 900, 1600 to 900, 1920 to 1080,
).map { DevicePreset(PreviewDevice.DESKTOP, it.first, it.second) }

/** A simple, full-width preview used by the editor's split view. */
@Composable
fun SitePreview(root: String, entry: String, reloadKey: Int, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val controller = remember(root) { SitePreviewController(context, File(root), onConsole = {}, onUrl = {}) }
    DisposableEffect(controller) { onDispose { controller.destroy() } }
    LaunchedEffect(controller, entry) { controller.load(entry) }
    LaunchedEffect(reloadKey) { if (reloadKey > 0) controller.webView.reload() }
    AndroidView(factory = { controller.webView.apply { layoutParams = ViewGroup.LayoutParams(-1, -1) } }, modifier = modifier)
}

/**
 * Runs a website folder offline at real device widths. The WebView is laid out at the chosen
 * CSS-pixel width (so a desktop page really gets a 1280px viewport) and scaled to fit.
 */
@Composable
fun PreviewScreen(root: String, entry: String, defaultDevice: PreviewDevice, showConsoleDefault: Boolean, onBack: () -> Unit) {
    val context = LocalContext.current
    val console = remember { mutableStateListOf<ConsoleLine>() }
    var url by remember { mutableStateOf("") }
    val controller = remember(root) {
        SitePreviewController(context, File(root), onConsole = { line -> console.add(line); if (console.size > 500) console.removeAt(0) }, onUrl = { url = it })
    }
    DisposableEffect(controller) { onDispose { controller.destroy() } }
    LaunchedEffect(controller) { controller.load(entry) }

    var group by remember { mutableStateOf(defaultDevice) }
    var preset by remember { mutableStateOf(devicePresets.first { it.group == defaultDevice && (it.width == 390 || it.width == 768 || it.width == 1280) }) }
    var custom by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var landscape by remember { mutableStateOf(false) }
    var zoom by remember { mutableFloatStateOf(0f) } // 0 = fit to screen
    var frame by remember { mutableStateOf(true) }
    var fullScreen by remember { mutableStateOf(false) }
    var consoleOpen by remember { mutableStateOf(showConsoleDefault && false) }
    var menu by remember { mutableStateOf(false) }
    var customOpen by remember { mutableStateOf(false) }
    BackHandler { if (fullScreen) fullScreen = false else if (controller.webView.canGoBack()) controller.webView.goBack() else onBack() }

    val base = custom ?: (preset.width to preset.height)
    val (w, h) = if (landscape) base.second to base.first else base
    val errors = console.count { it.level == "ERROR" }

    Scaffold(
        topBar = {
            if (!fullScreen) TopAppBar(
                title = {
                    Column {
                        Text("Preview", maxLines = 1)
                        Text(url.substringAfter("/site/").ifEmpty { entry }, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Rounded.Close, "Close preview") } },
                actions = {
                    IconButton(onClick = { controller.webView.goBack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
                    IconButton(onClick = { controller.webView.goForward() }) { Icon(Icons.AutoMirrored.Rounded.ArrowForward, "Forward") }
                    IconButton(onClick = { controller.webView.reload() }) { Icon(Icons.Rounded.Refresh, "Refresh") }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "More") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text("Hard refresh") }, onClick = { menu = false; console.clear(); controller.hardRefresh() })
                            DropdownMenuItem(text = { Text("Run from start") }, onClick = { menu = false; console.clear(); controller.load(entry) })
                            DropdownMenuItem(text = { Text("Custom size…") }, onClick = { menu = false; customOpen = true })
                            DropdownMenuItem(text = { Text(if (frame) "Hide device frame" else "Show device frame") }, onClick = { menu = false; frame = !frame })
                            DropdownMenuItem(text = { Text("Zoom in") }, onClick = { menu = false; zoom = ((if (zoom == 0f) 0.5f else zoom) * 1.25f).coerceAtMost(3f) })
                            DropdownMenuItem(text = { Text("Zoom out") }, onClick = { menu = false; zoom = ((if (zoom == 0f) 0.5f else zoom) / 1.25f).coerceAtLeast(0.1f) })
                            DropdownMenuItem(text = { Text("Fit to screen") }, onClick = { menu = false; zoom = 0f })
                            DropdownMenuItem(text = { Text("Actual size (100%)") }, onClick = { menu = false; zoom = 1f })
                            DropdownMenuItem(text = { Text("Save screenshot") }, onClick = {
                                menu = false
                                val message = saveScreenshot(context, controller)
                                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                            })
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (!fullScreen) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PreviewDevice.entries.forEach { g ->
                        FilterChip(selected = group == g && custom == null, onClick = {
                            group = g; custom = null
                            preset = devicePresets.first { it.group == g && (it.width == 390 || it.width == 768 || it.width == 1280) }
                        }, label = { Text(g.label) })
                    }
                    IconButton(onClick = { landscape = !landscape }) { Icon(Icons.Rounded.ScreenRotation, "Rotate") }
                    IconButton(onClick = { fullScreen = true }) { Icon(Icons.Rounded.Fullscreen, "Full screen") }
                    FilterChip(selected = consoleOpen, onClick = { consoleOpen = !consoleOpen }, label = { Text(if (errors > 0) "Console ($errors errors)" else "Console") },
                        leadingIcon = { Icon(Icons.AutoMirrored.Rounded.Article, null) })
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    devicePresets.filter { it.group == group }.forEach { p ->
                        FilterChip(selected = custom == null && preset == p, onClick = { preset = p; custom = null }, label = { Text("${p.width}px") })
                    }
                    if (custom != null) FilterChip(selected = true, onClick = { customOpen = true }, label = { Text("${custom!!.first}×${custom!!.second}") })
                }
            }
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f).background(MaterialTheme.colorScheme.surfaceContainer), contentAlignment = Alignment.TopCenter) {
                val density = LocalDensity.current
                val availW = with(density) { constraints.maxWidth.toDp() }.value - 16f
                val availH = with(density) { constraints.maxHeight.toDp() }.value - 16f
                val fit = minOf(availW / w, availH / h, 1f)
                val scale = if (zoom == 0f) fit else zoom
                val scaledW = (w * scale).dp
                val scaledH = (h * scale).dp
                Box(
                    Modifier.padding(8.dp).requiredSize(scaledW, scaledH)
                        .then(if (frame) Modifier.border(2.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp)).clip(RoundedCornerShape(10.dp)) else Modifier),
                ) {
                    AndroidView(
                        factory = { ctx -> FrameLayout(ctx).apply { addView(controller.webView) } },
                        update = { container ->
                            val px = with(density) { 1.dp.toPx() }
                            val web = controller.webView
                            web.layoutParams = FrameLayout.LayoutParams((w * px).toInt(), (h * px).toInt())
                            web.pivotX = 0f
                            web.pivotY = 0f
                            web.scaleX = scale
                            web.scaleY = scale
                            container.clipChildren = true
                        },
                        modifier = Modifier.requiredSize(scaledW, scaledH),
                    )
                }
                Text(
                    "$w × $h · ${(scale * 100).toInt()}%",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
                )
                if (fullScreen) {
                    IconButton(onClick = { fullScreen = false }, modifier = Modifier.align(Alignment.TopEnd)) { Icon(Icons.Rounded.FullscreenExit, "Exit full screen") }
                }
            }
            if (consoleOpen && !fullScreen) {
                Surface(color = Color(0xFF111827)) {
                    Column(Modifier.fillMaxWidth().heightIn(max = 220.dp)) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Console", color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                            TextButton(onClick = { console.clear() }) { Text("Clear") }
                        }
                        LazyColumn(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                            items(console) { line ->
                                val color = when (line.level) {
                                    "ERROR" -> Color(0xFFF87171)
                                    "WARNING" -> Color(0xFFFBBF24)
                                    else -> Color(0xFFE5E7EB)
                                }
                                Text("${line.message}  ${line.source}", color = color, style = MonoStyle)
                            }
                        }
                    }
                }
            }
        }
    }

    if (customOpen) {
        var cw by remember { mutableStateOf(w.toString()) }
        var ch by remember { mutableStateOf(h.toString()) }
        AlertDialog(
            onDismissRequest = { customOpen = false },
            title = { Text("Custom size") },
            text = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(cw, { cw = it.filter(Char::isDigit).take(4) }, label = { Text("Width") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                    OutlinedTextField(ch, { ch = it.filter(Char::isDigit).take(4) }, label = { Text("Height") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val a = cw.toIntOrNull()?.coerceIn(200, 3840)
                    val b = ch.toIntOrNull()?.coerceIn(200, 3840)
                    if (a != null && b != null) { custom = a to b; landscape = false }
                    customOpen = false
                }) { Text("Apply") }
            },
            dismissButton = { TextButton(onClick = { customOpen = false }) { Text("Cancel") } },
        )
    }
}

/** Saves what the preview shows as a PNG in Pictures/FilePilot. Returns a message for the user. */
private fun saveScreenshot(context: Context, controller: SitePreviewController): String = runCatching {
    val web = controller.webView
    val bitmap = Bitmap.createBitmap(web.width.coerceAtLeast(1), web.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    web.draw(Canvas(bitmap))
    val name = "FilePilot_preview_${System.currentTimeMillis()}.png"
    if (Build.VERSION.SDK_INT >= 29) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/FilePilot")
        }
        val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: error("no uri")
        context.contentResolver.openOutputStream(uri)?.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    } else {
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "FilePilot").apply { mkdirs() }
        FileOutputStream(File(dir, name)).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    "Screenshot saved to Pictures/FilePilot."
}.getOrElse { "The screenshot couldn't be saved." }

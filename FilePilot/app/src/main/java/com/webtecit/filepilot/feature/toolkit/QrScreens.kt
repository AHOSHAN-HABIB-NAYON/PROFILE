@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.toolkit

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.FlashlightOff
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.graphics.drawable.toBitmap
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.PlanarYUVLuminanceSource
import com.webtecit.filepilot.R
import com.webtecit.filepilot.core.designsystem.Feedback
import com.webtecit.filepilot.core.designsystem.Palette
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ----- QR create ------------------------------------------------------------------------------

@Composable
fun QrCreateScreen(onBack: () -> Unit, onOpenFolder: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var kind by remember { mutableStateOf(QrKind.URL) }
    var barcode by remember { mutableStateOf(false) }
    val fields = remember { mutableStateMapOf<String, String>() }
    var color by remember { mutableStateOf(Color.Black) }
    var logo by remember { mutableStateOf(false) }
    val logoBitmap = remember { ContextCompat.getDrawable(context, R.drawable.ic_logo)?.toBitmap(160, 160) }
    val payload = if (barcode) fields["barcode"].orEmpty() else MediaTools.qrPayload(kind, fields)
    val image: Result<Bitmap> = remember(payload, color, logo, barcode) {
        runCatching {
            if (barcode) MediaTools.barcodeBitmap(payload, BarcodeFormat.CODE_128, 900, 360)
            else MediaTools.qrBitmap(payload, 900, color.toArgb(), android.graphics.Color.WHITE, if (logo) logoBitmap else null)
        }
    }
    val ready = image.isSuccess && payload.isNotBlank()

    fun save(share: Boolean) {
        val bmp = image.getOrNull() ?: return
        scope.launch {
            val file = withContext(Dispatchers.IO) {
                runCatching {
                    val f = MediaTools.uniqueFile(ToolOutput.pictures(), if (barcode) "Barcode" else "QR_${kind.label}", "png")
                    f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    f
                }
            }
            file.onSuccess { f ->
                if (share) {
                    com.webtecit.filepilot.core.storage.FileIntents.share(context, listOf(FileProvider.getUriForFile(context, "${context.packageName}.files", f)), listOf("image/png"))
                } else {
                    Feedback.saved("QR code saved", "Pictures/FilePilot/${f.name}")
                }
            }.onFailure {
                android.widget.Toast.makeText(context, "Couldn't save: ${it.message}", android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create QR code") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QrKind.entries.forEach { k ->
                    FilterChip(selected = !barcode && kind == k, onClick = { barcode = false; kind = k }, label = { Text(k.label) })
                }
                FilterChip(selected = barcode, onClick = { barcode = true }, label = { Text("Barcode") })
            }
            Surface(
                shape = RoundedCornerShape(22.dp), color = Color.White, shadowElevation = 4.dp,
                modifier = Modifier.fillMaxWidth().aspectRatio(if (barcode) 2.2f else 1.25f),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    val bmp = image.getOrNull()
                    if (bmp != null && payload.isNotBlank()) {
                        Image(bmp.asImageBitmap(), contentDescription = "QR code preview", modifier = Modifier.padding(16.dp).fillMaxSize())
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Rounded.QrCode2, null, tint = Color(0xFFB8C0D0), modifier = Modifier.size(72.dp))
                            Text(
                                if (payload.isBlank()) "Fill in the details below" else image.exceptionOrNull()?.message ?: "",
                                color = Color(0xFF6B7385), style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
            OptionCard(if (barcode) "Barcode (Code 128)" else kind.label) {
                if (barcode) {
                    Field(fields, "barcode", "Number or text")
                } else {
                    when (kind) {
                        QrKind.TEXT -> Field(fields, "text", "Text", single = false)
                        QrKind.URL -> Field(fields, "url", "Website, e.g. webtecit.com")
                        QrKind.WIFI -> {
                            Field(fields, "ssid", "Network name (SSID)")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("WPA", "WEP", "None").forEach { sec ->
                                    FilterChip(selected = (fields["security"] ?: "WPA") == sec, onClick = { fields["security"] = sec }, label = { Text(if (sec == "WPA") "WPA/WPA2" else sec) })
                                }
                            }
                            if ((fields["security"] ?: "WPA") != "None") Field(fields, "password", "Password")
                        }
                        QrKind.PHONE -> Field(fields, "phone", "Phone number")
                        QrKind.EMAIL -> {
                            Field(fields, "email", "Email address")
                            Field(fields, "subject", "Subject (optional)")
                            Field(fields, "body", "Message (optional)", single = false)
                        }
                        QrKind.SMS -> {
                            Field(fields, "phone", "Phone number")
                            Field(fields, "message", "Message", single = false)
                        }
                        QrKind.CONTACT -> {
                            Field(fields, "name", "Name")
                            Field(fields, "phone", "Phone")
                            Field(fields, "email", "Email")
                            Field(fields, "org", "Company (optional)")
                        }
                    }
                }
            }
            if (!barcode) {
                OptionCard("Style") {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        listOf(Color.Black, Palette.Navy, Palette.Purple, Palette.Green, Palette.Red).forEach { c ->
                            Box(
                                Modifier.size(36.dp).clip(CircleShape)
                                    .border(2.dp, if (c == color) MaterialTheme.colorScheme.primary else Color.Transparent, CircleShape)
                                    .padding(3.dp).clip(CircleShape).background(c).clickable { color = c },
                            )
                        }
                    }
                    Row(Modifier.fillMaxWidth().clickable { logo = !logo }, verticalAlignment = Alignment.CenterVertically) {
                        Text("FilePilot logo in the middle", modifier = Modifier.weight(1f))
                        Switch(checked = logo, onCheckedChange = { logo = it })
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { save(share = true) }, enabled = ready, shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f).height(50.dp)) {
                    Icon(Icons.Rounded.Share, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Share")
                }
                Button(onClick = { save(share = false) }, enabled = ready, shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f).height(50.dp).testTag("qr_save")) {
                    Icon(Icons.Rounded.Save, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Save PNG")
                }
            }
            TextButton(onClick = { onOpenFolder(ToolOutput.pictures().absolutePath) }) { Text("Open Pictures/FilePilot") }
        }
    }
}

@Composable
private fun Field(fields: MutableMap<String, String>, key: String, label: String, single: Boolean = true) {
    OutlinedTextField(
        value = fields[key].orEmpty(), onValueChange = { fields[key] = it },
        label = { Text(label) }, singleLine = single, minLines = if (single) 1 else 3,
        modifier = Modifier.fillMaxWidth(),
    )
}

// ----- QR scan --------------------------------------------------------------------------------

private object QrHistory {
    private const val KEY = "qr_history"
    fun load(context: Context): List<String> = runCatching {
        val arr = org.json.JSONArray(context.getSharedPreferences("qr", Context.MODE_PRIVATE).getString(KEY, "[]"))
        List(arr.length()) { arr.getString(it) }
    }.getOrDefault(emptyList())

    fun add(context: Context, value: String): List<String> {
        val list = (listOf(value) + load(context).filterNot { it == value }).take(50)
        save(context, list)
        return list
    }

    fun save(context: Context, list: List<String>) {
        val arr = org.json.JSONArray()
        list.forEach { arr.put(it) }
        context.getSharedPreferences("qr", Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }
}

@Composable
fun QrScanScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var asked by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; asked = true }
    var result by remember { mutableStateOf<String?>(null) }
    var torch by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    val history = remember { mutableStateListOf<String>().apply { addAll(QrHistory.load(context)) } }
    val paused = remember { AtomicBoolean(false) }

    fun found(text: String) {
        if (result != null) return
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        result = text
        history.clear()
        history.addAll(QrHistory.add(context, text))
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val text = withContext(Dispatchers.IO) {
                runCatching {
                    MediaTools.decode({ context.contentResolver.openInputStream(uri)!! }, 1600)?.let { MediaTools.decode(it)?.text }
                }.getOrNull()
            }
            if (text != null) found(text) else android.widget.Toast.makeText(context, "No QR code or barcode found in that picture.", android.widget.Toast.LENGTH_LONG).show()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan QR code") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = {
                    if (granted && camera?.cameraInfo?.hasFlashUnit() == true) {
                        IconButton(onClick = { torch = !torch; camera?.cameraControl?.enableTorch(torch) }) {
                            Icon(if (torch) Icons.Rounded.FlashlightOn else Icons.Rounded.FlashlightOff, if (torch) "Turn torch off" else "Turn torch on")
                        }
                    }
                    IconButton(onClick = { imagePicker.launch("image/*") }) { Icon(Icons.Rounded.Image, "Scan a picture") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Box(Modifier.fillMaxWidth().weight(1f).background(Color.Black), contentAlignment = Alignment.Center) {
                if (granted) {
                    CameraPreview(
                        paused = paused,
                        onCamera = { camera = it },
                        onFound = { text -> scope.launch { found(text) } },
                    )
                    ScanFrame()
                } else {
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.PhotoCamera, null, tint = Color.White, modifier = Modifier.size(56.dp))
                        Spacer(Modifier.height(12.dp))
                        Text("Camera access is needed to scan", color = Color.White, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "The camera is used only while this screen is open. You can also scan a picture from your gallery.",
                            color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
                        )
                        Button(onClick = {
                            if (asked && !granted) {
                                context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
                            } else {
                                permission.launch(Manifest.permission.CAMERA)
                            }
                        }) { Text(if (asked) "Open app settings" else "Allow camera") }
                        TextButton(onClick = { imagePicker.launch("image/*") }) { Text("Scan a picture instead", color = Color.White) }
                    }
                }
            }
            if (history.isNotEmpty()) {
                Surface(color = MaterialTheme.colorScheme.surface) {
                    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Recent scans", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                            IconButton(onClick = { history.clear(); QrHistory.save(context, emptyList()) }) { Icon(Icons.Rounded.Delete, "Clear history") }
                        }
                        history.take(3).forEach { h ->
                            Text(
                                h, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { result = h }.padding(vertical = 8.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    val shown = result
    if (shown != null) {
        paused.set(true)
        ModalBottomSheet(onDismissRequest = { result = null; paused.set(false) }) {
            ScanResult(shown) { result = null; paused.set(false) }
        }
    }
}

@Composable
private fun CameraPreview(paused: AtomicBoolean, onCamera: (Camera) -> Unit, onFound: (String) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    DisposableEffect(owner) {
        val executor = Executors.newSingleThreadExecutor()
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        future.addListener({
            val p = runCatching { future.get() }.getOrNull() ?: return@addListener
            provider = p
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { image ->
                try {
                    if (!paused.get()) {
                        val plane = image.planes[0]
                        val buffer = plane.buffer
                        val data = ByteArray(buffer.remaining()).also { buffer.get(it) }
                        val source = PlanarYUVLuminanceSource(data, plane.rowStride, image.height, 0, 0, image.width, image.height, false)
                        MediaTools.decode(source)?.text?.let { text ->
                            paused.set(true)
                            ContextCompat.getMainExecutor(context).execute { onFound(text) }
                        }
                    }
                } catch (_: Exception) {
                    // a bad frame: wait for the next one
                } finally {
                    image.close()
                }
            }
            runCatching {
                p.unbindAll()
                onCamera(p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis))
            }
        }, ContextCompat.getMainExecutor(context))
        onDispose {
            provider?.unbindAll()
            executor.shutdown()
        }
    }
    AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
}

/** The square guide with corner brackets and a moving scan line. */
@Composable
private fun ScanFrame() {
    val t = rememberInfiniteTransition(label = "scan")
    val line by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1800, easing = LinearEasing), RepeatMode.Reverse), label = "line")
    val blue = Palette.Blue
    Canvas(Modifier.size(250.dp)) {
        val s = size.minDimension
        val corner = s * 0.16f
        val stroke = 5.dp.toPx()
        val c = Color.White
        // corners
        fun bracket(x: Float, y: Float, dx: Float, dy: Float) {
            drawLine(c, Offset(x, y), Offset(x + dx * corner, y), stroke)
            drawLine(c, Offset(x, y), Offset(x, y + dy * corner), stroke)
        }
        bracket(0f, 0f, 1f, 1f)
        bracket(s, 0f, -1f, 1f)
        bracket(0f, s, 1f, -1f)
        bracket(s, s, -1f, -1f)
        drawRoundRect(Color.White.copy(alpha = 0.15f), cornerRadius = CornerRadius(24f), style = Stroke(1.dp.toPx()), size = Size(s, s))
        val y = s * (0.08f + 0.84f * line)
        drawLine(blue, Offset(s * 0.08f, y), Offset(s * 0.92f, y), 3.dp.toPx())
        drawRect(blue.copy(alpha = 0.12f), topLeft = Offset(s * 0.08f, y - 18.dp.toPx() * (1 - line) ), size = Size(s * 0.84f, 18.dp.toPx() * (1 - line).coerceAtLeast(0.2f)))
    }
}

private enum class ScanType(val label: String) { URL("Link"), WIFI("WiFi"), PHONE("Phone"), EMAIL("Email"), SMS("SMS"), CONTACT("Contact"), TEXT("Text") }

private fun typeOf(text: String): ScanType {
    val lower = text.lowercase()
    return when {
        lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.") -> ScanType.URL
        lower.startsWith("wifi:") -> ScanType.WIFI
        lower.startsWith("tel:") -> ScanType.PHONE
        lower.startsWith("mailto:") || lower.startsWith("matmsg:") -> ScanType.EMAIL
        lower.startsWith("smsto:") || lower.startsWith("sms:") -> ScanType.SMS
        lower.startsWith("mecard:") || lower.startsWith("begin:vcard") -> ScanType.CONTACT
        else -> ScanType.TEXT
    }
}

/** Reads "KEY:value;" fields used by WiFi and MECARD codes, with backslash escapes. */
private fun fieldsOf(text: String): Map<String, String> {
    val body = text.substringAfter(':')
    val out = HashMap<String, String>()
    var key = StringBuilder()
    var value = StringBuilder()
    var inValue = false
    var escape = false
    for (ch in body) {
        when {
            escape -> { (if (inValue) value else key).append(ch); escape = false }
            ch == '\\' -> escape = true
            !inValue && ch == ':' -> inValue = true
            inValue && ch == ';' -> { out[key.toString().uppercase()] = value.toString(); key = StringBuilder(); value = StringBuilder(); inValue = false }
            else -> (if (inValue) value else key).append(ch)
        }
    }
    return out
}

@Composable
private fun ScanResult(text: String, onScanAgain: () -> Unit) {
    val context = LocalContext.current
    val type = typeOf(text)
    val fields = remember(text) { if (type == ScanType.WIFI || (type == ScanType.CONTACT && text.lowercase().startsWith("mecard:"))) fieldsOf(text) else emptyMap() }
    fun copy(value: String, label: String) {
        (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, value))
        android.widget.Toast.makeText(context, "$label copied", android.widget.Toast.LENGTH_SHORT).show()
    }
    fun open(uri: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            .onFailure { android.widget.Toast.makeText(context, "No app can open this.", android.widget.Toast.LENGTH_SHORT).show() }
    }
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Palette.Green.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                Icon(if (type == ScanType.WIFI) Icons.Rounded.Wifi else Icons.Rounded.QrCodeScanner, null, tint = Palette.Green)
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Found: ${type.label}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Scanned just now", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))) {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                if (type == ScanType.WIFI) {
                    Text("Network: ${fields["S"].orEmpty()}", fontWeight = FontWeight.SemiBold)
                    Text("Password: ${fields["P"].orEmpty().ifEmpty { "none" }}", fontFamily = FontFamily.Monospace)
                    Text("Security: ${fields["T"].orEmpty().ifEmpty { "open" }}", style = MaterialTheme.typography.bodySmall)
                } else {
                    Text(text, fontFamily = if (type == ScanType.TEXT) FontFamily.Default else FontFamily.Monospace, maxLines = 12, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when (type) {
                ScanType.URL -> Button(onClick = { open(if (text.startsWith("www.")) "https://$text" else text) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Open link")
                }
                ScanType.PHONE, ScanType.EMAIL -> Button(onClick = { open(text) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(if (type == ScanType.PHONE) "Call" else "Write email")
                }
                ScanType.SMS -> Button(onClick = {
                    val parts = text.substringAfter(':').split(':', limit = 2)
                    runCatching {
                        context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + parts[0])).putExtra("sms_body", parts.getOrNull(1).orEmpty()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }, modifier = Modifier.weight(1f)) { Text("Send SMS") }
                ScanType.WIFI -> Button(onClick = {
                    copy(fields["P"].orEmpty(), "WiFi password")
                    runCatching { context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }, modifier = Modifier.weight(1f)) { Icon(Icons.Rounded.Wifi, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Copy & connect") }
                ScanType.CONTACT -> Button(onClick = {
                    val intent = Intent(ContactsContract.Intents.Insert.ACTION).setType(ContactsContract.RawContacts.CONTENT_TYPE)
                        .putExtra(ContactsContract.Intents.Insert.NAME, fields["N"].orEmpty().replace(",", " "))
                        .putExtra(ContactsContract.Intents.Insert.PHONE, fields["TEL"].orEmpty())
                        .putExtra(ContactsContract.Intents.Insert.EMAIL, fields["EMAIL"].orEmpty())
                        .putExtra(ContactsContract.Intents.Insert.COMPANY, fields["ORG"].orEmpty())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }
                }, modifier = Modifier.weight(1f)) { Icon(Icons.Rounded.PersonAdd, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Add contact") }
                ScanType.TEXT -> Button(onClick = { copy(text, "Text") }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.ContentCopy, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Copy")
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (type != ScanType.TEXT) {
                OutlinedButton(onClick = { copy(text, "Text") }, modifier = Modifier.weight(1f)) { Icon(Icons.Rounded.ContentCopy, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Copy") }
            }
            OutlinedButton(onClick = {
                runCatching { context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }, modifier = Modifier.weight(1f)) { Icon(Icons.Rounded.Share, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Share") }
        }
        TextButton(onClick = onScanAgain, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Scan again") }
    }
}
